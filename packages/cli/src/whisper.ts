// Local speech-to-text with whisper.cpp's `whisper-cli` for `blook transcribe --method whisper`.
// whisper-cli reads WAV, not WebM/Opus: the chunks are decoded to 16 kHz mono in headless
// Chromium (the browser the replay already uses, same decoder as the extension), so there is
// no ffmpeg dependency. Word times come from DTW token timestamps (-dtw), which line up with
// the audio far better than whisper's segment-based token offsets.
import { spawnSync } from 'node:child_process';
import { accessSync, constants, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { availableParallelism, homedir } from 'node:os';
import { basename, delimiter, join } from 'node:path';
import type { SttResult } from '@blook/core/transcript';
import { launchBrowser } from './browser.ts';
import { CliError, EXIT } from './errors.ts';
import { note } from './output.ts';

/** Default local model: English-only base, 148 MB. Fast on a laptop CPU; small.en (488 MB) is a little more accurate. */
export const DEFAULT_WHISPER_MODEL = 'base.en';
const MODEL_URL = (name: string) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${name}.bin`;
export const modelsDir = () => process.env.BLOOK_MODELS_DIR || join(homedir(), 'Blook', 'models');

export const WHISPER_INSTALL_HINT =
  'Install whisper.cpp: `brew install whisper-cpp` (macOS, Linuxbrew), or build it from https://github.com/ggml-org/whisper.cpp and put `whisper-cli` on PATH (or set BLOOK_WHISPER_CLI).';

/** whisper-cli on PATH (or BLOOK_WHISPER_CLI). Older builds call it `whisper-cpp`. */
export function findWhisperCli(): string | undefined {
  const own = process.env.BLOOK_WHISPER_CLI;
  if (own) return own;
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const name of ['whisper-cli', 'whisper-cpp']) {
      const p = join(dir, name);
      try {
        accessSync(p, constants.X_OK);
        return p;
      } catch {}
    }
  }
  return undefined;
}

/** A model name (`base.en`, `small`) or a path to a ggml .bin file. Downloads a named model on first use. */
export async function ensureModel(model: string): Promise<{ path: string; name: string }> {
  if (model.includes('/') || model.endsWith('.bin')) {
    if (!existsSync(model))
      throw new CliError(`Whisper model not found: ${model}`, EXIT.notFound, 'Pass a ggml model file, or a model name such as base.en.');
    return {
      path: model,
      name: basename(model)
        .replace(/^ggml-/, '')
        .replace(/\.bin$/, ''),
    };
  }
  if (!/^[\w.-]+$/.test(model))
    throw new CliError(`Bad model name "${model}".`, EXIT.usage, 'Use a whisper.cpp model name such as base.en, small.en or small.');
  const path = join(modelsDir(), `ggml-${model}.bin`);
  if (existsSync(path)) return { path, name: model };

  const url = MODEL_URL(model);
  note(`Downloading whisper model ${model} to ${path} (once)`);
  mkdirSync(modelsDir(), { recursive: true });
  const part = `${path}.part`;
  try {
    const res = await fetch(url);
    if (res.status === 404)
      throw new CliError(
        `No whisper.cpp model named "${model}".`,
        EXIT.usage,
        'Use a name from https://huggingface.co/ggerganov/whisper.cpp, e.g. base.en, small.en, small.',
      );
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const out = createWriteStream(part);
    let got = 0;
    let shown = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      got += chunk.length;
      if (total && got / total >= shown + 0.25) note(`  ${Math.round((shown += 0.25) * 100)}% of ${(total / 1e6).toFixed(0)} MB`);
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
    renameSync(part, path);
  } catch (e) {
    rmSync(part, { force: true });
    if (e instanceof CliError) throw e;
    throw new CliError(
      `Downloading ${url} failed: ${e instanceof Error ? e.message : e}`,
      EXIT.network,
      'Check the network and run it again, or pass --model <path to a ggml .bin>.',
    );
  }
  return { path, name: model };
}

/** Decodes WebM/Opus chunks to 16 kHz mono PCM in headless Chromium. */
export async function decodeAudio(files: Uint8Array[]): Promise<Float32Array[]> {
  const browser = await launchBrowser('No browser to decode the audio in.');
  try {
    const page = await browser.newPage();
    const out: Float32Array[] = [];
    for (const file of files) {
      const b64: string = await page.evaluate(async (data) => {
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const audio = await new OfflineAudioContext(1, 16_000, 16_000).decodeAudioData(bytes.buffer);
        const f = audio.getChannelData(0);
        const pcm = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(f[i]! * 32767)));
        const u8 = new Uint8Array(pcm.buffer);
        let s = '';
        for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
        return btoa(s);
      }, Buffer.from(file).toString('base64'));
      const bytes = Buffer.from(b64, 'base64');
      const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
      out.push(Float32Array.from(pcm, (v) => v / 32768));
    }
    return out;
  } finally {
    await browser.close();
  }
}

/** 16-bit PCM WAV, 16 kHz mono. */
export function wav(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(16_000, 24);
  buf.writeUInt32LE(32_000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
  return buf;
}

/** whisper.cpp's DTW preset for a model name (`base.en-q5_1` → `base.en`, `large-v3-turbo` → `large.v3.turbo`). */
export function dtwPreset(name: string): string | undefined {
  const base = name
    .replace(/-q\d.*$/, '')
    .replace(/^large-/, 'large.')
    .replace(/-turbo$/, '.turbo');
  const presets = [
    'tiny',
    'tiny.en',
    'base',
    'base.en',
    'small',
    'small.en',
    'medium',
    'medium.en',
    'large.v1',
    'large.v2',
    'large.v3',
    'large.v3.turbo',
  ];
  return presets.includes(base) ? base : undefined;
}

/** Runs whisper-cli once on all WAV files (one model load) and returns each file's JSON (-ojf). */
export function runWhisper(cli: string, model: { path: string; name: string }, wavPaths: string[]): WhisperJson[] {
  const args = ['-m', model.path, '-ojf', '-np', '-t', String(Math.min(8, availableParallelism()))];
  args.push('-l', model.name.includes('.en') ? 'en' : 'auto');
  const dtw = dtwPreset(model.name);
  if (dtw) args.push('-dtw', dtw, '-nfa'); // DTW needs flash attention off (on by default since 1.8)
  const run = (a: string[]) => spawnSync(cli, [...a, ...wavPaths], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let res = run(args);
  // Builds before 1.8 have no -nfa (flash attention was off anyway).
  if (res.status !== 0 && /-nfa/.test(res.stderr ?? '')) res = run(args.filter((x) => x !== '-nfa'));
  if (res.error) throw new CliError(`Can't run ${cli}: ${res.error.message}`, EXIT.transcriber, WHISPER_INSTALL_HINT);
  if (res.status !== 0)
    throw new Error(`whisper-cli exited with ${res.status}: ${(res.stderr || '').trim().split('\n').slice(-3).join(' ')}`);
  return wavPaths.map((p) => JSON.parse(readFileSync(`${p}.json`, 'utf8')));
}

export interface WhisperJson {
  transcription: {
    offsets: { from: number; to: number };
    text: string;
    tokens?: { text: string; offsets: { from: number; to: number }; t_dtw?: number }[];
  }[];
}

/** A word never lasts longer than this when its end is a guess (the next word's start). */
const MAX_WORD_MS = 1500;

/**
 * whisper-cli -ojf output to the OpenRouter verbose_json shape (seconds from the chunk start).
 * Tokens that start with a space start a word; the rest (subwords, punctuation) join it. With DTW
 * (`t_dtw`, in 10 ms units) a word starts at its first token and ends where the next one starts.
 */
export function whisperToStt(json: WhisperJson): SttResult {
  const words: { word: string; start: number; end: number; dtw: boolean; segEnd: number; seg: number }[] = [];
  json.transcription.forEach((seg, segIndex) => {
    let cur: (typeof words)[number] | undefined;
    for (const tok of seg.tokens ?? []) {
      if (/^\[_[A-Z]+_?\d*\]$/.test(tok.text)) continue; // [_BEG_], [_TT_150], …
      const dtw = typeof tok.t_dtw === 'number' && tok.t_dtw >= 0;
      const start = dtw ? tok.t_dtw! * 10 : tok.offsets.from;
      if (!cur || tok.text.startsWith(' ')) {
        cur = { word: tok.text.trim(), start, end: tok.offsets.to, dtw, segEnd: seg.offsets.to, seg: segIndex };
        words.push(cur);
      } else {
        cur.word += tok.text;
        cur.end = tok.offsets.to;
      }
    }
  });
  const timed = words
    .filter((w) => w.word)
    .map((w, i, all) => {
      let end = w.end;
      if (w.dtw) {
        const next = all[i + 1]?.start ?? w.segEnd;
        end = Math.min(Math.max(next, w.start), w.start + MAX_WORD_MS);
      }
      return { ...w, end: Math.max(end, w.start) };
    });
  // With DTW times a segment spans its own words, so each word lands in the segment whose text has it.
  const segments = json.transcription.map((s, i) => {
    const own = timed.filter((w) => w.seg === i && w.dtw);
    const [from, to] = own.length ? [own[0]!.start, own.at(-1)!.end] : [s.offsets.from, s.offsets.to];
    return { start: from / 1000, end: to / 1000, text: s.text.trim() };
  });
  const out = timed.map((w) => ({ word: w.word, start: w.start / 1000, end: w.end / 1000 }));
  return { text: segments.map((s) => s.text).join(' '), segments, words: out };
}

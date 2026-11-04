// `blook transcribe` engine: transcribe a bundle's audio chunks and rewrite transcript.json plus
// what derives from it (timeline.json speech entries, session.json transcript, counts, files).
// The mapping to session ms and the output shapes are the extension's (@blook/core/transcript).
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import {
  chunkTranscript,
  mergeChunks,
  MIN_CHUNK_BYTES,
  replaceSpeech,
  transcriptFileNote,
  transcriptJson,
  transcriptSummary,
  type SttResult,
  type TranscriptOut,
  type TranscriptSource,
} from '@blook/core/transcript';
import { openRouterTranscribe, OPENROUTER_ENDPOINT } from '@blook/core/openrouter';
import { voicedRanges, type Range } from '@blook/core/vad';
import { TRANSCRIPTION_MODEL, type TranscriptChunkResult } from '@blook/core/types';
import { bundleFolder, PASS_A_BUNDLE } from './bundle.ts';
import { CliError, EXIT } from './errors.ts';
import { note, warn } from './output.ts';
import {
  DEFAULT_WHISPER_MODEL,
  decodeAudio,
  ensureModel,
  findWhisperCli,
  runWhisper,
  wav,
  whisperToStt,
  WHISPER_INSTALL_HINT,
  type WhisperJson,
} from './whisper.ts';
import pkg from '../package.json' with { type: 'json' };

export type Method = 'openrouter' | 'whisper';

export interface TranscribeOptions {
  method?: Method;
  model?: string;
  force?: boolean;
  out?: string;
}

/** The bundle's files by path inside the bundle folder, and where they came from. */
interface BundleFiles {
  kind: 'zip' | 'folder';
  /** The zip file, or the bundle folder. */
  path: string;
  /** Folder prefix inside the zip (`blook-<id>/`). */
  prefix: string;
  files: Map<string, Uint8Array>;
}

function readBundleFiles(path: string): BundleFiles {
  if (!existsSync(path)) throw new CliError(`Bundle not found: ${path}`, EXIT.notFound, PASS_A_BUNDLE);
  if (statSync(path).isDirectory()) {
    const dir = bundleFolder(path);
    const files = new Map<string, Uint8Array>();
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else files.set(relative(dir, p).split('\\').join('/'), readFileSync(p));
      }
    };
    walk(dir);
    if (!files.has('session.json')) throw new CliError(`Not a Blook bundle: no session.json in ${dir}.`, EXIT.notFound, PASS_A_BUNDLE);
    return { kind: 'folder', path: dir, prefix: '', files };
  }
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(readFileSync(path));
  } catch {
    throw new CliError(`Not a Blook bundle: ${path} is not a zip file.`, EXIT.notFound, PASS_A_BUNDLE);
  }
  const sessionEntry = Object.keys(raw).find((n) => n === 'session.json' || /^[^/]+\/session\.json$/.test(n));
  if (!sessionEntry) throw new CliError(`Not a Blook bundle: no session.json in ${path}.`, EXIT.notFound, PASS_A_BUNDLE);
  const prefix = sessionEntry.slice(0, -'session.json'.length);
  const files = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(raw))
    if (name.startsWith(prefix) && !name.endsWith('/')) files.set(name.slice(prefix.length), data);
  return { kind: 'zip', path, prefix, files };
}

/** Writes via a temp file and a rename, so a crash never leaves a half-written file. */
function writeAtomic(path: string, data: Uint8Array) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

/** Writes the bundle back in place, or to `out` (a .zip path, else a folder). Returns where. */
function writeBundleFiles(b: BundleFiles, changed: string[], out?: string): string {
  const target = out ?? b.path;
  const asZip = out ? out.endsWith('.zip') : b.kind === 'zip';
  if (asZip) {
    const prefix = b.prefix || (b.kind === 'folder' ? `${b.path.split('/').pop()}/` : '');
    const zippable: Zippable = {};
    for (const [name, data] of b.files) zippable[prefix + name] = [data, { level: name.endsWith('.webm') ? 0 : 6 }];
    writeAtomic(target, zipSync(zippable));
  } else {
    // In place only the changed files; a new folder gets all of them.
    for (const name of out ? b.files.keys() : changed) writeAtomic(join(target, name), b.files.get(name)!);
  }
  return target;
}

interface AudioChunk {
  index: number;
  t: number;
  endT: number;
  durationMs: number;
  voiced?: Range[];
  mimeType: string;
  file: string;
}

export interface TranscribeSummary {
  path: string;
  skipped: boolean;
  status: TranscriptOut['status'];
  note?: string;
  method?: string;
  model?: string;
  segments: number;
  words: number;
  chunks: number;
  errors?: TranscriptOut['errors'];
  elapsedMs: number;
  source?: TranscriptSource;
}

export async function transcribeBundle(bundlePath: string, opts: TranscribeOptions): Promise<TranscribeSummary> {
  const started = Date.now();
  const b = readBundleFiles(bundlePath);
  const read = <T>(name: string): T | undefined => {
    const data = b.files.get(name);
    if (!data) return undefined;
    try {
      return JSON.parse(strFromU8(data)) as T;
    } catch {
      throw new CliError(`Not a Blook bundle: ${name} in ${b.path} is not valid JSON.`, EXIT.notFound, PASS_A_BUNDLE);
    }
  };
  const session = read<any>('session.json');
  if (session?.format !== 'blook-bundle') {
    throw new CliError(`Not a Blook bundle: ${b.path} has a session.json without "format": "blook-bundle".`, EXIT.notFound, PASS_A_BUNDLE);
  }
  const chunks = (read<AudioChunk[]>('audio/chunks.json') ?? []).filter((c) => b.files.has(c.file));
  if (!chunks.length) {
    throw new CliError(
      `No audio in ${b.path}: nothing to transcribe.`,
      EXIT.notFound,
      `The mic recorded nothing (session.json .mic: ${JSON.stringify(session.mic ?? null)}).`,
    );
  }
  const existing = read<TranscriptOut>('transcript.json');
  const summary = (t: TranscriptOut, skipped: boolean, path: string): TranscribeSummary => ({
    path,
    skipped,
    status: t.status,
    ...(t.note ? { note: t.note } : {}),
    method: t.source?.method,
    model: t.source?.model,
    segments: t.segmentCount,
    words: t.wordCount,
    chunks: chunks.length,
    ...(t.errors?.length ? { errors: t.errors } : {}),
    elapsedMs: Date.now() - started,
    source: t.source,
  });
  if (existing?.status === 'ok' && !opts.force) {
    note(
      `transcript.json is already ok (${existing.source ? `${existing.source.method} ${existing.source.model}` : 'no source'}): skipped. Use --force to run it again.`,
    );
    return summary(existing, true, b.path);
  }

  const method = pickMethod(opts.method);
  const results = method === 'openrouter' ? await viaOpenRouter(b, chunks, opts) : await viaWhisper(b, chunks, opts);
  const merged = mergeChunks(results);
  const ok = results.filter((r) => !r.error).length;
  const t = transcriptJson(merged, chunks.length, ok ? {} : { status: 'failed', note: `failed: ${merged.errors?.[0]?.error}` });
  if (!ok) {
    // Keep whatever transcript the bundle had.
    throw new CliError(
      `Transcription failed: ${merged.errors?.[0]?.error}`,
      method === 'openrouter' ? EXIT.network : EXIT.error,
      method === 'openrouter'
        ? 'Check OPENROUTER_API_KEY and the network, or use --method whisper.'
        : 'Run with BLOOK_DEBUG=1 for details, or try --method openrouter.',
    );
  }
  if (t.errors?.length) warn(`${t.errors.length} of ${chunks.length} chunks failed: ${t.errors[0]!.error}`);

  // transcript.json, then what derives from it.
  const timeline = replaceSpeech(read<any[]>('timeline.json') ?? [], t.segments);
  session.transcript = transcriptSummary(t);
  session.counts = { ...session.counts, timeline: timeline.length, transcriptSegments: t.segmentCount };
  session.files = { ...session.files, 'transcript.json': transcriptFileNote(t.status) };
  const put = (name: string, v: unknown) => b.files.set(name, strToU8(JSON.stringify(v, null, 2)));
  put('transcript.json', t);
  put('timeline.json', timeline);
  put('session.json', session);
  const written = writeBundleFiles(b, ['transcript.json', 'timeline.json', 'session.json'], opts.out);
  return summary(t, false, written);
}

/** --method, else OpenRouter with a key, else whisper-cli when installed. */
function pickMethod(method?: Method): Method {
  if (method) return method;
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (findWhisperCli()) return 'whisper';
  throw new CliError(
    'No speech-to-text available: OPENROUTER_API_KEY is not set and whisper-cli is not installed.',
    EXIT.transcriber,
    `Either set OPENROUTER_API_KEY (https://openrouter.ai/keys) for --method openrouter, or install whisper.cpp for --method whisper (local): \`brew install whisper-cpp\`.`,
  );
}

const cliSource = (method: TranscriptSource['method'], model: string): TranscriptSource => ({
  method,
  model,
  by: 'cli',
  at: new Date().toISOString(),
  blookVersion: pkg.version,
});

/** chunks.json has voiced ranges in session ms; the mapping wants them from the chunk start. */
const relVoiced = (c: AudioChunk) => c.voiced?.map(([a, b]): Range => [a - c.t, b - c.t]);

function toResult(c: AudioChunk, res: SttResult, source: TranscriptSource, voiced = relVoiced(c)): TranscriptChunkResult {
  return { index: c.index, t: c.t, ...chunkTranscript({ t: c.t, durationMs: c.durationMs, voiced }, res), source };
}

const label = (c: AudioChunk, n: number) => `chunk ${c.index + 1}/${n} (${c.file}, ${(c.durationMs / 1000).toFixed(1)} s)`;

async function viaOpenRouter(b: BundleFiles, chunks: AudioChunk[], opts: TranscribeOptions): Promise<TranscriptChunkResult[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey)
    throw new CliError(
      'OPENROUTER_API_KEY is not set.',
      EXIT.transcriber,
      'Set it (https://openrouter.ai/keys), or use --method whisper for local transcription.',
    );
  const model = opts.model ?? TRANSCRIPTION_MODEL;
  const endpoint = process.env.BLOOK_OPENROUTER_URL || OPENROUTER_ENDPOINT;
  note(`Transcribing ${chunks.length} chunk(s) with OpenRouter ${model}`);
  const results: TranscriptChunkResult[] = [];
  let next = 0;
  // Three requests at a time, like the extension.
  await Promise.all(
    Array.from({ length: Math.min(3, chunks.length) }, async () => {
      while (next < chunks.length) {
        const c = chunks[next++]!;
        const data = b.files.get(c.file)!;
        const base = { index: c.index, t: c.t, segments: [], words: [] };
        if (data.length <= MIN_CHUNK_BYTES) {
          results.push(base);
          continue;
        }
        try {
          const blob = new Blob([new Uint8Array(data)], { type: c.mimeType });
          const res = await openRouterTranscribe(blob, c.file.split('/').pop()!, { apiKey, endpoint, model });
          const r = toResult(c, res, cliSource('openrouter', model));
          note(`  ${label(c, chunks.length)}: ${r.words.length} words`);
          results.push(r);
        } catch (e) {
          note(`  ${label(c, chunks.length)}: ${e instanceof Error ? e.message : e}`);
          results.push({ ...base, error: e instanceof Error ? e.message : String(e) });
        }
      }
    }),
  );
  return results;
}

async function viaWhisper(b: BundleFiles, chunks: AudioChunk[], opts: TranscribeOptions): Promise<TranscriptChunkResult[]> {
  const cli = findWhisperCli();
  if (!cli)
    throw new CliError(
      'whisper-cli is not installed.',
      EXIT.transcriber,
      `${WHISPER_INSTALL_HINT} Or set OPENROUTER_API_KEY for --method openrouter.`,
    );
  const model = await ensureModel(opts.model ?? DEFAULT_WHISPER_MODEL);
  note(`Decoding ${chunks.length} chunk(s) to 16 kHz WAV`);
  const pcm = await decodeAudio(chunks.map((c) => b.files.get(c.file)!));
  const tmp = mkdtempSync(join(tmpdir(), 'blook-whisper-'));
  note(`Transcribing with whisper.cpp ${model.name}`);
  try {
    const todo = chunks.flatMap((c, i) => (b.files.get(c.file)!.length > MIN_CHUNK_BYTES ? [i] : []));
    const wavs = todo.map((i) => {
      const p = join(tmp, `${String(chunks[i]!.index).padStart(3, '0')}.wav`);
      writeFileSync(p, wav(pcm[i]!));
      return p;
    });
    let out: (WhisperJson | Error)[];
    try {
      out = wavs.length ? runWhisper(cli, model, wavs) : [];
    } catch (e) {
      if (e instanceof CliError) throw e;
      out = wavs.map(() => (e instanceof Error ? e : new Error(String(e))));
    }
    return chunks.map((c, i) => {
      const base = { index: c.index, t: c.t, segments: [], words: [] };
      const k = todo.indexOf(i);
      if (k < 0) return base;
      const json = out[k]!;
      if (json instanceof Error) {
        note(`  ${label(c, chunks.length)}: ${json.message}`);
        return { ...base, error: json.message };
      }
      // Bundles from before the VAD have no voiced ranges: find them in the decoded audio.
      const r = toResult(c, whisperToStt(json), cliSource('whisper.cpp', model.name), relVoiced(c) ?? voicedRanges(pcm[i]!, 16_000));
      note(`  ${label(c, chunks.length)}: ${r.words.length} words`);
      return r;
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

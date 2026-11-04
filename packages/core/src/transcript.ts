// Transcript logic shared by the extension (its lib/transcribe/openrouter.ts, and bundle.ts here)
// and the CLI (`blook transcribe`): speech-to-text results to session ms, transcript.json, and
// the timeline's speech entries. Pure, so it runs in the service worker, under Bun and in tests.
import { alignWords, type Range } from './vad.ts';
import type { TranscriptChunkResult, TranscriptRow, TranscriptSegment, TranscriptWord } from './types.ts';

export type TranscriptStatus = 'ok' | 'partial' | 'pending' | 'none' | 'skipped' | 'failed';

/** How transcript.json was made. One transcript has one source: a run covers every chunk. */
export interface TranscriptSource {
  /** `openrouter`: OpenRouter speech-to-text. `whisper.cpp`: local whisper-cli. */
  method: 'openrouter' | 'whisper.cpp';
  /** OpenRouter model id, or the ggml model name (`base.en`). */
  model: string;
  /** Who ran it: the extension while recording, or `blook transcribe`. */
  by: 'extension' | 'cli';
  /** ISO time of the run (for the extension, when its last chunk was transcribed). */
  at: string;
  /** Blook version that ran it. */
  blookVersion: string;
}

/** A speech-to-text result for one chunk, times in seconds from the chunk start (OpenRouter verbose_json). */
export interface SttResult {
  text?: string;
  segments?: { start: number; end: number; text: string }[];
  words?: { word: string; start: number; end: number }[];
}

/** Chunks this small hold no speech worth transcribing. */
export const MIN_CHUNK_BYTES = 1000;

/** Text the model writes for silence or noise, not speech: `[BLANK_AUDIO]`, `(silence)`. */
const NON_SPEECH = /^\s*[[(][^\])]*[\])]\s*$/;

/**
 * Maps one chunk's result to session ms. Word and segment edges the model put in silence move
 * to the nearest voiced edge first (`voiced`: ranges in ms from the chunk start, see vad.ts).
 */
export function chunkTranscript(
  chunk: { t: number; durationMs: number; voiced?: Range[] },
  res: SttResult,
): { words: TranscriptWord[]; segments: TranscriptSegment[] } {
  const voiced = chunk.voiced ?? [];
  const rel = <T extends { start: number; end: number }>(list: T[]) =>
    alignWords(
      list.map((x) => ({ ...x, start: x.start * 1000, end: x.end * 1000 })),
      voiced,
    );
  const toSession = (ms: number) => Math.round(chunk.t + ms);
  const words: TranscriptWord[] = rel((res.words ?? []).filter((w) => w.word.trim() && !NON_SPEECH.test(w.word))).map((w) => ({
    word: w.word.trim(),
    start: toSession(w.start),
    end: toSession(w.end),
  }));
  let segments: TranscriptSegment[] = rel((res.segments ?? []).filter((s) => !NON_SPEECH.test(s.text))).map((s) => ({
    text: s.text.trim(),
    start: toSession(s.start),
    end: toSession(s.end),
  }));
  // A segment starts at its first word: the model often starts it over noise before the speech.
  for (const s of segments) {
    const first = words.find((w) => w.start >= s.start && w.start < s.end);
    if (first) s.start = first.start;
  }
  if (!segments.length && res.text?.trim() && !NON_SPEECH.test(res.text)) {
    segments = [{ text: res.text.trim(), start: chunk.t, end: chunk.t + chunk.durationMs }];
  }
  return { words, segments: segments.filter((s) => s.text) };
}

/** Merges per-chunk results into one transcript: segments and words in order, errors, source. */
export function mergeChunks(chunks: TranscriptChunkResult[]): Pick<TranscriptRow, 'segments' | 'words' | 'errors' | 'source' | 'chunks'> {
  const sorted = [...chunks].sort((a, b) => a.index - b.index);
  const ok = sorted.filter((c) => !c.error);
  const failed = sorted.filter((c) => c.error);
  // The newest run stands for the whole transcript.
  const source = sorted
    .map((c) => c.source)
    .filter((s) => !!s)
    .sort((a, b) => a!.at.localeCompare(b!.at))
    .at(-1);
  return {
    segments: ok.flatMap((c) => c.segments).sort((a, b) => a.start - b.start),
    words: ok.flatMap((c) => c.words).sort((a, b) => a.start - b.start),
    ...(failed.length ? { errors: failed.map((c) => ({ chunk: c.index, t: c.t, error: c.error! })) } : {}),
    ...(source ? { source } : {}),
    chunks: sorted,
  };
}

export interface SegmentOut {
  index: number;
  t: number;
  endT: number;
  durationMs: number;
  text: string;
  words: { word: string; t: number; endT: number }[];
}

/** transcript.json. */
export interface TranscriptOut {
  status: TranscriptStatus;
  note?: string;
  source?: TranscriptSource;
  errors?: { chunk: number; t: number; error: string }[];
  segmentCount: number;
  wordCount: number;
  segments: SegmentOut[];
}

/**
 * transcript.json from a merged transcript. `audioChunks` is the number of audio files, so a
 * transcript that covers fewer is `partial`. `status` and `note` override what's derived.
 */
export function transcriptJson(
  transcript: Pick<TranscriptRow, 'segments' | 'words' | 'errors' | 'source' | 'chunks'> | undefined,
  audioChunks: number,
  opts: { status?: TranscriptStatus; note?: string; micError?: string } = {},
): TranscriptOut {
  const segments: SegmentOut[] = (transcript?.segments ?? []).map((s, index) => ({
    index,
    t: s.start,
    endT: s.end,
    durationMs: s.end - s.start,
    text: s.text,
    words: [],
  }));
  for (const w of transcript?.words ?? []) {
    // The segment the word starts in, else the last one that started before it.
    let seg = segments.find((s) => w.start >= s.t && w.start < s.endT);
    seg ??= [...segments].reverse().find((s) => s.t <= w.start) ?? segments[0];
    seg?.words.push({ word: w.word, t: w.start, endT: w.end });
  }
  const errors = transcript?.errors;
  const covered = transcript?.chunks.filter((c) => !c.error).length ?? 0;
  const incomplete = !!transcript && (!!errors?.length || covered < audioChunks);
  const status: TranscriptStatus = opts.status ?? (transcript ? (incomplete ? 'partial' : 'ok') : 'none');
  let note = opts.note;
  if (status === 'partial' && !note && covered < audioChunks) {
    note = `${covered} of ${audioChunks} audio chunks transcribed${errors?.length ? `; failed: ${errors[0]!.error}` : ''}`;
  }
  if (status === 'none' && opts.micError) note = `no audio recorded: ${opts.micError}`;
  if (status === 'partial' && !note) note = `${errors?.length ?? 0} audio chunk(s) failed to transcribe`;
  const out: Omit<TranscriptOut, 'segmentCount' | 'wordCount' | 'segments'> = { status };
  if (note) out.note = note;
  if (transcript?.source) out.source = transcript.source;
  if (errors?.length) out.errors = errors.map(({ chunk, t, error }) => ({ chunk, t, error }));
  return { ...out, segmentCount: segments.length, wordCount: segments.reduce((n, s) => n + s.words.length, 0), segments };
}

/** session.json `.transcript`: the top of transcript.json. */
export function transcriptSummary(t: TranscriptOut): { status: TranscriptStatus; note?: string; source?: TranscriptSource } {
  return { status: t.status, ...(t.note ? { note: t.note } : {}), ...(t.source ? { source: t.source } : {}) };
}

/** session.json `.files['transcript.json']`. */
export const transcriptFileNote = (status: TranscriptStatus) =>
  `Narration: status "${status}", segments with words, all times in session ms; source says how it was made.`;

export interface SpeechEntry {
  t: number;
  type: 'speech';
  summary: string;
  text: string;
  endT: number;
  ref: { file: 'transcript.json'; segment: number };
}

/** timeline.json `speech` entries, one per segment. */
export function speechEntries(segments: SegmentOut[]): SpeechEntry[] {
  return segments.map((seg) => {
    const one = seg.text.replace(/\s+/g, ' ').trim();
    const text = one.length > 300 ? `${one.slice(0, 300)}…` : one;
    return {
      t: seg.t,
      type: 'speech',
      summary: `🗣 "${text}"`,
      text: seg.text,
      endT: seg.endT,
      ref: { file: 'transcript.json', segment: seg.index },
    };
  });
}

/** Swaps the speech entries of a timeline for new ones, keeping buildTimeline's order (speech last on ties). */
export function replaceSpeech<E extends { t: number; type: string }>(timeline: E[], segments: SegmentOut[]): (E | SpeechEntry)[] {
  const rest: (E | SpeechEntry)[] = timeline.filter((e) => e.type !== 'speech');
  return [...rest, ...speechEntries(segments)]
    .map((e, i) => [e, i] as const)
    .sort((a, b) => a[0].t - b[0].t || a[1] - b[1])
    .map(([e]) => e);
}

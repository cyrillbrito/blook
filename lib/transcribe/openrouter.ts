// Transcribes audio chunks with OpenRouter speech-to-text
// (POST /api/v1/audio/transcriptions, verbose_json with word and segment timestamps).
// Each chunk is transcribed as soon as it's saved (background), the rest after Stop,
// and Export only fills in what's missing. Results live per chunk in the transcripts store.
import { browser } from 'wxt/browser';
import { getBySession, openOverseerDB } from '../db';
import type { PanelMessage } from '../messages';
import { settingsItem } from '../settings';
import type {
  AudioChunkRow,
  SessionId,
  TranscriptChunkResult,
  TranscriptionStatus,
  TranscriptRow,
  TranscriptSegment,
  TranscriptWord,
} from '../types';

const ENDPOINT = 'https://openrouter.ai/api/v1/audio/transcriptions';
/** Dev/test only: a fake endpoint URL in storage.local under this key replaces OpenRouter. */
const ENDPOINT_OVERRIDE_KEY = 'overseer-stt-endpoint';
async function endpoint(): Promise<string> {
  const v = (await browser.storage.local.get(ENDPOINT_OVERRIDE_KEY))[ENDPOINT_OVERRIDE_KEY];
  return typeof v === 'string' && v ? v : ENDPOINT;
}
/** Chunks this small hold no speech worth a request. */
const MIN_CHUNK_BYTES = 1000;
const PARALLEL = 3;

interface VerboseResponse {
  text?: string;
  segments?: { start: number; end: number; text: string }[];
  words?: { word: string; start: number; end: number }[];
}

async function transcribeChunk(chunk: AudioChunkRow, apiKey: string, model: string) {
  const form = new FormData();
  const ext = chunk.mimeType.includes('ogg') ? 'ogg' : 'webm';
  form.append('file', new File([chunk.blob], `${String(chunk.index).padStart(3, '0')}.${ext}`, { type: chunk.mimeType.split(';')[0] }));
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');

  const json = await postWithRetry(form, apiKey);

  // Word and segment times are seconds from the chunk start.
  const at = (s: number) => Math.round(chunk.t + s * 1000);
  const words: TranscriptWord[] = (json.words ?? []).map((w) => ({ word: w.word.trim(), start: at(w.start), end: at(w.end) }));
  let segments: TranscriptSegment[] = (json.segments ?? []).map((s) => ({ text: s.text.trim(), start: at(s.start), end: at(s.end) }));
  if (!segments.length && json.text?.trim()) {
    segments = [{ text: json.text.trim(), start: chunk.t, end: chunk.t + (chunk.durationMs ?? 0) }];
  }
  return { words, segments: segments.filter((s) => s.text) };
}

/** POSTs once, and retries twice on network errors, 429 and 5xx with a growing pause. */
async function postWithRetry(form: FormData, apiKey: string): Promise<VerboseResponse> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt));
    let res: Response;
    try {
      res = await fetch(await endpoint(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'X-Title': 'Overseer' },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      lastError = new Error(`OpenRouter request failed: ${String((err as Error)?.message ?? err)}`);
      continue;
    }
    if (res.ok) {
      const text = await res.text();
      try {
        return JSON.parse(text) as VerboseResponse;
      } catch {
        throw new Error(`OpenRouter returned non-JSON: ${text.slice(0, 200)}`);
      }
    }
    lastError = new Error(`OpenRouter ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
    if (res.status !== 429 && res.status < 500) break; // auth, bad model, bad audio: retrying won't help
  }
  throw lastError ?? new Error('OpenRouter request failed');
}

/** Chunk transcriptions running in this worker, by `${sessionId}:${index}`. */
const inflight = new Map<string, Promise<void>>();
/** Serializes read-modify-write of transcript rows. */
let writeChain: Promise<unknown> = Promise.resolve();

function notify(sessionId: SessionId) {
  const msg: PanelMessage = { type: 'sessions/changed', sessionId };
  browser.runtime.sendMessage(msg).catch(() => {}); // no panel open
}

function isDone(r: TranscriptChunkResult | undefined, model: string) {
  return !!r && !r.error && r.model === model;
}

/** Old rows (before per-chunk results) count as complete when the model matches and nothing failed. */
function legacyComplete(row: TranscriptRow | undefined, model: string) {
  return !!row && !row.chunks && row.model === model && !row.errors?.length;
}

/** Stores one chunk result and re-merges segments, words and errors. */
function saveResult(sessionId: SessionId, model: string, result: TranscriptChunkResult): Promise<void> {
  const run = async () => {
    const db = await openOverseerDB();
    const row: TranscriptRow = (await db.get('transcripts', sessionId)) ?? { sessionId, model, segments: [], words: [] };
    const chunks = (row.chunks ?? []).filter((c) => c.index !== result.index);
    chunks.push(result);
    chunks.sort((a, b) => a.index - b.index);
    const ok = chunks.filter((c) => !c.error);
    const failed = chunks.filter((c) => c.error);
    const next: TranscriptRow = {
      sessionId,
      model,
      segments: ok.flatMap((c) => c.segments).sort((a, b) => a.start - b.start),
      words: ok.flatMap((c) => c.words).sort((a, b) => a.start - b.start),
      chunks,
    };
    if (failed.length) next.errors = failed.map((c) => ({ chunk: c.index, t: c.t, error: c.error! }));
    await db.put('transcripts', next);
  };
  const p = writeChain.then(run, run);
  writeChain = p.catch(() => {});
  return p;
}

/** Transcribes one chunk and stores the result (or its error). Concurrent calls share one run. */
function runChunk(chunk: AudioChunkRow, apiKey: string, model: string): Promise<void> {
  const key = `${chunk.sessionId}:${chunk.index}`;
  let run = inflight.get(key);
  if (run) return run;
  run = (async () => {
    let result: TranscriptChunkResult;
    if (chunk.blob.size <= MIN_CHUNK_BYTES) {
      result = { index: chunk.index, t: chunk.t, model, segments: [], words: [] };
    } else {
      try {
        result = { index: chunk.index, t: chunk.t, model, ...(await transcribeChunk(chunk, apiKey, model)) };
      } catch (err) {
        result = { index: chunk.index, t: chunk.t, model, segments: [], words: [], error: String((err as Error)?.message ?? err) };
      }
    }
    await saveResult(chunk.sessionId, model, result);
  })().finally(() => {
    inflight.delete(key);
    notify(chunk.sessionId);
  });
  inflight.set(key, run);
  notify(chunk.sessionId);
  return run;
}

/**
 * Called when the offscreen document saved a chunk: transcribes it in the background.
 * Without an API key it does nothing (Export or a later key picks it up).
 */
export async function transcribeChunkSoon(sessionId: SessionId, index: number): Promise<void> {
  const { openRouterApiKey, transcriptionModel } = await settingsItem.getValue();
  if (!openRouterApiKey) return notify(sessionId);
  const db = await openOverseerDB();
  const chunk = await db.get('audioChunks', [sessionId, index]);
  if (!chunk) return;
  await runChunk(chunk, openRouterApiKey, transcriptionModel);
}

/**
 * Transcribes every chunk that has no good result for the current model yet, then returns
 * the stored transcript. Undefined when there's no audio, or no key and nothing stored.
 * Throws only when no chunk could be transcribed at all.
 */
export async function ensureTranscript(sessionId: SessionId): Promise<TranscriptRow | undefined> {
  const db = await openOverseerDB();
  const { openRouterApiKey, transcriptionModel } = await settingsItem.getValue();
  const stored = await db.get('transcripts', sessionId);
  if (!openRouterApiKey) return stored;
  if (legacyComplete(stored, transcriptionModel)) return stored;

  const chunks = (await getBySession('audioChunks', sessionId)).sort((a, b) => a.index - b.index);
  if (!chunks.length) return stored;
  const results = new Map((stored?.chunks ?? []).map((c) => [c.index, c]));
  const missing = chunks.filter((c) => !isDone(results.get(c.index), transcriptionModel));

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, missing.length) }, async () => {
      while (next < missing.length) await runChunk(missing[next++]!, openRouterApiKey, transcriptionModel);
    }),
  );

  const row = await db.get('transcripts', sessionId);
  const okCount = row?.chunks?.filter((c) => !c.error).length ?? 0;
  if (!row || okCount === 0) throw new Error(row?.errors?.[0]?.error ?? 'transcription failed');
  return row;
}

/**
 * buildBundle options from what's stored, without starting any transcription. For pages that
 * show a session from IndexedDB (Replay). Export uses ensureTranscript first instead.
 */
export async function storedTranscriptOptions(sessionId: SessionId): Promise<{
  transcript?: TranscriptRow;
  transcriptStatus: 'ok' | 'partial' | 'pending' | 'none' | 'skipped' | 'failed';
  transcriptNote?: string;
}> {
  const db = await openOverseerDB();
  const transcript = await db.get('transcripts', sessionId);
  const s = await transcriptionStatus(sessionId);
  const progress = `${s.done} of ${s.total} audio chunks transcribed`;
  switch (s.state) {
    case 'none':
      return { transcript, transcriptStatus: 'none', transcriptNote: 'no audio recorded' };
    case 'done':
      return { transcript, transcriptStatus: transcript?.errors?.length ? 'partial' : 'ok' };
    case 'no-key':
      return s.done
        ? { transcript, transcriptStatus: 'partial', transcriptNote: `${progress}; no OpenRouter API key set for the rest` }
        : { transcript, transcriptStatus: 'skipped', transcriptNote: 'skipped: no OpenRouter API key set' };
    case 'pending':
    case 'transcribing':
      return { transcript, transcriptStatus: 'pending', transcriptNote: `transcribing: ${progress}` };
    case 'partial':
      return { transcript, transcriptStatus: 'partial', transcriptNote: `${progress}; failed: ${s.error}` };
    case 'failed':
      return { transcript, transcriptStatus: 'failed', transcriptNote: `failed: ${s.error}` };
  }
}

/** Progress for the side panel's session row. */
export async function transcriptionStatus(sessionId: SessionId): Promise<TranscriptionStatus> {
  const db = await openOverseerDB();
  const [total, row, settings] = await Promise.all([
    db.countFromIndex('audioChunks', 'bySession', sessionId),
    db.get('transcripts', sessionId),
    settingsItem.getValue(),
  ]);
  const model = settings.transcriptionModel;
  if (total === 0) return { state: 'none', done: 0, total };
  const done = legacyComplete(row, model) ? total : (row?.chunks?.filter((c) => isDone(c, model)).length ?? 0);
  const running = [...inflight.keys()].some((k) => k.startsWith(`${sessionId}:`));
  const error = row?.chunks?.find((c) => c.error)?.error;
  if (running) return { state: 'transcribing', done, total };
  if (done >= total) return { state: 'done', done, total };
  if (!settings.openRouterApiKey) return { state: 'no-key', done, total };
  if (error) return { state: done > 0 ? 'partial' : 'failed', done, total, error };
  return { state: 'pending', done, total };
}

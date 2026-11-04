// Transcribes audio chunks with OpenRouter speech-to-text
// (POST /api/v1/audio/transcriptions, verbose_json with word and segment timestamps).
// Each chunk is transcribed as soon as it's saved (background), the rest after Stop,
// and Export only fills in what's missing. Results live per chunk in the transcripts store.
import { browser } from 'wxt/browser';
import { chunkTranscript, mergeChunks, MIN_CHUNK_BYTES, type TranscriptSource } from './transcript';
import { openRouterTranscribe, OPENROUTER_ENDPOINT } from './openrouter-api';
import { getBySession, openBlookDB } from '../db';
import type { PanelMessage } from '../messages';
import { settingsItem } from '../settings';
import type { AudioChunkRow, SessionId, TranscriptChunkResult, TranscriptionStatus, TranscriptRow } from '../types';
import { TRANSCRIPTION_MODEL } from '../types';

/** Dev/test only: a fake endpoint URL in storage.local under this key replaces OpenRouter. */
const ENDPOINT_OVERRIDE_KEY = 'blook-stt-endpoint';
async function endpoint(): Promise<string> {
  const v = (await browser.storage.local.get(ENDPOINT_OVERRIDE_KEY))[ENDPOINT_OVERRIDE_KEY];
  return typeof v === 'string' && v ? v : OPENROUTER_ENDPOINT;
}
const PARALLEL = 3;

async function transcribeChunk(chunk: AudioChunkRow, apiKey: string) {
  const ext = chunk.mimeType.includes('ogg') ? 'ogg' : 'webm';
  const name = `${String(chunk.index).padStart(3, '0')}.${ext}`;
  const res = await openRouterTranscribe(chunk.blob, name, { apiKey, endpoint: await endpoint() });
  const source: TranscriptSource = {
    method: 'openrouter',
    model: TRANSCRIPTION_MODEL,
    by: 'extension',
    at: new Date().toISOString(),
    blookVersion: browser.runtime.getManifest().version,
  };
  // Times are seconds from the chunk start: chunkTranscript pulls them out of silence with the
  // chunk's voiced ranges and shifts them to session time.
  return { ...chunkTranscript(chunk, res), source };
}

/** Chunk transcriptions running in this worker, by `${sessionId}:${index}`. */
const inflight = new Map<string, Promise<void>>();
/** Serializes read-modify-write of transcript rows. */
let writeChain: Promise<unknown> = Promise.resolve();

function notify(sessionId: SessionId) {
  const msg: PanelMessage = { type: 'sessions/changed', sessionId };
  browser.runtime.sendMessage(msg).catch(() => {}); // no panel open
}

function isDone(r: TranscriptChunkResult | undefined) {
  return !!r && !r.error;
}

/** Stores one chunk result and re-merges segments, words and errors. */
function saveResult(sessionId: SessionId, result: TranscriptChunkResult): Promise<void> {
  const run = async () => {
    const db = await openBlookDB();
    const row = await db.get('transcripts', sessionId);
    const chunks = (row?.chunks ?? []).filter((c) => c.index !== result.index);
    chunks.push(result);
    const next: TranscriptRow = { sessionId, ...mergeChunks(chunks) };
    await db.put('transcripts', next);
  };
  const p = writeChain.then(run, run);
  writeChain = p.catch(() => {});
  return p;
}

/** Transcribes one chunk and stores the result (or its error). Concurrent calls share one run. */
function runChunk(chunk: AudioChunkRow, apiKey: string): Promise<void> {
  const key = `${chunk.sessionId}:${chunk.index}`;
  let run = inflight.get(key);
  if (run) return run;
  run = (async () => {
    const base = { index: chunk.index, t: chunk.t, segments: [], words: [] };
    let result: TranscriptChunkResult = base;
    if (chunk.blob.size > MIN_CHUNK_BYTES) {
      try {
        result = { ...base, ...(await transcribeChunk(chunk, apiKey)) };
      } catch (err) {
        result = { ...base, error: String((err as Error)?.message ?? err) };
      }
    }
    await saveResult(chunk.sessionId, result);
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
  const { openRouterApiKey } = await settingsItem.getValue();
  if (!openRouterApiKey) return notify(sessionId);
  const db = await openBlookDB();
  const chunk = await db.get('audioChunks', [sessionId, index]);
  if (!chunk) return;
  await runChunk(chunk, openRouterApiKey);
}

/**
 * Transcribes every chunk that has no good result yet, then returns
 * the stored transcript. Undefined when there's no audio, or no key and nothing stored.
 * Throws only when no chunk could be transcribed at all.
 */
export async function ensureTranscript(sessionId: SessionId): Promise<TranscriptRow | undefined> {
  const db = await openBlookDB();
  const { openRouterApiKey } = await settingsItem.getValue();
  const stored = await db.get('transcripts', sessionId);
  if (!openRouterApiKey) return stored;

  const chunks = (await getBySession('audioChunks', sessionId)).sort((a, b) => a.index - b.index);
  if (!chunks.length) return stored;
  const results = new Map((stored?.chunks ?? []).map((c) => [c.index, c]));
  const missing = chunks.filter((c) => !isDone(results.get(c.index)));

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, missing.length) }, async () => {
      while (next < missing.length) await runChunk(missing[next++]!, openRouterApiKey);
    }),
  );

  const row = await db.get('transcripts', sessionId);
  const okCount = row?.chunks.filter((c) => !c.error).length ?? 0;
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
  const db = await openBlookDB();
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
  const db = await openBlookDB();
  const [total, row, settings] = await Promise.all([
    db.countFromIndex('audioChunks', 'bySession', sessionId),
    db.get('transcripts', sessionId),
    settingsItem.getValue(),
  ]);
  if (total === 0) return { state: 'none', done: 0, total };
  const done = row?.chunks.filter((c) => isDone(c)).length ?? 0;
  const running = [...inflight.keys()].some((k) => k.startsWith(`${sessionId}:`));
  const error = row?.chunks.find((c) => c.error)?.error;
  if (running) return { state: 'transcribing', done, total };
  if (done >= total) return { state: 'done', done, total };
  if (!settings.openRouterApiKey) return { state: 'no-key', done, total };
  if (error) return { state: done > 0 ? 'partial' : 'failed', done, total, error };
  return { state: 'pending', done, total };
}

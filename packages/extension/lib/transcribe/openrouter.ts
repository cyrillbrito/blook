// Transcribes audio chunks with OpenRouter speech-to-text
// (POST /api/v1/audio/transcriptions, verbose_json with word and segment timestamps).
// Each chunk is transcribed as soon as it's saved (background), the rest after Stop,
// and Export only fills in what's missing. Results live per chunk in the transcripts store.
import { browser } from 'wxt/browser';
import { chunkResult, chunkTranscript, mergeChunks, type TranscriptSource } from '@blook/core/transcript';
import type { BundleOptions } from '@blook/core/bundle';
import { openRouterEach, openRouterTranscribe, OPENROUTER_ENDPOINT } from '@blook/core/openrouter';
import { getBySession, openBlookDB } from '../db';
import type { PanelMessage } from '../messages';
import { settingsItem } from '../settings';
import type { AudioChunkRow, SessionId, TranscriptChunkResult, TranscriptionStatus, TranscriptRow } from '@blook/core/types';
import { TRANSCRIPTION_MODEL } from '@blook/core/types';

/** Dev/test only: a fake endpoint URL in storage.local under this key replaces OpenRouter. */
const ENDPOINT_OVERRIDE_KEY = 'blook-stt-endpoint';
async function endpoint(): Promise<string> {
  const v = (await browser.storage.local.get(ENDPOINT_OVERRIDE_KEY))[ENDPOINT_OVERRIDE_KEY];
  return typeof v === 'string' && v ? v : OPENROUTER_ENDPOINT;
}

async function transcribeChunk(chunk: AudioChunkRow, apiKey: string) {
  const name = `${String(chunk.index).padStart(3, '0')}.webm`;
  const res = await openRouterTranscribe(chunk.blob, name, { apiKey, endpoint: await endpoint() });
  const source: TranscriptSource = {
    method: 'openrouter',
    model: TRANSCRIPTION_MODEL,
    by: 'extension',
    at: new Date().toISOString(),
    blookVersion: browser.runtime.getManifest().version,
  };
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
  run = chunkResult(chunk, chunk.blob.size, () => transcribeChunk(chunk, apiKey))
    .then((result) => saveResult(chunk.sessionId, result))
    .finally(() => {
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

/** Transcribes every chunk that has no good result yet. Without an API key it does nothing. */
export async function ensureTranscript(sessionId: SessionId): Promise<void> {
  const db = await openBlookDB();
  const { openRouterApiKey } = await settingsItem.getValue();
  if (!openRouterApiKey) return;
  const [chunks, stored] = await Promise.all([getBySession('audioChunks', sessionId), db.get('transcripts', sessionId)]);
  const results = new Map((stored?.chunks ?? []).map((c) => [c.index, c]));
  const missing = chunks.filter((c) => !isDone(results.get(c.index)));
  await openRouterEach(missing, (c) => runChunk(c, openRouterApiKey));
}

/** The bundle's transcript options, from what's stored. Done and partial: transcriptJson derives status and note. */
export async function transcriptOptions(sessionId: SessionId): Promise<BundleOptions> {
  const db = await openBlookDB();
  const transcript = await db.get('transcripts', sessionId);
  const s = await transcriptionStatus(sessionId);
  const progress = `${s.done} of ${s.total} audio chunks transcribed`;
  switch (s.state) {
    case 'none':
      return { transcript, transcriptStatus: 'none', transcriptNote: 'no audio recorded' };
    case 'done':
    case 'partial':
      return { transcript };
    case 'no-key':
      return s.done
        ? { transcript, transcriptStatus: 'partial', transcriptNote: `${progress}; no OpenRouter API key set for the rest` }
        : { transcript, transcriptStatus: 'skipped', transcriptNote: 'skipped: no OpenRouter API key set' };
    case 'pending':
    case 'transcribing':
      return { transcript, transcriptStatus: 'pending', transcriptNote: `transcribing: ${progress}` };
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

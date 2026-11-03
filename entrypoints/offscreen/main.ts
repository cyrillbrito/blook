// Mic recorder. Each ~30 s chunk is its own MediaRecorder run (stop, then start a new one),
// because timeslice chunks are not standalone WebM files: only the first has the header.
import { openBlookDB } from '@/lib/db';
import { voicedRanges, type Range } from '@/lib/transcribe/vad';
import { sendToBackground, type OffscreenMessage, type OffscreenReply } from '@/lib/messages';

const MIME = 'audio/webm;codecs=opus';

let stream: MediaStream | undefined;
let recorder: MediaRecorder | undefined;
let rotateTimer: ReturnType<typeof setTimeout> | undefined;
let sessionId = '';
let epoch = 0;
let chunkMs = 30_000;
let nextIndex = 0;
const saves = new Set<Promise<void>>();
/** Per recorder: resolves after its stop event fired and its chunk was written. */
const stopped = new WeakMap<MediaRecorder, Promise<void>>();

browser.runtime.onMessage.addListener((msg: OffscreenMessage, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return undefined;
  const run = msg.type === 'mic/start' ? startMic(msg) : stopMic();
  run.then(sendResponse, (err) => sendResponse({ ok: false, error: String(err) } satisfies OffscreenReply));
  return true;
});

async function startMic(msg: Extract<OffscreenMessage, { type: 'mic/start' }>): Promise<OffscreenReply> {
  if (stream) await stopMic();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    const e = err as DOMException;
    const needsPermission = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
    return { ok: false, needsPermission, error: `${e?.name ?? 'Error'}: ${e?.message ?? err}` };
  }
  sessionId = msg.sessionId;
  epoch = msg.startedAt;
  chunkMs = msg.chunkMs;
  nextIndex = await firstFreeIndex(sessionId);
  stream.getAudioTracks()[0]?.addEventListener('ended', () => {
    void sendToBackground({ type: 'mic/error', error: 'microphone track ended' });
    void stopMic();
  });
  startChunk();
  return { ok: true };
}

async function stopMic(): Promise<OffscreenReply> {
  clearTimeout(rotateTimer);
  // Wait for the recorder's final dataavailable + stop events and the IndexedDB write of the
  // partial last chunk, so the background can close this document right after.
  const last = stopChunk();
  recorder = undefined;
  await last;
  stream?.getTracks().forEach((t) => t.stop());
  stream = undefined;
  const errors: string[] = [];
  for (const r of await Promise.allSettled([...saves])) if (r.status === 'rejected') errors.push(String(r.reason));
  return errors.length ? { ok: false, error: `saving audio failed: ${errors[0]}` } : { ok: true };
}

/** Continues numbering if the mic restarts within a session (e.g. after permission was granted). */
async function firstFreeIndex(id: string): Promise<number> {
  const db = await openBlookDB();
  const keys = await db.getAllKeysFromIndex('audioChunks', 'bySession', id);
  return keys.length ? Math.max(...keys.map((k) => k[1])) + 1 : 0;
}

function startChunk() {
  if (!stream) return;
  const rec = new MediaRecorder(stream, { mimeType: MIME, audioBitsPerSecond: 32_000 });
  const parts: Blob[] = [];
  const index = nextIndex++;
  const sid = sessionId;
  const sessionEpoch = epoch;
  let startedAt = Date.now();
  let done!: () => void;
  stopped.set(rec, new Promise<void>((r) => (done = r)));
  rec.addEventListener('start', () => (startedAt = Date.now()));
  rec.addEventListener('dataavailable', (e) => e.data.size && parts.push(e.data));
  rec.addEventListener('stop', () => {
    const endedAt = Date.now();
    const blob = new Blob(parts, { type: rec.mimeType || MIME });
    const save = saveChunk(sid, sessionEpoch, index, startedAt, endedAt, blob);
    saves.add(save);
    save
      .catch((err) => {
        console.error('[blook] save audio chunk', err);
        void sendToBackground({ type: 'mic/error', error: `saving audio chunk ${index} failed: ${err}` }).catch(() => {});
      })
      .finally(() => {
        saves.delete(save);
        done();
      });
  });
  rec.addEventListener('error', (e) => {
    void sendToBackground({ type: 'mic/error', error: `MediaRecorder: ${(e as ErrorEvent).message ?? 'error'}` }).catch(() => {});
  });
  rec.start();
  recorder = rec;
  rotateTimer = setTimeout(() => {
    void stopChunk();
    startChunk();
  }, chunkMs);
}

/** Stops the current recorder. Resolves once its chunk is saved (or failed to save). */
function stopChunk(): Promise<void> {
  const rec = recorder;
  if (!rec) return Promise.resolve();
  if (rec.state !== 'inactive') rec.stop();
  return stopped.get(rec) ?? Promise.resolve();
}

async function saveChunk(
  sessionId: string,
  epoch: number,
  index: number,
  startedAt: number,
  endedAt: number,
  blob: Blob,
) {
  if (!blob.size) return;
  const t = startedAt - epoch;
  const voiced = await detectVoiced(blob);
  const db = await openBlookDB();
  await db.put('audioChunks', {
    sessionId,
    index,
    t,
    durationMs: endedAt - startedAt,
    mimeType: blob.type,
    blob,
    ...(voiced ? { voiced } : {}),
  });
  await sendToBackground({ type: 'audio/chunk-saved', sessionId, index, t }).catch(() => {});
}

/** Decodes the chunk at 16 kHz mono and finds voiced ranges. Undefined if decoding fails. */
async function detectVoiced(blob: Blob): Promise<Range[] | undefined> {
  try {
    const ctx = new OfflineAudioContext(1, 16_000, 16_000);
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    return voicedRanges(audio.getChannelData(0), audio.sampleRate);
  } catch (err) {
    console.warn('[blook] VAD', err);
    return undefined;
  }
}

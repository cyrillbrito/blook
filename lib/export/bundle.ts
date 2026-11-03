// Builds the session bundle ZIP with fflate. The layout and every field are documented in
// docs/bundle-format.md: keep both in sync, an agent skill is written from that doc.
import { strToU8, zipSync, type Zippable } from 'fflate';
import { getBySession, openOverseerDB } from '../db';
import type { ConsoleRow, Headers, NetworkRequestRow, SessionId, SessionMeta, TranscriptRow } from '../types';
import { buildTimeline, isNetworkFailureLog } from './timeline';

export const BUNDLE_FORMAT_VERSION = 2;
/** Text bodies and frame payloads up to this many UTF-8 bytes stay inline in the JSON. */
const INLINE_MAX = 2048;

export type TranscriptStatus = 'ok' | 'partial' | 'pending' | 'none' | 'skipped' | 'failed';

export interface RequestOut {
  id: string;
  tabId: number;
  t: number;
  endT?: number;
  durationMs?: number;
  method: string;
  url: string;
  resourceType?: string;
  status?: number;
  statusText?: string;
  mimeType?: string;
  failed: boolean;
  errorText?: string;
  socketId?: string;
  requestHeaders: Headers;
  requestBody?: string;
  requestBodyFile?: string;
  requestBodySize?: number;
  responseHeaders?: Headers;
  responseBody?: string;
  responseBodyFile?: string;
  responseBodySize?: number;
  responseBodyBinary?: boolean;
  responseBodyTruncated?: boolean;
  responseBodyOmitted?: string;
}

export interface FrameOut {
  index: number;
  t: number;
  direction: 'sent' | 'received';
  opcode: number;
  size: number;
  payload?: string;
  payloadFile?: string;
  truncated?: boolean;
}

export interface SocketOut {
  id: string;
  requestId: string;
  tabId: number;
  url: string;
  t: number;
  endT?: number;
  durationMs?: number;
  status?: number;
  requestHeaders?: Headers;
  responseHeaders?: Headers;
  frameCount: number;
  sentCount: number;
  receivedCount: number;
  frames: FrameOut[];
}

export type ConsoleOut = Omit<ConsoleRow, 'sessionId' | 'id'> & { index: number };

export interface SegmentOut {
  index: number;
  t: number;
  endT: number;
  durationMs: number;
  text: string;
  words: { word: string; t: number; endT: number }[];
}

function json(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2));
}

/** Drops undefined fields so the JSON only has keys with values. */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** CDP ids can hold `.` and `#`: keep file names to [A-Za-z0-9._-]. */
function fileId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_');
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const MIME_EXT: [RegExp, string][] = [
  [/json/, 'json'],
  [/html/, 'html'],
  [/javascript|ecmascript/, 'js'],
  [/css/, 'css'],
  [/svg/, 'svg'],
  [/xml/, 'xml'],
  [/png/, 'png'],
  [/jpe?g/, 'jpg'],
  [/gif/, 'gif'],
  [/webp/, 'webp'],
  [/avif/, 'avif'],
  [/icon/, 'ico'],
  [/woff2/, 'woff2'],
  [/woff/, 'woff'],
  [/ttf|truetype/, 'ttf'],
  [/otf|opentype/, 'otf'],
  [/wasm/, 'wasm'],
  [/pdf/, 'pdf'],
  [/form-urlencoded/, 'txt'],
  [/^text\//, 'txt'],
];

function extFor(mime: string | undefined, binary: boolean, fallback?: string): string {
  const m = (mime ?? '').toLowerCase();
  for (const [re, ext] of MIME_EXT) if (re.test(m)) return ext;
  if (fallback) {
    try {
      const last = new URL(fallback).pathname.split('/').pop() ?? '';
      const ext = last.includes('.') ? last.split('.').pop()!.toLowerCase() : '';
      if (/^[a-z0-9]{1,5}$/.test(ext)) return ext;
    } catch {}
  }
  return binary ? 'bin' : 'txt';
}

function contentType(headers: Headers | undefined): string | undefined {
  for (const [k, v] of Object.entries(headers ?? {})) if (k.toLowerCase() === 'content-type') return v;
  return undefined;
}

export async function buildBundle(
  sessionId: SessionId,
  opts: { transcript?: TranscriptRow; transcriptStatus?: TranscriptStatus; transcriptNote?: string } = {},
): Promise<{ folder: string; zip: Uint8Array }> {
  const db = await openOverseerDB();
  const meta = await db.get('sessions', sessionId);
  if (!meta) throw new Error(`session ${sessionId} not found`);

  const [rrweb, requestRows, socketRows, frameRows, consoleRows, audio] = await Promise.all([
    getBySession('rrwebEvents', sessionId),
    getBySession('networkRequests', sessionId),
    getBySession('wsSockets', sessionId),
    getBySession('wsFrames', sessionId),
    getBySession('console', sessionId),
    getBySession('audioChunks', sessionId),
  ]);
  requestRows.sort((a, b) => a.t - b.t);
  socketRows.sort((a, b) => a.t - b.t);
  frameRows.sort((a, b) => a.t - b.t || (a.id ?? 0) - (b.id ?? 0));
  consoleRows.sort((a, b) => a.t - b.t || (a.id ?? 0) - (b.id ?? 0));
  audio.sort((a, b) => a.index - b.index);

  const folder = `overseer-${meta.id}`;
  const files: Zippable = {};
  const put = (path: string, data: Uint8Array, level: 0 | 6 = 6) => {
    files[`${folder}/${path}`] = [data, { level }];
  };

  // rrweb/<tabId>.json: top-frame events (cross-origin iframes are folded in by rrweb),
  // timestamps rewritten to ms since session start, in arrival order.
  const rrwebByTab = new Map<number, any[]>();
  for (const row of rrweb) {
    if (row.frameId !== 0) continue;
    const list = rrwebByTab.get(row.tabId) ?? rrwebByTab.set(row.tabId, []).get(row.tabId)!;
    list.push({ ...row.event, timestamp: row.t });
  }
  // Stable sort by t, so ref.event indexes match tools that sort by timestamp.
  for (const events of rrwebByTab.values()) events.sort((a, b) => a.timestamp - b.timestamp);
  for (const [tabId, events] of rrwebByTab) put(`rrweb/${tabId}.json`, strToU8(JSON.stringify(events)));

  // websockets.json
  const socketIds = new Set(socketRows.map((s) => s.socketId));
  const framesBySocket = new Map<string, FrameOut[]>();
  for (const f of frameRows) {
    const list = framesBySocket.get(f.socketId) ?? framesBySocket.set(f.socketId, []).get(f.socketId)!;
    const index = list.length;
    const binary = f.opcode === 2;
    const bytes = binary ? base64ToBytes(f.payload) : strToU8(f.payload);
    const out: FrameOut = { index, t: f.t, direction: f.direction, opcode: f.opcode, size: bytes.length };
    if (!binary && bytes.length <= INLINE_MAX) out.payload = f.payload;
    else {
      out.payloadFile = `websockets/frames/${fileId(f.socketId)}-${index}.${binary ? 'bin' : 'txt'}`;
      put(out.payloadFile, bytes);
    }
    if (f.truncated) out.truncated = true;
    list.push(out);
  }
  const sockets: SocketOut[] = socketRows.map((s) => {
    const frames = framesBySocket.get(s.socketId) ?? [];
    return clean({
      id: s.socketId,
      requestId: s.socketId,
      tabId: s.tabId,
      url: s.url,
      t: s.t,
      endT: s.closedT,
      durationMs: s.closedT !== undefined ? s.closedT - s.t : undefined,
      status: s.status,
      requestHeaders: s.requestHeaders,
      responseHeaders: s.responseHeaders,
      frameCount: frames.length,
      sentCount: frames.filter((f) => f.direction === 'sent').length,
      receivedCount: frames.filter((f) => f.direction === 'received').length,
      frames,
    });
  });

  // network.json, with bodies over INLINE_MAX in network/bodies/.
  const requests: RequestOut[] = requestRows.map((r: NetworkRequestRow) => {
    const fid = fileId(r.requestId);
    const out: RequestOut = clean({
      id: r.requestId,
      tabId: r.tabId,
      t: r.t,
      endT: r.endT,
      durationMs: r.endT !== undefined ? r.endT - r.t : undefined,
      method: r.method,
      url: r.url,
      resourceType: r.resourceType,
      status: r.status,
      statusText: r.statusText,
      mimeType: r.mimeType,
      failed: (!!r.errorText && !r.errorText.startsWith('canceled')) || (r.status ?? 0) >= 400,
      errorText: r.errorText,
      socketId: socketIds.has(r.requestId) ? r.requestId : undefined,
      requestHeaders: r.requestHeaders,
      responseHeaders: r.responseHeaders,
    });
    if (r.requestBody !== undefined) {
      const bytes = strToU8(r.requestBody);
      out.requestBodySize = bytes.length;
      if (bytes.length <= INLINE_MAX) out.requestBody = r.requestBody;
      else {
        out.requestBodyFile = `network/bodies/${fid}.request.${extFor(contentType(r.requestHeaders), false)}`;
        put(out.requestBodyFile, bytes);
      }
    }
    if (r.responseBody !== undefined) {
      const binary = !!r.responseBodyBase64;
      const bytes = binary ? base64ToBytes(r.responseBody) : strToU8(r.responseBody);
      out.responseBodySize = bytes.length;
      if (binary) out.responseBodyBinary = true;
      if (!binary && bytes.length <= INLINE_MAX) out.responseBody = r.responseBody;
      else {
        out.responseBodyFile = `network/bodies/${fid}.${extFor(r.mimeType, binary, r.url)}`;
        // Already-compressed formats gain nothing from deflate.
        put(out.responseBodyFile, bytes, binary ? 0 : 6);
      }
      if (r.truncated) out.responseBodyTruncated = true;
    } else if (r.truncated) {
      out.responseBodyBinary = true;
      out.responseBodyOmitted = 'binary body over the 300 KB capture cap';
    }
    return out;
  });

  const consoleOut: ConsoleOut[] = consoleRows.map(({ sessionId: _s, id: _i, ...rest }, index) => ({ index, ...rest }));

  // transcript.json: segments with their words, all in session ms.
  const transcript = opts.transcript;
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
  // Chunks with a stored result; old rows without per-chunk results cover all chunks.
  const covered = transcript?.chunks ? transcript.chunks.filter((c) => !c.error).length : audio.length;
  const incomplete = !!transcript && (!!transcript.errors?.length || covered < audio.length);
  const transcriptStatus: TranscriptStatus =
    opts.transcriptStatus ?? (transcript ? (incomplete ? 'partial' : 'ok') : 'none');
  let transcriptNote = opts.transcriptNote;
  if (transcriptStatus === 'partial' && !transcriptNote && covered < audio.length) {
    transcriptNote = `${covered} of ${audio.length} audio chunks transcribed${transcript?.errors?.length ? `; failed: ${transcript.errors[0]!.error}` : ''}`;
  }
  if (transcriptStatus === 'none' && meta.mic?.error) transcriptNote = `no audio recorded: ${meta.mic.error}`;
  if (transcriptStatus === 'partial' && !transcriptNote) transcriptNote = `${transcript!.errors!.length} audio chunk(s) failed to transcribe`;
  const transcriptOut = clean({
    status: transcriptStatus,
    note: transcriptNote,
    model: transcript?.model,
    errors: transcript?.errors?.map(({ chunk, t, error }) => ({ chunk, t, error })),
    segmentCount: segments.length,
    wordCount: segments.reduce((n, s) => n + s.words.length, 0),
    segments,
  });

  const audioOut = audio.map((c) => ({
    index: c.index,
    t: c.t,
    endT: c.durationMs !== undefined ? c.t + c.durationMs : undefined,
    durationMs: c.durationMs,
    mimeType: c.mimeType,
    size: c.blob.size,
    file: `audio/${String(c.index).padStart(3, '0')}.webm`,
  }));
  for (const [i, chunk] of audio.entries()) {
    put(audioOut[i]!.file, new Uint8Array(await chunk.blob.arrayBuffer()), 0);
  }

  const timeline = buildTimeline({ meta, rrwebByTab, requests, sockets, console: consoleOut, segments });

  put('timeline.json', json(timeline));
  put('network.json', json(requests));
  put('websockets.json', json(sockets));
  put('console.json', json(consoleOut));
  put('transcript.json', json(transcriptOut));
  if (audio.length) put('audio/chunks.json', json(audioOut.map(clean)));

  const fileMap: Record<string, string> = {
    'session.json': 'This file: session meta, counts, mic outcome and this map. Read it first.',
    'timeline.json': 'Every event in one array sorted by t (navigation, click, input, request, ws, console, speech…); ref points into the detail files.',
  };
  for (const tabId of rrwebByTab.keys()) {
    fileMap[`rrweb/${tabId}.json`] = `rrweb events of tab ${tabId} (timestamp = ms since start); feed to the replay tool for DOM, screenshots and pointer at any t.`;
  }
  fileMap['network.json'] = 'HTTP requests sorted by t, with headers; bodies up to 2 KB inline, larger ones in *BodyFile.';
  if (Object.keys(files).some((k) => k.includes('/network/bodies/'))) {
    fileMap['network/bodies/'] = 'Request and response bodies over 2 KB and all binary bodies, named <requestId>[.request].<ext>.';
  }
  fileMap['websockets.json'] = 'WebSocket connections sorted by t, each with all its frames (t, direction, payload).';
  if (Object.keys(files).some((k) => k.includes('/websockets/frames/'))) {
    fileMap['websockets/frames/'] = 'WebSocket frame payloads over 2 KB and all binary payloads, named <socketId>-<frameIndex>.<txt|bin>.';
  }
  fileMap['console.json'] = 'Console calls, uncaught exceptions and browser log entries sorted by t.';
  fileMap['transcript.json'] = `Narration: status "${transcriptStatus}", segments with words, all times in session ms.`;
  if (audio.length) {
    fileMap['audio/chunks.json'] = 'Mic audio chunks: index, t, durationMs and file.';
    fileMap['audio/'] = 'Raw mic audio, WebM/Opus, about 30 s per file.';
  }

  const counts = {
    rrwebEvents: [...rrwebByTab.values()].reduce((n, l) => n + l.length, 0),
    timeline: timeline.length,
    requests: requests.length,
    failedRequests: requests.filter((r) => r.failed).length,
    webSockets: sockets.length,
    webSocketFrames: frameRows.length,
    console: consoleOut.length,
    // Same as the timeline's `error` entries: network-failure log lines are counted in failedRequests.
    errors: consoleOut.filter((c) => c.level === 'error' && !isNetworkFailureLog(c)).length,
    audioChunks: audio.length,
    transcriptSegments: segments.length,
  };

  put('session.json', json(sessionJson(meta, counts, fileMap, { status: transcriptStatus, note: transcriptNote, model: transcript?.model })));

  // zipSync: the async variant needs Workers, which service workers lack.
  return { folder, zip: zipSync(files) };
}

function sessionJson(
  meta: SessionMeta,
  counts: Record<string, number>,
  files: Record<string, string>,
  transcript: { status: TranscriptStatus; note?: string; model?: string },
) {
  const durationMs = meta.durationMs ?? (meta.endedAt ? meta.endedAt - meta.startedAt : undefined);
  return clean({
    format: 'overseer-bundle',
    version: BUNDLE_FORMAT_VERSION,
    id: meta.id,
    url: meta.url,
    title: meta.title,
    status: meta.status,
    startedAt: meta.startedAt,
    startedAtIso: new Date(meta.startedAt).toISOString(),
    endedAt: meta.endedAt,
    t: 0,
    endT: durationMs,
    durationMs,
    exportedAt: new Date().toISOString(),
    clock:
      'Every t, endT and rrweb timestamp in this bundle is integer ms since startedAt (Unix ms). Absolute time = startedAt + t.',
    firstSnapshotT: meta.firstSnapshotT,
    tabs: meta.tabs,
    navigations: meta.navigations ?? [],
    settings: meta.settings,
    mic: meta.mic ?? { state: meta.settings.mic ? 'unknown' : 'off' },
    transcript: clean(transcript),
    counts,
    files,
  });
}

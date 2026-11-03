// Builds the session bundle ZIP with fflate. The layout and every field are documented in
// docs/bundle-format.md: keep both in sync, an agent skill is written from that doc.
import { strToU8, zipSync, type Zippable } from 'fflate';
import { getBySession, openBlookDB } from '../db';
import type { ConsoleRow, Headers, NetworkRequestRow, SessionId, SessionMeta, TranscriptRow } from '../types';
import { buildTimeline, isNetworkFailureLog } from './timeline';

export const BUNDLE_FORMAT_VERSION = 1;
/** Frame payloads up to this many UTF-8 bytes stay inline in the JSON. */
const INLINE_MAX = 2048;

/** How a body is stored in network.json: parsed JSON, a text string, or base64 bytes. */
export type BodyEncoding = 'json' | 'text' | 'base64';

/** JSON bodies that parse (and weren't cut) become JSON values, so jq can walk into them. */
function encodeBody(body: string, base64: boolean, mime: string | undefined, truncated: boolean) {
  if (base64) return { body, encoding: 'base64' as const };
  if (!truncated && /json/i.test(mime ?? '')) {
    try {
      return { body: JSON.parse(body) as unknown, encoding: 'json' as const };
    } catch {}
  }
  return { body, encoding: 'text' as const };
}

/** Console entries from Blook's own scripts (rrweb's canvas readback warning, …). */
export function isExtensionConsole(c: { url?: string; stack?: string }): boolean {
  if (c.url?.startsWith('chrome-extension://')) return true;
  const top = c.stack?.match(/\((\S+?):\d+:\d+\)/)?.[1];
  return !!top?.startsWith('chrome-extension://');
}

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
  /** Parsed JSON when requestBodyEncoding is `json`, else a string. */
  requestBody?: unknown;
  requestBodyEncoding?: BodyEncoding;
  requestBodySize?: number;
  requestBodyTruncated?: boolean;
  responseHeaders?: Headers;
  responseBody?: unknown;
  responseBodyEncoding?: BodyEncoding;
  responseBodySize?: number;
  responseBodyTruncated?: boolean;
  responseBodyNotKept?: string;
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

/** transcript.json. */
export interface TranscriptOut {
  status: TranscriptStatus;
  note?: string;
  model?: string;
  errors?: { chunk: number; t: number; error: string }[];
  segmentCount: number;
  wordCount: number;
  segments: SegmentOut[];
}

/** One entry of audio/chunks.json. */
export interface AudioChunkOut {
  index: number;
  t: number;
  endT: number;
  durationMs: number;
  /** Voiced ranges in session ms. */
  voiced?: [number, number][];
  mimeType: string;
  size: number;
  file: string;
}

/** session.json. */
export type SessionOut = ReturnType<typeof sessionJson>;

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

export function contentType(headers: Headers | undefined): string | undefined {
  for (const [k, v] of Object.entries(headers ?? {})) if (k.toLowerCase() === 'content-type') return v;
  return undefined;
}

export async function buildBundle(
  sessionId: SessionId,
  opts: { transcript?: TranscriptRow; transcriptStatus?: TranscriptStatus; transcriptNote?: string } = {},
): Promise<{ folder: string; zip: Uint8Array }> {
  const db = await openBlookDB();
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

  const folder = `blook-${meta.id}`;
  const files: Zippable = {};
  const put = (path: string, data: Uint8Array, level: 0 | 6 = 6) => {
    files[`${folder}/${path}`] = [data, { level }];
  };

  // rrweb.json: per tab, top-frame events (cross-origin iframes are folded in by rrweb),
  // timestamps rewritten to ms since session start, in arrival order.
  const rrwebByTab = new Map<number, any[]>();
  for (const row of rrweb) {
    if (row.frameId !== 0) continue;
    const list = rrwebByTab.get(row.tabId) ?? rrwebByTab.set(row.tabId, []).get(row.tabId)!;
    list.push({ ...row.event, timestamp: row.t });
  }
  // Stable sort by t, so ref.event indexes match tools that sort by timestamp.
  for (const events of rrwebByTab.values()) events.sort((a, b) => a.timestamp - b.timestamp);
  // Tabs in the order they were opened (session.tabs), then any other.
  const tabOrder = meta.tabs.map((t) => t.tabId);
  const rank = (id: number) => (tabOrder.indexOf(id) + 1 || Infinity);
  const rrwebTabs = [...rrwebByTab.keys()].sort((a, b) => rank(a) - rank(b));
  if (rrwebTabs.length) {
    const tabs = rrwebTabs.map((tabId) => ({ tabId, url: meta.tabs.find((t) => t.tabId === tabId)?.url, events: rrwebByTab.get(tabId)! }));
    put('rrweb.json', strToU8(JSON.stringify({ tabs })));
  }

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

  // network.json, bodies inline.
  const requests: RequestOut[] = [];
  for (const r of requestRows as NetworkRequestRow[]) {
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
      const { body, encoding } = encodeBody(r.requestBody, false, contentType(r.requestHeaders), !!r.requestBodyTruncated);
      out.requestBody = body;
      out.requestBodyEncoding = encoding;
      out.requestBodySize = r.requestBodySize ?? strToU8(r.requestBody).length;
      if (r.requestBodyTruncated) out.requestBodyTruncated = true;
    }
    out.responseBodySize = r.responseBodySize;
    out.responseBodyNotKept = r.responseBodyNotKept;
    if (r.responseBody !== undefined) {
      const { body, encoding } = encodeBody(r.responseBody, !!r.responseBodyBase64, r.mimeType, !!r.truncated);
      out.responseBody = body;
      out.responseBodyEncoding = encoding;
      if (r.truncated) out.responseBodyTruncated = true;
    }
    requests.push(out);
  }

  const consoleOut: ConsoleOut[] = consoleRows
    .filter((c) => !isExtensionConsole(c))
    .map(({ sessionId: _s, id: _i, ...rest }, index) => ({ index, ...rest }));

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
  const covered = transcript?.chunks.filter((c) => !c.error).length ?? 0;
  const incomplete = !!transcript && (!!transcript.errors?.length || covered < audio.length);
  const transcriptStatus: TranscriptStatus =
    opts.transcriptStatus ?? (transcript ? (incomplete ? 'partial' : 'ok') : 'none');
  let transcriptNote = opts.transcriptNote;
  if (transcriptStatus === 'partial' && !transcriptNote && covered < audio.length) {
    transcriptNote = `${covered} of ${audio.length} audio chunks transcribed${transcript?.errors?.length ? `; failed: ${transcript.errors[0]!.error}` : ''}`;
  }
  if (transcriptStatus === 'none' && meta.mic.error) transcriptNote = `no audio recorded: ${meta.mic.error}`;
  if (transcriptStatus === 'partial' && !transcriptNote) transcriptNote = `${transcript!.errors!.length} audio chunk(s) failed to transcribe`;
  const transcriptOut: TranscriptOut = clean({
    status: transcriptStatus,
    note: transcriptNote,
    model: transcript?.model,
    errors: transcript?.errors?.map(({ chunk, t, error }) => ({ chunk, t, error })),
    segmentCount: segments.length,
    wordCount: segments.reduce((n, s) => n + s.words.length, 0),
    segments,
  });

  const audioOut: AudioChunkOut[] = audio.map((c) => ({
    index: c.index,
    t: c.t,
    endT: c.t + c.durationMs,
    durationMs: c.durationMs,
    voiced: c.voiced?.map(([a, b]): [number, number] => [Math.round(c.t + a), Math.round(c.t + b)]),
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
  if (rrwebTabs.length) {
    fileMap['rrweb.json'] = `rrweb events per tab ({ tabs: [{ tabId, url, events }] }, timestamp = ms since start, one line); feed to the replay tool for DOM, screenshots and pointer at any t.`;
  }
  fileMap['network.json'] =
    'HTTP requests sorted by t, with headers and inline bodies (JSON bodies parsed). Can be large: query with jq, never read whole. Bodies of static files and page loads are not kept.';
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
  const durationMs = meta.durationMs;
  return clean({
    format: 'blook-bundle',
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
    pageReadyT: meta.pageReadyT,
    tabs: meta.tabs,
    navigations: meta.navigations,
    settings: meta.settings,
    mic: meta.mic,
    transcript: clean(transcript),
    counts,
    files,
  });
}

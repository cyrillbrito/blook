// Builds the session bundle ZIP with fflate, from the recorded rows. The layout and every field are
// documented in docs/bundle-format.md: keep both in sync, an agent skill is written from that doc.
import { strToU8, zipSync, type Zippable } from 'fflate';
import type {
  AudioChunkRow,
  ConsoleRow,
  Headers,
  NetworkRequestRow,
  RrwebEventRow,
  SessionMeta,
  TranscriptRow,
  WebSocketFrameRow,
  WebSocketRow,
} from './types.ts';
import { buildTimeline, isNetworkFailureLog } from './timeline.ts';
import { transcriptFileNote, transcriptJson, transcriptSummary, type SegmentOut, type TranscriptOut, type TranscriptStatus } from './transcript.ts';

export type { SegmentOut, TranscriptOut, TranscriptStatus };

export const BUNDLE_FORMAT_VERSION = 1;

/** How a body or frame payload is stored: parsed JSON, a text string, or base64 bytes. */
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

/** Text frames have no MIME type: parse those that look like a JSON object or array. */
export function encodePayload(payload: string, binary: boolean, truncated: boolean) {
  return encodeBody(payload, binary, !binary && /^\s*[[{]/.test(payload) ? 'json' : undefined, truncated);
}

/** Console entries from Blook's own scripts (rrweb's canvas readback warning, …). */
export function isExtensionConsole(c: { url?: string; stack?: string }): boolean {
  if (c.url?.startsWith('chrome-extension://')) return true;
  const top = c.stack?.match(/\((\S+?):\d+:\d+\)/)?.[1];
  return !!top?.startsWith('chrome-extension://');
}

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
  /** Payload size in bytes (decoded for binary), before any cut. */
  size: number;
  /** Parsed JSON when payloadEncoding is `json`, else a string (base64 for binary). */
  payload: unknown;
  payloadEncoding: BodyEncoding;
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

function base64Size(b64: string): number {
  return (b64.length / 4) * 3 - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
}

export function contentType(headers: Headers | undefined): string | undefined {
  for (const [k, v] of Object.entries(headers ?? {})) if (k.toLowerCase() === 'content-type') return v;
  return undefined;
}

/** websockets.json: sockets in `t` order, each with its frames, every payload inline. Rows sorted by t. */
export function socketsOut(socketRows: WebSocketRow[], frameRows: WebSocketFrameRow[]): SocketOut[] {
  const framesBySocket = new Map<string, FrameOut[]>();
  for (const f of frameRows) {
    const list = framesBySocket.get(f.socketId) ?? framesBySocket.set(f.socketId, []).get(f.socketId)!;
    const index = list.length;
    const binary = f.opcode === 2;
    const size = f.size ?? (binary ? base64Size(f.payload) : strToU8(f.payload).length);
    const { body, encoding } = encodePayload(f.payload, binary, !!f.truncated);
    const out: FrameOut = { index, t: f.t, direction: f.direction, opcode: f.opcode, size, payload: body, payloadEncoding: encoding };
    if (f.truncated) out.truncated = true;
    list.push(out);
  }
  return socketRows.map((s) => {
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
}

/** Everything recorded for one session, as stored. */
export interface SessionRows {
  meta: SessionMeta;
  rrweb: RrwebEventRow[];
  requests: NetworkRequestRow[];
  sockets: WebSocketRow[];
  frames: WebSocketFrameRow[];
  console: ConsoleRow[];
  audio: AudioChunkRow[];
}

export interface BundleOptions {
  transcript?: TranscriptRow;
  transcriptStatus?: TranscriptStatus;
  transcriptNote?: string;
}

/** The bundle ZIP of one session. Sorts the row arrays in place. */
export async function zipBundle(rows: SessionRows, opts: BundleOptions = {}): Promise<{ folder: string; zip: Uint8Array }> {
  const { meta, rrweb, requests: requestRows, sockets: socketRows, frames: frameRows, console: consoleRows, audio } = rows;
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
  const sockets = socketsOut(socketRows, frameRows);
  const socketIds = new Set(sockets.map((s) => s.id));

  // network.json, bodies inline.
  const requests: RequestOut[] = [];
  for (const r of requestRows) {
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
  const transcriptOut = transcriptJson(opts.transcript, audio.length, {
    status: opts.transcriptStatus,
    note: opts.transcriptNote,
    micError: meta.mic.error,
  });
  const segments = transcriptOut.segments;
  const transcriptStatus = transcriptOut.status;

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
  fileMap['websockets.json'] =
    'WebSocket connections sorted by t, each with all its frames (t, direction, payload inline, JSON payloads parsed). Can be large: query with jq.';
  fileMap['console.json'] = 'Console calls, uncaught exceptions and browser log entries sorted by t.';
  fileMap['transcript.json'] = transcriptFileNote(transcriptStatus);
  if (audio.length) {
    fileMap['audio/chunks.json'] = 'Mic audio chunks: index, t, durationMs and file.';
    fileMap['audio/'] = 'Raw mic audio, WebM/Opus, 20 to 40 s per file, cut at pauses.';
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

  put('session.json', json(sessionJson(meta, counts, fileMap, transcriptSummary(transcriptOut))));

  // zipSync: the async variant needs Workers, which service workers lack.
  return { folder, zip: zipSync(files) };
}

function sessionJson(
  meta: SessionMeta,
  counts: Record<string, number>,
  files: Record<string, string>,
  transcript: ReturnType<typeof transcriptSummary>,
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
    transcript,
    counts,
    files,
  });
}

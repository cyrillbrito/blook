// Turns chrome.debugger (CDP) events into stored rows: HTTP requests with bodies,
// WebSocket sockets and frames, console calls, exceptions and browser log entries.
import type { ConsoleRow, Headers, NetworkRequestRow, SessionId, WebSocketRow } from '@blook/core/types';
import { BODY_MAX_BYTES, bodyPolicy, capBase64, capText } from '@blook/core/body-policy';
import type { BatchWriter } from './writer';

export type SendCommand = (tabId: number, method: string, params?: object) => Promise<any>;

/** Commands to run on every attached tab. */
export async function enableDomains(send: SendCommand, tabId: number) {
  await send(tabId, 'Network.enable', {
    maxTotalBufferSize: 200_000_000,
    maxResourceBufferSize: 20_000_000,
    maxPostDataSize: BODY_MAX_BYTES,
  });
  await send(tabId, 'Runtime.enable');
  await send(tabId, 'Log.enable');
}

export class CdpCapture {
  /** Requests still in flight, by requestId. */
  private requests = new Map<string, NetworkRequestRow>();
  private sockets = new Map<string, WebSocketRow>();
  private redirects = new Map<string, number>();
  /** wallTime ms minus monotonic ms, learned from events that carry both. */
  private monoOffset: number | undefined;

  constructor(
    private sessionId: SessionId,
    private epoch: number,
    private writer: BatchWriter,
    private send: SendCommand,
  ) {}

  /** CDP MonotonicTime (seconds) to session time. */
  private mono(ts: number | undefined): number {
    if (ts === undefined || this.monoOffset === undefined) return Date.now() - this.epoch;
    return Math.round(ts * 1000 + this.monoOffset - this.epoch);
  }

  private learnClock(timestamp?: number, wallTime?: number) {
    if (timestamp !== undefined && wallTime !== undefined) this.monoOffset = wallTime * 1000 - timestamp * 1000;
  }

  /** Runtime.Timestamp (ms since Unix epoch) to session time. */
  private wall(ms: number | undefined): number {
    return Math.round((ms ?? Date.now()) - this.epoch);
  }

  handle(tabId: number, method: string, p: any) {
    switch (method) {
      case 'Network.requestWillBeSent':
        return this.onRequest(tabId, p);
      case 'Network.responseReceived':
        return this.onResponse(p);
      case 'Network.dataReceived': {
        const row = this.requests.get(p.requestId);
        if (row) row.responseBodySize = (row.responseBodySize ?? 0) + (p.dataLength ?? 0);
        return;
      }
      case 'Network.loadingFinished':
        return void this.onFinished(tabId, p);
      case 'Network.loadingFailed':
        return this.onFailed(p);
      case 'Network.webSocketCreated':
        return this.onSocketCreated(tabId, p);
      case 'Network.webSocketWillSendHandshakeRequest': {
        this.learnClock(p.timestamp, p.wallTime);
        const s = this.sockets.get(p.requestId);
        if (s) {
          s.requestHeaders = normHeaders(p.request?.headers);
          this.writer.upsertSocket(s);
        }
        return;
      }
      case 'Network.webSocketHandshakeResponseReceived': {
        const s = this.sockets.get(p.requestId);
        if (s) {
          s.status = p.response?.status;
          s.responseHeaders = normHeaders(p.response?.headers);
          this.writer.upsertSocket(s);
        }
        return;
      }
      case 'Network.webSocketFrameSent':
      case 'Network.webSocketFrameReceived':
        return this.onFrame(p, method === 'Network.webSocketFrameSent' ? 'sent' : 'received');
      case 'Network.webSocketFrameError':
        return this.consoleRow(tabId, {
          t: this.mono(p.timestamp),
          source: 'log',
          level: 'error',
          text: `WebSocket frame error: ${p.errorMessage}`,
          url: this.sockets.get(p.requestId)?.url,
        });
      case 'Network.webSocketClosed': {
        const s = this.sockets.get(p.requestId);
        if (s) {
          s.closedT = this.mono(p.timestamp);
          this.writer.upsertSocket(s);
          this.sockets.delete(p.requestId);
        }
        return;
      }
      case 'Runtime.consoleAPICalled':
        return this.onConsole(tabId, p);
      case 'Runtime.exceptionThrown':
        return this.onException(tabId, p);
      case 'Log.entryAdded':
        return this.onLog(tabId, p.entry);
    }
  }

  /** Writes requests that never finished (called at stop). */
  finalize() {
    for (const row of this.requests.values()) this.writer.upsertRequest(row);
    for (const s of this.sockets.values()) this.writer.upsertSocket(s);
    this.requests.clear();
    this.sockets.clear();
  }

  private onRequest(tabId: number, p: any) {
    this.learnClock(p.timestamp, p.wallTime);
    const url: string = p.request?.url ?? '';
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    const t = this.mono(p.timestamp);

    // A redirect reuses the requestId: close the previous hop as its own row.
    const prev = this.requests.get(p.requestId);
    if (prev && p.redirectResponse) {
      const n = (this.redirects.get(p.requestId) ?? 0) + 1;
      this.redirects.set(p.requestId, n);
      Object.assign(prev, responseFields(p.redirectResponse), {
        requestId: `${p.requestId}#redirect${n}`,
        endT: t,
      });
      this.writer.upsertRequest(prev);
    }

    const row: NetworkRequestRow = {
      sessionId: this.sessionId,
      requestId: p.requestId,
      tabId,
      t,
      method: p.request?.method ?? 'GET',
      url: url + (p.request?.urlFragment ?? ''),
      resourceType: p.type,
      requestHeaders: normHeaders(p.request?.headers),
    };
    this.setRequestBody(row, p.request?.postData);
    this.requests.set(p.requestId, row);
    this.writer.upsertRequest(row);

    if (p.request?.hasPostData && row.requestBody === undefined) {
      this.send(tabId, 'Network.getRequestPostData', { requestId: p.requestId })
        .then((r) => {
          this.setRequestBody(row, r?.postData);
          this.writer.upsertRequest(row);
        })
        .catch(() => {});
    }
  }

  private setRequestBody(row: NetworkRequestRow, body: string | undefined) {
    if (body === undefined) return;
    const policy = bodyPolicy({ direction: 'request', resourceType: row.resourceType });
    if (!policy.keep) return;
    const cut = capText(body, policy.maxBytes);
    row.requestBody = cut.text;
    if (cut.truncated) Object.assign(row, { requestBodyTruncated: true, requestBodySize: cut.size });
  }

  private onResponse(p: any) {
    const row = this.requests.get(p.requestId);
    if (!row) return;
    Object.assign(row, responseFields(p.response));
    if (p.type) row.resourceType = p.type;
    this.writer.upsertRequest(row);
  }

  private async onFinished(tabId: number, p: any) {
    const row = this.requests.get(p.requestId);
    if (!row) return;
    row.endT = this.mono(p.timestamp);
    this.requests.delete(p.requestId);
    const policy = bodyPolicy({ direction: 'response', resourceType: row.resourceType, status: row.status, mimeType: row.mimeType });
    if (!policy.keep) {
      // Don't fetch what we drop: no CDP transfer, nothing stored.
      row.responseBodyNotKept = policy.reason;
      this.writer.upsertRequest(row);
      return;
    }
    try {
      // Ask right away: Chrome may evict the body from its buffer later.
      const r = await this.send(tabId, 'Network.getResponseBody', { requestId: p.requestId });
      const body: string = r?.body ?? '';
      // Empty is kept as no body: Chrome returns '' for a fetch read as a blob, and the
      // dataReceived size is then the better number.
      if (body) {
        const cut = r?.base64Encoded ? capBase64(body, policy.maxBytes) : capText(body, policy.maxBytes);
        row.responseBody = 'b64' in cut ? cut.b64 : cut.text;
        if (r?.base64Encoded) row.responseBodyBase64 = true;
        if (cut.truncated) row.truncated = true;
        row.responseBodySize = cut.size;
      }
    } catch {
      // No body (204, redirect, evicted, or the tab navigated away).
    }
    this.writer.upsertRequest(row);
  }

  private onFailed(p: any) {
    const row = this.requests.get(p.requestId);
    if (!row) return;
    row.endT = this.mono(p.timestamp);
    // The `canceled` prefix is what core's isCanceled checks.
    row.errorText = p.canceled ? `canceled${p.errorText ? ` (${p.errorText})` : ''}` : p.errorText || p.blockedReason;
    this.requests.delete(p.requestId);
    this.writer.upsertRequest(row);
  }

  private onSocketCreated(tabId: number, p: any) {
    const row: WebSocketRow = {
      sessionId: this.sessionId,
      socketId: p.requestId,
      tabId,
      url: p.url,
      t: this.mono(undefined),
    };
    this.sockets.set(p.requestId, row);
    this.writer.upsertSocket(row);
  }

  private onFrame(p: any, direction: 'sent' | 'received') {
    const payload: string = p.response?.payloadData ?? '';
    const opcode: number = p.response?.opcode ?? 1;
    // Same cap as HTTP bodies. Binary payloads (opcode 2) arrive as base64.
    const cut = opcode === 2 ? capBase64(payload, BODY_MAX_BYTES) : capText(payload, BODY_MAX_BYTES);
    this.writer.addFrame({
      sessionId: this.sessionId,
      socketId: p.requestId,
      t: this.mono(p.timestamp),
      direction,
      opcode,
      payload: 'b64' in cut ? cut.b64 : cut.text,
      size: cut.size,
      ...(cut.truncated ? { truncated: true } : {}),
    });
  }

  private onConsole(tabId: number, p: any) {
    const top = p.stackTrace?.callFrames?.[0];
    this.consoleRow(tabId, {
      t: this.wall(p.timestamp),
      source: 'console',
      level: consoleLevel(p.type),
      text: (p.args ?? []).map(formatRemote).join(' ') || p.type,
      url: top?.url || undefined,
      line: top ? top.lineNumber + 1 : undefined,
      column: top ? top.columnNumber + 1 : undefined,
      stack: p.type === 'error' || p.type === 'trace' || p.type === 'assert' ? formatStack(p.stackTrace) : undefined,
    });
  }

  private onException(tabId: number, p: any) {
    const d = p.exceptionDetails ?? {};
    const desc: string | undefined = d.exception?.description;
    this.consoleRow(tabId, {
      t: this.wall(p.timestamp),
      source: 'exception',
      level: 'error',
      text: desc ? desc.split('\n')[0] : d.exception?.value !== undefined ? `Uncaught ${String(d.exception.value)}` : d.text,
      url: d.url,
      line: d.lineNumber !== undefined ? d.lineNumber + 1 : undefined,
      column: d.columnNumber !== undefined ? d.columnNumber + 1 : undefined,
      stack: formatStack(d.stackTrace) ?? desc,
    });
  }

  private onLog(tabId: number, e: any) {
    if (!e) return;
    const level = e.level === 'verbose' ? 'debug' : e.level === 'warning' ? 'warn' : e.level;
    this.consoleRow(tabId, {
      t: this.wall(e.timestamp),
      source: 'log',
      level,
      // `[network] …` marks Chrome's failed-request lines: core's isNetworkFailureLog relies on it.
      text: e.source ? `[${e.source}] ${e.text}` : e.text,
      url: e.url,
      line: e.lineNumber !== undefined ? e.lineNumber + 1 : undefined,
      stack: formatStack(e.stackTrace),
    });
  }

  private consoleRow(tabId: number, row: Omit<ConsoleRow, 'sessionId' | 'tabId'>) {
    // Log.enable and Runtime.enable replay entries from before attach: skip those.
    if (row.t < 0) return;
    if (isExtensionConsole(row)) return;
    const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) as typeof row;
    this.writer.addConsole({ sessionId: this.sessionId, tabId, ...clean });
  }
}

/** Console entries from Blook's own scripts (rrweb in the page's world: its canvas readback warning, …). */
function isExtensionConsole(c: { url?: string; stack?: string }): boolean {
  if (c.url?.startsWith('chrome-extension://')) return true;
  const top = c.stack?.match(/\((\S+?):\d+:\d+\)/)?.[1];
  return !!top?.startsWith('chrome-extension://');
}

function responseFields(r: any): Partial<NetworkRequestRow> {
  if (!r) return {};
  return {
    status: r.status,
    statusText: r.statusText,
    responseHeaders: normHeaders(r.headers),
    mimeType: r.mimeType,
  };
}

function normHeaders(h: Record<string, unknown> | undefined): Headers {
  const out: Headers = {};
  for (const [k, v] of Object.entries(h ?? {})) out[k] = String(v);
  return out;
}

function consoleLevel(type: string): ConsoleRow['level'] {
  switch (type) {
    case 'error':
    case 'assert':
      return 'error';
    case 'warning':
      return 'warn';
    case 'debug':
      return 'debug';
    case 'info':
      return 'info';
    default:
      return 'log';
  }
}

/** Renders a CDP RemoteObject roughly like DevTools does on one line. */
function formatRemote(o: any): string {
  if (!o) return '';
  if (o.type === 'string') return o.value;
  if (o.unserializableValue) return o.unserializableValue;
  if (o.type === 'undefined') return 'undefined';
  if ('value' in o && o.type !== 'object') return String(o.value);
  if (o.value === null || o.subtype === 'null') return 'null';
  if (o.preview?.properties) {
    const props = o.preview.properties.map((p: any) => (o.preview.subtype === 'array' ? previewValue(p) : `${p.name}: ${previewValue(p)}`));
    const more = o.preview.overflow ? ', …' : '';
    return o.preview.subtype === 'array'
      ? `${o.description ?? 'Array'} [${props.join(', ')}${more}]`
      : `${o.className && o.className !== 'Object' ? `${o.className} ` : ''}{${props.join(', ')}${more}}`;
  }
  return o.description ?? o.className ?? o.type;
}

function previewValue(p: any): string {
  return p.type === 'string' ? JSON.stringify(p.value) : (p.value ?? p.type);
}

function formatStack(st: any): string | undefined {
  const frames = st?.callFrames;
  if (!frames?.length) return undefined;
  return frames
    .map((f: any) => `    at ${f.functionName || '<anonymous>'} (${f.url}:${f.lineNumber + 1}:${f.columnNumber + 1})`)
    .join('\n');
}

// What capture keeps, and how the bundle writes it: body policy, payload encoding, websockets.json, timeline.
import { describe, expect, test } from 'bun:test';
import { BODY_MAX_BYTES, bodyPolicy, capBase64, capText } from '../src/body-policy.ts';
import { encodePayload, socketsOut } from '../src/bundle.ts';
import { buildTimeline } from '../src/timeline.ts';
import type { SessionMeta, WebSocketFrameRow, WebSocketRow } from '../src/types.ts';

const MB = BODY_MAX_BYTES;

describe('HTTP body policy', () => {
  test('request bodies are always kept', () => {
    expect(bodyPolicy({ direction: 'request', resourceType: 'Image' })).toEqual({ keep: true, maxBytes: MB });
  });
  test.each(['XHR', 'Fetch', 'EventSource'])('%s responses are kept', (resourceType) => {
    expect(bodyPolicy({ direction: 'response', resourceType, mimeType: 'text/html' })).toEqual({ keep: true, maxBytes: MB });
  });
  test.each(['Other', 'Ping', 'Preflight', 'CSPViolationReport', undefined])('%s responses are kept unless they are media', (resourceType) => {
    expect(bodyPolicy({ direction: 'response', resourceType, mimeType: 'application/json' }).keep).toBe(true);
    expect(bodyPolicy({ direction: 'response', resourceType, mimeType: 'image/png' })).toEqual({ keep: false, reason: 'static asset (image/png)' });
  });
  test.each(['Script', 'Stylesheet', 'Font', 'Image', 'Media', 'Manifest'])('%s responses are dropped with a reason', (resourceType) => {
    expect(bodyPolicy({ direction: 'response', resourceType })).toEqual({ keep: false, reason: `static resource (${resourceType})` });
  });
  test('a Document is kept only when it failed', () => {
    expect(bodyPolicy({ direction: 'response', resourceType: 'Document', status: 200 })).toEqual({ keep: false, reason: 'page load (Document) that did not fail' });
    expect(bodyPolicy({ direction: 'response', resourceType: 'Document', status: 404 }).keep).toBe(true);
  });
  test('text is cut at 1 MB with the original size, without a split character', () => {
    expect(capText('héllo', MB)).toEqual({ text: 'héllo', size: 6, truncated: false });
    const cut = capText('a' + 'é'.repeat(MB), MB);
    expect(cut.truncated).toBe(true);
    expect(cut.size).toBe(1 + 2 * MB);
    expect(new TextEncoder().encode(cut.text).length).toBeLessThanOrEqual(MB);
    expect(cut.text.endsWith('\uFFFD')).toBe(false);
  });
  test('base64 is cut at 1 MB decoded and stays valid', () => {
    expect(capBase64('3q2+7w==', MB)).toEqual({ b64: '3q2+7w==', size: 4, truncated: false });
    const big = btoa('x'.repeat(MB + 10));
    const cut = capBase64(big, MB);
    expect(cut).toMatchObject({ size: MB + 10, truncated: true });
    expect(cut.b64.length % 4).toBe(0);
    expect(atob(cut.b64).length).toBeLessThanOrEqual(MB);
  });
});

describe('WebSocket payload encoding', () => {
  test('JSON text that starts with { or [ is parsed', () => {
    expect(encodePayload('{"a":1}', false, false)).toEqual({ body: { a: 1 }, encoding: 'json' });
    expect(encodePayload('  [1,2]', false, false)).toEqual({ body: [1, 2], encoding: 'json' });
  });
  test('other text stays text: plain, numbers, quoted strings, broken JSON, cut JSON', () => {
    for (const p of ['ping', '42', '"quoted"', '{not json', '']) expect(encodePayload(p, false, false)).toEqual({ body: p, encoding: 'text' });
    expect(encodePayload('{"a":1}', false, true)).toEqual({ body: '{"a":1}', encoding: 'text' });
  });
  test('binary is base64, even when it looks like JSON', () => {
    expect(encodePayload('e30=', true, false)).toEqual({ body: 'e30=', encoding: 'base64' });
  });
});

describe('websockets.json and the timeline', () => {
  const rows: WebSocketRow[] = [
    { sessionId: 's1', socketId: 'ws.1', tabId: 7, url: 'wss://echo.example/', t: 100, closedT: 3000, status: 101 },
    { sessionId: 's1', socketId: 'ws.2', tabId: 7, url: 'wss://open.example/', t: 200 },
  ];
  const frame = (t: number, direction: 'sent' | 'received', payload: string, opcode = 1, extra: Partial<WebSocketFrameRow> = {}): WebSocketFrameRow =>
    ({ sessionId: 's1', socketId: 'ws.1', t, direction, opcode, payload, ...extra });
  const frameRows = [
    frame(500, 'sent', '{"subscribe":"orders"}'),
    frame(510, 'sent', 'ping'),
    frame(900, 'received', '3q2+7w==', 2),
    frame(2500, 'received', '{"cut', 1, { size: MB + 1, truncated: true }),
  ];
  const sockets = socketsOut(rows, frameRows);

  test('every payload is inline, with t, direction, size and payloadEncoding', () => {
    for (const s of sockets) {
      for (const f of s.frames) {
        expect(f).not.toHaveProperty('payloadFile');
        expect(f).toHaveProperty('payload');
        expect(typeof f.t).toBe('number');
        expect(['sent', 'received']).toContain(f.direction);
        expect(typeof f.size).toBe('number');
        expect(['json', 'text', 'base64']).toContain(f.payloadEncoding);
      }
    }
    expect(sockets[0]!.frames).toEqual([
      { index: 0, t: 500, direction: 'sent', opcode: 1, size: 22, payload: { subscribe: 'orders' }, payloadEncoding: 'json' },
      { index: 1, t: 510, direction: 'sent', opcode: 1, size: 4, payload: 'ping', payloadEncoding: 'text' },
      { index: 2, t: 900, direction: 'received', opcode: 2, size: 4, payload: '3q2+7w==', payloadEncoding: 'base64' },
      { index: 3, t: 2500, direction: 'received', opcode: 1, size: MB + 1, payload: '{"cut', payloadEncoding: 'text', truncated: true },
    ]);
  });

  test('sockets carry counts and leave out what is unknown', () => {
    expect(sockets[0]).toMatchObject({ id: 'ws.1', requestId: 'ws.1', t: 100, endT: 3000, durationMs: 2900, status: 101, frameCount: 4, sentCount: 2, receivedCount: 2 });
    expect(sockets[1]).toEqual({ id: 'ws.2', requestId: 'ws.2', tabId: 7, url: 'wss://open.example/', t: 200, frameCount: 0, sentCount: 0, receivedCount: 0, frames: [] });
  });

  test('timeline: ws-open, ws-close and grouped ws-frame entries with refs', () => {
    const meta = { id: 's1', startedAt: 0, status: 'stopped', url: 'https://app/', tabs: [], navigations: [], settings: {}, mic: { state: 'off' } } as unknown as SessionMeta;
    const ws = buildTimeline({ meta, rrwebByTab: new Map(), requests: [], sockets, console: [], segments: [] }).filter((e) => e.type.startsWith('ws-'));
    expect(ws.map((e) => [e.t, e.type, e.ref])).toEqual([
      [100, 'ws-open', { file: 'websockets.json', socketId: 'ws.1' }],
      [200, 'ws-open', { file: 'websockets.json', socketId: 'ws.2' }],
      // The two sent frames within 1 s are one entry; frames 2 and 3 are received, 1.6 s apart.
      [500, 'ws-frame', { file: 'websockets.json', socketId: 'ws.1', frame: 0, frameEnd: 1 }],
      [900, 'ws-frame', { file: 'websockets.json', socketId: 'ws.1', frame: 2, frameEnd: 2 }],
      [2500, 'ws-frame', { file: 'websockets.json', socketId: 'ws.1', frame: 3, frameEnd: 3 }],
      [3000, 'ws-close', { file: 'websockets.json', socketId: 'ws.1' }],
    ]);
    const [sent, bin] = ws.filter((e) => e.type === 'ws-frame');
    expect(sent).toMatchObject({ direction: 'sent', count: 2, bytes: 26, endT: 510, preview: '{"subscribe":"orders"}' });
    expect(bin).toMatchObject({ direction: 'received', count: 1, preview: '<binary 4 B>' });
  });
});

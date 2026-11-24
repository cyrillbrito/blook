// CDP capture without a browser or the WXT runtime: CdpCapture gets a fake writer.
import { describe, expect, test } from 'bun:test';
import { BODY_MAX_BYTES } from '@blook/core/body-policy';
import type { WebSocketFrameRow, WebSocketRow } from '@blook/core/types';
import { CdpCapture, type Debuggee } from '../lib/capture/cdp';
import type { BatchWriter } from '../lib/capture/writer';

const MB = BODY_MAX_BYTES;

/** A CdpCapture with a writer that keeps rows in memory. */
function capture() {
  const sockets = new Map<string, WebSocketRow>();
  const frames: WebSocketFrameRow[] = [];
  const writer = {
    upsertSocket: (s: WebSocketRow) => void sockets.set(s.socketId, { ...s }),
    addFrame: (f: WebSocketFrameRow) => void frames.push(f),
  } as unknown as BatchWriter;
  const cdp = new CdpCapture('s1', 1_000_000, writer, async () => ({}));
  return { cdp, sockets, frames };
}

const tab = { tabId: 7 };
const frameEvent = (payloadData: string, opcode = 1) => ({ requestId: 'ws.1', timestamp: 10, response: { opcode, payloadData } });

describe('WebSocket capture', () => {
  test('frames are capped at 1 MB with truncated and the original size', () => {
    const { cdp, frames } = capture();
    cdp.handle(tab, 'Network.webSocketCreated', { requestId: 'ws.1', url: 'wss://echo.example/' });
    cdp.handle(tab, 'Network.webSocketFrameSent', frameEvent('hi'));
    cdp.handle(tab, 'Network.webSocketFrameReceived', frameEvent('x'.repeat(MB + 5)));
    cdp.handle(tab, 'Network.webSocketFrameReceived', frameEvent(btoa('y'.repeat(MB + 6)), 2));
    expect(frames.map((f) => [f.direction, f.opcode, f.size, !!f.truncated])).toEqual([
      ['sent', 1, 2, false],
      ['received', 1, MB + 5, true],
      ['received', 2, MB + 6, true],
    ]);
    expect(frames[1]!.payload.length).toBe(MB);
  });
});

describe('child sessions', () => {
  test('an attached iframe or worker gets capture on its own session, then is resumed', async () => {
    const sent: [Debuggee, string][] = [];
    const send = async (target: Debuggee, method: string) => void sent.push([target, method]);
    const cdp = new CdpCapture('s1', 0, {} as BatchWriter, send as never);
    cdp.handle(tab, 'Target.attachedToTarget', { sessionId: 'child-1', targetInfo: { type: 'iframe' } });
    await new Promise((r) => setTimeout(r));
    expect(sent.map(([t, m]) => `${t.tabId}/${t.sessionId}/${m}`)).toEqual([
      '7/child-1/Network.enable',
      '7/child-1/Runtime.enable',
      '7/child-1/Log.enable',
      '7/child-1/Target.setAutoAttach',
      '7/child-1/Runtime.runIfWaitingForDebugger',
    ]);
  });
});

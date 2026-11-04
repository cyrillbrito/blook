// CDP capture without a browser or the WXT runtime: CdpCapture gets a fake writer.
import { describe, expect, test } from 'bun:test';
import { BODY_MAX_BYTES } from '@blook/core/body-policy';
import type { WebSocketFrameRow, WebSocketRow } from '@blook/core/types';
import { CdpCapture } from '../lib/capture/cdp';
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

const frameEvent = (payloadData: string, opcode = 1) => ({ requestId: 'ws.1', timestamp: 10, response: { opcode, payloadData } });

describe('WebSocket capture', () => {
  test('frames are capped at 1 MB with truncated and the original size', () => {
    const { cdp, frames } = capture();
    cdp.handle(7, 'Network.webSocketCreated', { requestId: 'ws.1', url: 'wss://echo.example/' });
    cdp.handle(7, 'Network.webSocketFrameSent', frameEvent('hi'));
    cdp.handle(7, 'Network.webSocketFrameReceived', frameEvent('x'.repeat(MB + 5)));
    cdp.handle(7, 'Network.webSocketFrameReceived', frameEvent(btoa('y'.repeat(MB + 6)), 2));
    expect(frames.map((f) => [f.direction, f.opcode, f.size, !!f.truncated])).toEqual([
      ['sent', 1, 2, false],
      ['received', 1, MB + 5, true],
      ['received', 2, MB + 6, true],
    ]);
    expect(frames[1]!.payload.length).toBe(MB);
  });
});

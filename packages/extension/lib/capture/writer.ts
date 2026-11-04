// Batches rows in memory and writes them to IndexedDB about once a second,
// so a service worker restart loses at most one interval of events.
import { putMany } from '../db';
import type {
  ConsoleRow,
  NetworkRequestRow,
  RrwebEventRow,
  WebSocketFrameRow,
  WebSocketRow,
} from '@blook/core/types';

export class BatchWriter {
  private rrweb: RrwebEventRow[] = [];
  private frames: WebSocketFrameRow[] = [];
  private consoleRows: ConsoleRow[] = [];
  /** Rows that CDP updates in place. Keyed by id, only the latest copy is written. */
  private requests = new Map<string, NetworkRequestRow>();
  private sockets = new Map<string, WebSocketRow>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private chain: Promise<void> = Promise.resolve();

  constructor(private intervalMs = 1000) {}

  start() {
    this.timer ??= setInterval(() => void this.flush(), this.intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  addRrweb(rows: RrwebEventRow[]) {
    for (const row of rows) this.rrweb.push(row);
  }
  addFrame(row: WebSocketFrameRow) {
    this.frames.push(row);
  }
  addConsole(row: ConsoleRow) {
    this.consoleRows.push(row);
  }
  upsertRequest(row: NetworkRequestRow) {
    this.requests.set(row.requestId, row);
  }
  upsertSocket(row: WebSocketRow) {
    this.sockets.set(row.socketId, row);
  }

  /** Writes everything queued so far. Flushes run one after another. */
  flush(): Promise<void> {
    const rrweb = this.rrweb.splice(0);
    const frames = this.frames.splice(0);
    const consoleRows = this.consoleRows.splice(0);
    // Copy, so later in-place updates go into the next flush instead of racing this one.
    const requests = [...this.requests.values()].map((r) => ({ ...r }));
    const sockets = [...this.sockets.values()].map((s) => ({ ...s }));
    this.requests.clear();
    this.sockets.clear();
    const run = async () => {
      const writes: Promise<void>[] = [];
      if (rrweb.length) writes.push(putMany('rrwebEvents', rrweb));
      if (frames.length) writes.push(putMany('wsFrames', frames));
      if (consoleRows.length) writes.push(putMany('console', consoleRows));
      if (requests.length) writes.push(putMany('networkRequests', requests));
      if (sockets.length) writes.push(putMany('wsSockets', sockets));
      const results = await Promise.allSettled(writes);
      for (const r of results) if (r.status === 'rejected') console.error('[blook] flush', r.reason);
    };
    this.chain = this.chain.then(run, run);
    return this.chain;
  }
}

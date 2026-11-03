// IndexedDB schema. Opened from the background and the offscreen document (same extension origin).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AudioChunkRow,
  ConsoleRow,
  NetworkRequestRow,
  RrwebEventRow,
  SessionId,
  SessionMeta,
  TranscriptRow,
  WebSocketFrameRow,
  WebSocketRow,
} from './types';

export interface OverseerDB extends DBSchema {
  sessions: { key: SessionId; value: SessionMeta; indexes: { byStartedAt: number } };
  /** Auto-increment id keeps arrival order; bySessionTab gives rrweb/<tab>.json. */
  rrwebEvents: {
    key: number;
    value: RrwebEventRow;
    indexes: { bySession: SessionId; bySessionTab: [SessionId, number] };
  };
  /** Keyed by [sessionId, requestId] so later CDP events can update the same row. */
  networkRequests: {
    key: [SessionId, string];
    value: NetworkRequestRow;
    indexes: { bySession: SessionId };
  };
  wsSockets: { key: [SessionId, string]; value: WebSocketRow; indexes: { bySession: SessionId } };
  wsFrames: {
    key: number;
    value: WebSocketFrameRow;
    indexes: { bySession: SessionId; bySocket: [SessionId, string] };
  };
  console: { key: number; value: ConsoleRow; indexes: { bySession: SessionId } };
  audioChunks: { key: [SessionId, number]; value: AudioChunkRow; indexes: { bySession: SessionId } };
  transcripts: { key: SessionId; value: TranscriptRow };
}

export type OverseerDBHandle = IDBPDatabase<OverseerDB>;

/** Stores that hold per-session rows with a bySession index. */
export const SESSION_STORES = [
  'rrwebEvents',
  'networkRequests',
  'wsSockets',
  'wsFrames',
  'console',
  'audioChunks',
] as const;

let dbPromise: Promise<OverseerDBHandle> | undefined;

export function openOverseerDB(): Promise<OverseerDBHandle> {
  dbPromise ??= openDB<OverseerDB>('overseer', 1, {
    upgrade(db) {
      db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('byStartedAt', 'startedAt');

      const rrweb = db.createObjectStore('rrwebEvents', { keyPath: 'id', autoIncrement: true });
      rrweb.createIndex('bySession', 'sessionId');
      rrweb.createIndex('bySessionTab', ['sessionId', 'tabId']);

      db.createObjectStore('networkRequests', { keyPath: ['sessionId', 'requestId'] }).createIndex(
        'bySession',
        'sessionId',
      );
      db.createObjectStore('wsSockets', { keyPath: ['sessionId', 'socketId'] }).createIndex(
        'bySession',
        'sessionId',
      );

      const frames = db.createObjectStore('wsFrames', { keyPath: 'id', autoIncrement: true });
      frames.createIndex('bySession', 'sessionId');
      frames.createIndex('bySocket', ['sessionId', 'socketId']);

      db.createObjectStore('console', { keyPath: 'id', autoIncrement: true }).createIndex(
        'bySession',
        'sessionId',
      );
      db.createObjectStore('audioChunks', { keyPath: ['sessionId', 'index'] }).createIndex(
        'bySession',
        'sessionId',
      );
      db.createObjectStore('transcripts', { keyPath: 'sessionId' });
    },
  });
  return dbPromise;
}

/** Writes a batch of rows to one store in a single transaction. */
export async function putMany<S extends (typeof SESSION_STORES)[number]>(
  store: S,
  rows: OverseerDB[S]['value'][],
): Promise<void> {
  const db = await openOverseerDB();
  const tx = db.transaction(store, 'readwrite');
  await Promise.all([...rows.map((row) => tx.store.put(row as never)), tx.done]);
}

/** All rows of one session in a store, in key order. */
export async function getBySession<S extends (typeof SESSION_STORES)[number]>(
  store: S,
  sessionId: SessionId,
): Promise<OverseerDB[S]['value'][]> {
  const db = await openOverseerDB();
  return db.getAllFromIndex(store, 'bySession' as never, sessionId as never) as never;
}

export async function listSessions(): Promise<SessionMeta[]> {
  const db = await openOverseerDB();
  return (await db.getAllFromIndex('sessions', 'byStartedAt')).reverse();
}

export async function putSession(meta: SessionMeta): Promise<void> {
  const db = await openOverseerDB();
  await db.put('sessions', meta);
}

/** Deletes a session and all its rows. */
export async function deleteSession(sessionId: SessionId): Promise<void> {
  const db = await openOverseerDB();
  const stores = ['sessions', 'transcripts', ...SESSION_STORES] as const;
  const tx = db.transaction(stores, 'readwrite');
  tx.objectStore('sessions').delete(sessionId);
  tx.objectStore('transcripts').delete(sessionId);
  for (const name of SESSION_STORES) {
    const index = tx.objectStore(name).index('bySession' as never);
    for await (const cursor of index.iterate(sessionId as never)) cursor.delete();
  }
  await tx.done;
}

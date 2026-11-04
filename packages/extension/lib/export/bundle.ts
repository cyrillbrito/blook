// The bundle of a stored session: its rows from IndexedDB, zipped by @blook/core/bundle.
import { zipBundle, type BundleOptions } from '@blook/core/bundle';
import type { SessionId } from '@blook/core/types';
import { getBySession, openBlookDB } from '../db';

export async function buildBundle(sessionId: SessionId, opts: BundleOptions = {}): Promise<{ folder: string; zip: Uint8Array }> {
  const db = await openBlookDB();
  const meta = await db.get('sessions', sessionId);
  if (!meta) throw new Error(`session ${sessionId} not found`);
  const [rrweb, requests, sockets, frames, console, audio] = await Promise.all([
    getBySession('rrwebEvents', sessionId),
    getBySession('networkRequests', sessionId),
    getBySession('wsSockets', sessionId),
    getBySession('wsFrames', sessionId),
    getBySession('console', sessionId),
    getBySession('audioChunks', sessionId),
  ]);
  return zipBundle({ meta, rrweb, requests, sockets, frames, console, audio }, opts);
}

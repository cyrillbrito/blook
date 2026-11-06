// The bundle of a stored session: its rows from IndexedDB, zipped by @blook/core/bundle.
// Export and the Replay page both build it here, so Replay shows what the ZIP holds.
import { zipBundle, type BundleOptions } from '@blook/core/bundle';
import type { SessionId } from '@blook/core/types';
import { getBySession, openBlookDB } from '../db';
import { transcriptOptions } from '../transcribe/openrouter';

/** Starts no transcription: the transcript is what's stored (Export runs ensureTranscript first). */
export async function buildBundle(sessionId: SessionId): Promise<{ folder: string; zip: Uint8Array; transcript: BundleOptions }> {
  const db = await openBlookDB();
  const meta = await db.get('sessions', sessionId);
  if (!meta) throw new Error(`session ${sessionId} not found`);
  const [rrweb, requests, sockets, frames, console, audio, transcript] = await Promise.all([
    getBySession('rrwebEvents', sessionId),
    getBySession('networkRequests', sessionId),
    getBySession('wsSockets', sessionId),
    getBySession('wsFrames', sessionId),
    getBySession('console', sessionId),
    getBySession('audioChunks', sessionId),
    transcriptOptions(sessionId),
  ]);
  return { ...(await zipBundle({ meta, rrweb, requests, sockets, frames, console, audio }, transcript)), transcript };
}

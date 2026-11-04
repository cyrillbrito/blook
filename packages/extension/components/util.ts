// UI-only helpers shared by the side panel and the replay page.
import { sendToBackground, type BackgroundRequests, type BackgroundRequestType } from '@/lib/messages';

/**
 * Request to the background that never throws. Resolves to `undefined` when nobody
 * answers (no listener, no reply, or no reply within `timeoutMs`).
 */
export async function tryBackground<K extends BackgroundRequestType>(
  message: { type: K } & BackgroundRequests[K]['req'],
  timeoutMs = 3000,
): Promise<BackgroundRequests[K]['res'] | undefined> {
  const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs));
  try {
    const res = await Promise.race([sendToBackground(message), timeout]);
    return res ?? undefined;
  } catch {
    return undefined;
  }
}

export function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

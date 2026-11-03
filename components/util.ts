// UI-only helpers shared by the side panel and the replay page.
import {
  sendToBackground,
  type BackgroundRequests,
  type BackgroundRequestType,
} from '@/lib/messages';

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

/** 83500 → "1:23", 3723000 → "1:02:03". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Session time with tenths: "1:23.4". */
export function formatSessionTime(ms: number): string {
  return `${formatDuration(ms)}.${Math.floor((Math.max(0, ms) % 1000) / 100)}`;
}

export function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Host plus path, without the scheme. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return url;
  }
}

// Display formatting of session times, durations, sizes and URLs, shared by the viewer and the extension.

/** 83500 → "1:23", 3723000 → "1:02:03". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Session time with tenths: "1:23.4". */
export function formatTime(ms: number): string {
  return `${formatDuration(ms)}.${Math.floor((Math.max(0, ms) % 1000) / 100)}`;
}

export function formatMs(ms: number | undefined): string {
  if (ms == null) return '';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

export function formatBytes(n: number | undefined): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
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

/** Last path segment plus query, like DevTools' Name column. */
export function urlName(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return (last ?? u.host) + u.search;
  } catch {
    return url;
  }
}

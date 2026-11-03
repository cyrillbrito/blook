import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import type { Clock } from './playback';

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

export function cx(...parts: (string | false | undefined | null)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** The clock's time, re-rendering at most every `step` ms of session time. */
export function useNow(clock: Clock, step = 100): number {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    let last = Math.floor(clock.now() / step);
    setNow(clock.now());
    return clock.onTick(() => {
      const q = Math.floor(clock.now() / step);
      if (q !== last) {
        last = q;
        setNow(clock.now());
      }
    });
  }, [clock, step]);
  return now;
}

export function usePlaying(clock: Clock): { playing: boolean; speed: number } {
  const [s, setS] = useState({ playing: clock.playing, speed: clock.speed });
  useEffect(() => clock.onChange(() => setS({ playing: clock.playing, speed: clock.speed })), [clock]);
  return s;
}

/**
 * Marks row `index` in a list with `data-active` and scrolls it into view when `follow` is on.
 * Rows are the list's children with `data-i`. Done on the DOM so the list doesn't re-render.
 */
export function useActiveRow(listRef: RefObject<HTMLElement | null>, index: number, follow: boolean) {
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.querySelector('[data-active]')?.removeAttribute('data-active');
    if (index < 0) return;
    const row = list.querySelector<HTMLElement>(`[data-i="${index}"]`);
    if (!row) return;
    row.setAttribute('data-active', '');
    if (follow) {
      // Scroll only the list, never the page. The list is `relative`, so offsetTop is within it.
      const top = row.offsetTop;
      if (top < list.scrollTop + 24 || top + row.offsetHeight > list.scrollTop + list.clientHeight - 24) {
        list.scrollTop = top - list.clientHeight / 2;
      }
    }
  });
}

export function prettyJson(text: string): { text: string; json: boolean } {
  const s = text.trim();
  if (!(s.startsWith('{') || s.startsWith('['))) return { text, json: false };
  try {
    return { text: JSON.stringify(JSON.parse(s), null, 2), json: true };
  } catch {
    return { text, json: false };
  }
}

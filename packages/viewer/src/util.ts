import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import type { Clock } from './playback';

export { cx } from '@blook/ui';

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

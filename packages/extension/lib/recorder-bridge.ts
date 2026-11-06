// The channel between the MAIN-world rrweb recorder (recorder-main.content.ts) and its
// isolated-world bridge (recorder.content.ts): CustomEvents on `document` whose detail is a
// JSON string, since strings cross worlds safely. No extension APIs, so both worlds can use it.
import type { eventWithTime } from '@rrweb/types';

export interface RecorderEvents {
  // MAIN → bridge
  'blook:ready': {};
  'blook:events': { events: eventWithTime[] };
  /** Answers blook:stop once the last events went out. */
  'blook:stopped': { id: number };
  // bridge → MAIN
  'blook:start': { mask: boolean; canvas: boolean };
  'blook:stop': { id: number };
}

export function emit<K extends keyof RecorderEvents>(type: K, data: RecorderEvents[K]) {
  document.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(data) }));
}

/** Listens for `type`; returns the function that stops listening. */
export function on<K extends keyof RecorderEvents>(type: K, fn: (data: RecorderEvents[K]) => void): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (typeof detail === 'string') fn(JSON.parse(detail));
  };
  document.addEventListener(type, listener);
  return () => document.removeEventListener(type, listener);
}

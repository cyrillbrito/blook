// rrweb recorder, run in the page's MAIN world (/content-scripts/recorder-main.js).
// It has to be MAIN: rrweb patches CSSStyleSheet.insertRule, adoptedStyleSheets, canvas
// contexts and so on, and those patches only see the page's calls in the page's own world.
// In an isolated world, CSS-in-JS rules (emotion in Grafana) were missing from the replay.
//
// No extension APIs here. It talks to the isolated bridge (recorder.content.ts) with
// CustomEvents on `document` whose detail is a JSON string (strings cross worlds safely):
//   main → bridge: overseer:ready, overseer:events {events}, overseer:flushed {id}
//   bridge → main: overseer:start {mask, canvas}, overseer:flush {id}, overseer:stop {id}
import { record } from '@rrweb/record';
import type { eventWithTime } from '@rrweb/types';

const FLUSH_MS = 500;
/** Elements with this class are left out of the recording when masking is on. */
const BLOCK_CLASS = 'overseer-block';
const MASK_TEXT_SELECTOR = '[data-overseer-mask], .overseer-mask';

interface StartOptions {
  mask: boolean;
  canvas: boolean;
}

declare global {
  interface Window {
    __overseerMain?: boolean;
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  allFrames: true,
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    if (window.__overseerMain) return;
    window.__overseerMain = true;
    let started = false;
    on('overseer:start', (opts: StartOptions) => {
      if (started) return;
      started = true;
      void start(opts);
    });
    emit('overseer:ready', {});
  },
});

function emit(type: string, data: unknown) {
  document.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(data) }));
}

function on(type: string, fn: (data: any) => void) {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (typeof detail === 'string') fn(JSON.parse(detail));
  };
  document.addEventListener(type, listener);
  return () => document.removeEventListener(type, listener);
}

async function start(opts: StartOptions) {
  let buffer: eventWithTime[] = [];
  const flush = () => {
    if (!buffer.length) return;
    const events = buffer;
    buffer = [];
    emit('overseer:events', { events });
  };

  await bodyReady();

  // In child frames rrweb either does nothing (same-origin: the parent records them)
  // or posts events to the parent (cross-origin), so only the top frame's emit gets data.
  const stopRecord = startEarly(() =>
    record({
      emit(event) {
        buffer.push(event);
      },
      recordCrossOriginIframes: true,
      inlineStylesheet: true,
      collectFonts: true,
      ...(opts.canvas
        ? { recordCanvas: true, sampling: { canvas: 2 }, dataURLOptions: { type: 'image/webp', quality: 0.5 } }
        : {}),
      ...(opts.mask
        ? { maskAllInputs: true, maskTextSelector: MASK_TEXT_SELECTOR, blockClass: BLOCK_CLASS }
        : { maskInputOptions: { password: true } }),
    }),
  );

  const timer = setInterval(flush, FLUSH_MS);
  addEventListener('pagehide', flush);
  addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());

  on('overseer:flush', ({ id }) => {
    flush();
    emit('overseer:flushed', { id });
  });
  const offStop = on('overseer:stop', ({ id }) => {
    stopRecord?.();
    clearInterval(timer);
    flush();
    emit('overseer:flushed', { id });
    offStop();
  });
}

/**
 * Resolves once <body> exists (or the document stops loading). The script runs at
 * document_start, when only an empty <html> may exist.
 */
function bodyReady(): Promise<void> {
  if (document.body || document.readyState !== 'loading') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      observer.disconnect();
      document.removeEventListener('DOMContentLoaded', done);
      resolve();
    };
    const observer = new MutationObserver(() => document.body && done());
    observer.observe(document, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', done);
  });
}

/**
 * rrweb only takes its first full snapshot when readyState is 'interactive' or 'complete'.
 * Otherwise it waits for `load`, which on heavy pages (Grafana) came ~10 s after Record,
 * so the start of the session had no DOM. While the page is still parsing, report
 * 'interactive' for the duration of the synchronous record() call: rrweb snapshots the partial
 * DOM right away, and its MutationObserver records the rest of the parse as mutations.
 * The own-property override is removed before any page script can run again.
 */
function startEarly<T>(start: () => T): T {
  if (document.readyState !== 'loading') return start();
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'interactive' });
  try {
    return start();
  } finally {
    delete (document as { readyState?: unknown }).readyState;
  }
}

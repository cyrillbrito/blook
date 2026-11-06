// rrweb recorder, run in the page's MAIN world (/content-scripts/recorder-main.js).
// It has to be MAIN: rrweb patches CSSStyleSheet.insertRule, adoptedStyleSheets, canvas
// contexts and so on, and those patches only see the page's calls in the page's own world.
// In an isolated world, CSS-in-JS rules (emotion in Grafana) would be missing from the replay.
// No extension APIs here: it talks to the isolated bridge (recorder.content.ts) through lib/recorder-bridge.ts.
import { record } from '@rrweb/record';
import type { eventWithTime } from '@rrweb/types';
import { emit, on, type RecorderEvents } from '@/lib/recorder-bridge';

const FLUSH_MS = 500;
/** Elements with this class are left out of the recording when masking is on. */
const BLOCK_CLASS = 'blook-block';
const MASK_TEXT_SELECTOR = '[data-blook-mask], .blook-mask';

declare global {
  interface Window {
    __blookMain?: boolean;
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  allFrames: true,
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    if (window.__blookMain) return;
    window.__blookMain = true;
    let started = false;
    on('blook:start', (opts) => {
      if (started) return;
      started = true;
      void start(opts);
    });
    emit('blook:ready', {});
  },
});

async function start(opts: RecorderEvents['blook:start']) {
  let buffer: eventWithTime[] = [];
  const flush = () => {
    if (!buffer.length) return;
    const events = buffer;
    buffer = [];
    emit('blook:events', { events });
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
      // Marks each input event as user-made or programmatic, so the timeline can drop the latter.
      userTriggeredOnInput: true,
      ...(opts.canvas ? { recordCanvas: true, sampling: { canvas: 2 }, dataURLOptions: { type: 'image/webp', quality: 0.5 } } : {}),
      ...(opts.mask
        ? { maskAllInputs: true, maskTextSelector: MASK_TEXT_SELECTOR, blockClass: BLOCK_CLASS }
        : { maskInputOptions: { password: true } }),
    }),
  );

  const timer = setInterval(flush, FLUSH_MS);
  addEventListener('pagehide', flush);
  addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());

  const offStop = on('blook:stop', ({ id }) => {
    stopRecord?.();
    clearInterval(timer);
    flush();
    emit('blook:stopped', { id });
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
 * Otherwise it waits for `load`, which on heavy pages (Grafana) comes ~10 s after Record,
 * leaving the start of the session with no DOM. While the page is still parsing, report
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

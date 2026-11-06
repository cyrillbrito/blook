// Isolated-world bridge for the MAIN-world rrweb recorder (recorder-main.content.ts).
// It asks the background whether to record, starts the recorder, and forwards its event
// batches to the background, since the MAIN world has no extension APIs.
// Registered by the background at Record (all frames, document_start) next to
// /content-scripts/recorder-main.js, and also injected with executeScript as a fallback.
import type { eventWithTime } from '@rrweb/types';
import { sendToBackground, type ContentMessage } from '@/lib/messages';
import { emit, on, type RecorderEvents } from '@/lib/recorder-bridge';

declare global {
  interface Window {
    /** Set once per document; a second injection only retries the hello. */
    __blookBridge?: { hello: () => Promise<void> };
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  allFrames: true,
  runAt: 'document_start',
  main() {
    if (window.__blookBridge) return void window.__blookBridge.hello();
    start();
  },
});

function start() {
  // Listen first: the MAIN script may run before or after this one.
  let options: RecorderEvents['blook:start'] | undefined;
  on('blook:ready', () => options && emit('blook:start', options));

  let buffer: eventWithTime[] = [];
  let sending: Promise<unknown> = Promise.resolve();
  const send = () => {
    if (!buffer.length || !browser.runtime?.id) return sending;
    const events = buffer;
    buffer = [];
    sending = sending.then(() =>
      sendToBackground({ type: 'rrweb/events', events }).catch(() => {
        buffer = events.concat(buffer); // worker restarting: retry with the next batch
      }),
    );
    return sending;
  };
  on('blook:events', ({ events }) => {
    for (const e of events) buffer.push(e);
    void send();
  });

  const waiting = new Map<number, () => void>();
  on('blook:stopped', ({ id }) => waiting.get(id)?.());
  let nextId = 1;
  /** Stops the MAIN recorder, then waits until its last events reached the background. */
  const stop = () =>
    new Promise<void>((resolve) => {
      const id = nextId++;
      const timer = setTimeout(done, 1000); // recorder never started in this frame
      function done() {
        clearTimeout(timer);
        waiting.delete(id);
        resolve();
      }
      waiting.set(id, done);
      emit('blook:stop', { id });
    }).then(() => send());

  browser.runtime.onMessage.addListener((msg: ContentMessage, _sender, sendResponse) => {
    if (msg.type !== 'rrweb/stop') return undefined;
    stop().then(() => sendResponse({ ok: true }));
    return true;
  });

  const hello = async () => {
    if (options) return;
    const res = await sendToBackground({ type: 'rrweb/hello' }).catch(() => undefined);
    if (!res?.record || options) return;
    options = { mask: res.mask, canvas: res.canvas };
    emit('blook:start', options);
  };
  window.__blookBridge = { hello };
  void hello();
}

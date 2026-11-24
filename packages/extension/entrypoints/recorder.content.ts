// Isolated-world bridge for the MAIN-world rrweb recorder (recorder-main.content.ts), which has no
// extension APIs. It runs in every page while recording, so outside recorded tabs it stops after its hello.
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
      deliver(events).catch(() => {
        buffer = events.concat(buffer); // no worker to receive it: retry with the next batch
      }),
    );
    return sending;
  };
  on('blook:events', ({ events }) => {
    if (!options || !Array.isArray(events)) return; // a page can fire this event too
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

/**
 * Sends a batch, halving it when Chrome rejects it as too big (a full snapshot of a heavy page can be).
 * An event too big alone is dropped so it can't block the rest. Throws only when the background can't be reached.
 */
async function deliver(events: eventWithTime[]): Promise<void> {
  try {
    await sendToBackground({ type: 'rrweb/events', events });
  } catch (err) {
    if (/receiving end|establish connection/i.test(String(err))) throw err;
    if (events.length === 1) return void console.warn('[blook] dropped an rrweb event too big to send', err);
    const half = Math.ceil(events.length / 2);
    await deliver(events.slice(0, half));
    await deliver(events.slice(half));
  }
}

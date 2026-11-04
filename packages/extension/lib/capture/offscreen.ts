// Creates and talks to the offscreen document that records the mic.
import { browser } from 'wxt/browser';
import type { OffscreenMessage, OffscreenReply } from '../messages';

const URL_PATH = '/offscreen.html';
let creating: Promise<void> | undefined;

async function hasOffscreen(): Promise<boolean> {
  const contexts = await browser.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as never],
    documentUrls: [browser.runtime.getURL(URL_PATH)],
  });
  return contexts.length > 0;
}

export async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreen()) return;
  creating ??= browser.offscreen
    .createDocument({
      url: URL_PATH,
      reasons: ['USER_MEDIA' as never],
      justification: 'Record microphone narration during a Blook session',
    })
    .finally(() => (creating = undefined));
  await creating;
}

export async function closeOffscreen(): Promise<void> {
  if (await hasOffscreen()) await browser.offscreen.closeDocument().catch(() => {});
}

export function sendToOffscreen(message: OffscreenMessage, timeoutMs = 10_000): Promise<OffscreenReply> {
  return Promise.race([
    browser.runtime.sendMessage(message) as Promise<OffscreenReply>,
    new Promise<OffscreenReply>((resolve) =>
      setTimeout(() => resolve({ ok: false, error: 'offscreen document did not answer' }), timeoutMs),
    ),
  ]);
}

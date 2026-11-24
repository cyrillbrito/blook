import { deleteSession, listSessions, openBlookDB } from '@/lib/db';
import type { BackgroundHandlers, BackgroundMessage, SessionListItem } from '@/lib/messages';
import {
  addRrwebEvents,
  getStatus,
  initSession,
  isRecordedTab,
  onMicError,
  onMicPermissionGranted,
  rrwebHello,
  startSession,
  statusForTab,
  stopSession,
} from '@/lib/capture/session';
import { exportSession } from '@/lib/export/download';
import { pillPositionItem } from '@/lib/settings';
import { transcribeChunkSoon, transcriptionStatus } from '@/lib/transcribe/openrouter';

export default defineBackground(() => {
  // storage.local holds the OpenRouter key; content scripts run inside web pages and get no access to it.
  void browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const ready = initSession();

  // The start/stop shortcut (manifest `commands`, Alt+Shift+R by default): records the active tab, or stops.
  browser.commands.onCommand.addListener(async (command, tab) => {
    if (command !== 'toggle-recording') return;
    await ready;
    if (getStatus().state === 'recording') return void stopSession();
    if (getStatus().state !== 'idle') return;
    const tabId = tab?.id ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (tabId !== undefined) void startSession(tabId);
  });

  const handlers: BackgroundHandlers = {
    'session/start': (m) => startSession(m.tabId),
    'session/stop': () => stopSession(),
    'session/status': () => getStatus(),
    'sessions/list': async () => {
      const list = await listSessions();
      return Promise.all(
        list.map(async (s): Promise<SessionListItem> => ({ ...s, transcription: await transcriptionStatus(s.id).catch(() => undefined) })),
      );
    },
    'session/delete': async (m) => {
      if (getStatus().session?.id === m.sessionId && getStatus().state !== 'idle') return { ok: false };
      await deleteSession(m.sessionId);
      return { ok: true };
    },
    'session/export': (m) => exportSession(m.sessionId),
    'session/open': async (m, s) => {
      const url = browser.runtime.getURL(`/replay.html?session=${encodeURIComponent(m.sessionId)}`);
      await browser.tabs.create({ url, index: s.tab ? s.tab.index + 1 : undefined, windowId: s.tab?.windowId });
      return { ok: true };
    },
    'rrweb/hello': (_m, s) => rrwebHello(s),
    'rrweb/events': (m, s) => ({ ok: addRrwebEvents(s.tab?.id, s.frameId, m.events) }),
    'pill/hello': async (_m, s) => ({ status: statusForTab(s.tab?.id ?? -1), position: await pillPositionItem.getValue() }),
    'pill/moved': async (m) => {
      await pillPositionItem.setValue({ x: Math.round(m.position.x), y: Math.round(m.position.y) });
      return { ok: true };
    },
    'audio/chunk-saved': (m) => {
      // Transcribe right away, in the background; the reply doesn't wait for it.
      void transcribeChunkSoon(m.sessionId, m.index).catch((err) => console.warn('[blook] transcription', err));
      return { ok: true };
    },
    'mic/error': async (m) => {
      await onMicError(m.error, m.needsPermission);
      return { ok: true };
    },
    'mic/permission-granted': () => onMicPermissionGranted(),
  };

  browser.runtime.onMessage.addListener((message: BackgroundMessage | { target?: string }, sender, sendResponse) => {
    if ('target' in message && message.target) return undefined; // for the offscreen document
    const m = message as BackgroundMessage;
    // One cast: TypeScript can't pair a union message with its handler.
    const handler = handlers[m.type] as ((m: BackgroundMessage, s: typeof sender) => unknown) | undefined;
    if (!handler) return undefined;
    ready
      .then(async () => {
        if (!isExtensionPage(sender) && !(await contentScriptMay(m, sender.tab?.id))) throw new Error(`not allowed from ${sender.url}`);
        return handler(m, sender);
      })
      .then(sendResponse, (err: unknown) => {
        console.error('[blook]', m.type, err);
        sendResponse(undefined);
      });
    return true;
  });
});

/** The popup, the Recordings and Replay pages, the offscreen document: anything served from the extension itself. */
function isExtensionPage(sender: Browser.runtime.MessageSender): boolean {
  return !!sender.url?.startsWith(browser.runtime.getURL('/'));
}

/**
 * Content scripts run inside web pages, where a compromised page could send any message. They may only
 * ask about the tab they're in: record it, stop it, and open or download the session that recorded it.
 */
async function contentScriptMay(m: BackgroundMessage, tabId: number | undefined): Promise<boolean> {
  if (tabId === undefined) return false;
  switch (m.type) {
    case 'rrweb/hello':
    case 'rrweb/events':
    case 'pill/hello':
      return true; // answered for the sender's tab only
    case 'session/stop':
      return isRecordedTab(tabId);
    case 'pill/moved':
      return !!statusForTab(tabId).session;
    case 'session/open':
    case 'session/export': {
      const meta = await (await openBlookDB()).get('sessions', m.sessionId);
      return !!meta?.tabs.some((t) => t.tabId === tabId);
    }
    default:
      return false;
  }
}

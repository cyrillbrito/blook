import { deleteSession, listSessions } from '@/lib/db';
import type { BackgroundHandlers, BackgroundMessage, SessionListItem } from '@/lib/messages';
import {
  addRrwebEvents,
  getStatus,
  onMicError,
  onMicPermissionGranted,
  registerListeners,
  restoreSession,
  rrwebHello,
  startSession,
  stopSession,
} from '@/lib/capture/session';
import { exportSession } from '@/lib/export/download';
import { transcribeChunkSoon, transcriptionStatus } from '@/lib/transcribe/openrouter';

export default defineBackground(() => {
  registerListeners();
  const ready = restoreSession().catch((err) => console.error('[blook] restore', err));

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
    'rrweb/hello': (_m, s) => rrwebHello(s.tab?.id),
    'rrweb/events': (m, s) => ({ ok: addRrwebEvents(s.tab?.id, s.frameId, m.events) }),
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
    const { type } = message as BackgroundMessage;
    // One cast: TypeScript can't pair a union message with its handler.
    const handler = handlers[type] as ((m: BackgroundMessage, s: typeof sender) => unknown) | undefined;
    if (!handler) return undefined;
    ready
      .then(() => handler(message as BackgroundMessage, sender))
      .then(sendResponse, (err: unknown) => {
        console.error('[blook]', type, err);
        sendResponse(undefined);
      });
    return true;
  });
});

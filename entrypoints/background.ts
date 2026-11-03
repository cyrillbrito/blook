import { deleteSession, listSessions } from '@/lib/db';
import type { BackgroundMessage, BackgroundRequests } from '@/lib/messages';
import { settingsItem } from '@/lib/settings';
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

type Handler = (msg: any, sender: Browser.runtime.MessageSender) => unknown | Promise<unknown>;

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel.
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[overseer] setPanelBehavior', err));

  registerListeners();
  const ready = restoreSession().catch((err) => console.error('[overseer] restore', err));

  const handlers: { [K in keyof BackgroundRequests]: Handler } = {
    'session/start': (m) => startSession(m.tabId),
    'session/stop': () => stopSession(),
    'session/status': () => getStatus(),
    'sessions/list': async () => {
      const list = await listSessions();
      await Promise.all(
        list.map(async (s) => {
          s.transcription = await transcriptionStatus(s.id).catch(() => undefined);
        }),
      );
      return list;
    },
    'session/delete': async (m) => {
      if (getStatus().session?.id === m.sessionId && getStatus().state !== 'idle') return { ok: false };
      await deleteSession(m.sessionId);
      return { ok: true };
    },
    'session/export': (m) => exportSession(m.sessionId),
    'settings/get': () => settingsItem.getValue(),
    'settings/set': async (m) => {
      const next = { ...(await settingsItem.getValue()), ...m.settings };
      await settingsItem.setValue(next);
      return next;
    },
    'rrweb/hello': (_m, s) => rrwebHello(s.tab?.id),
    'rrweb/events': (m, s) => ({ ok: addRrwebEvents(s.tab?.id, s.frameId, m.events) }),
    'audio/chunk-saved': (m) => {
      // Transcribe right away, in the background; the reply doesn't wait for it.
      void transcribeChunkSoon(m.sessionId, m.index).catch((err) => console.warn('[overseer] transcription', err));
      return { ok: true };
    },
    'mic/error': async (m) => {
      await onMicError(m.error, m.needsPermission);
      return { ok: true };
    },
    'mic/permission-granted': async () => {
      await onMicPermissionGranted();
      return { ok: true };
    },
  };

  browser.runtime.onMessage.addListener((message: BackgroundMessage | { target?: string }, sender, sendResponse) => {
    if ('target' in message && message.target) return undefined; // for the offscreen document
    const handler = handlers[(message as BackgroundMessage).type];
    if (!handler) return undefined;
    ready
      .then(() => handler(message, sender))
      .then(sendResponse, (err) => {
        console.error('[overseer]', (message as BackgroundMessage).type, err);
        sendResponse({ ok: false, error: String(err?.message ?? err) });
      });
    return true;
  });
});

// Recording session lifecycle, run in the background service worker:
// debugger attach and detach, recorder injection, mic, batching and status broadcasts.
import { browser } from 'wxt/browser';
import { getBySession, openBlookDB, putSession } from '../db';
import type { OffscreenReply, PanelMessage, RecordingStatus } from '../messages';
import { settingsItem } from '../settings';
import type { MicInfo, RrwebEventRow, SessionMeta } from '../types';
import { CdpCapture, enableDomains, type SendCommand } from './cdp';
import { closeOffscreen, ensureOffscreen, sendToOffscreen } from './offscreen';
import { BatchWriter } from './writer';
import { ensureTranscript } from '../transcribe/openrouter';
import type { eventWithTime } from '@rrweb/types';

/** Isolated-world bridge (extension messaging) and MAIN-world rrweb recorder. */
const RECORDER_JS = '/content-scripts/recorder.js';
const RECORDER_MAIN_JS = '/content-scripts/recorder-main.js';
const RECORDER_MAIN_ID = 'blook-recorder-main';
const RECORDER_ID = 'blook-recorder';
const CHUNK_MS = 30_000;
/** Saved in storage.session so a restarted service worker can resume the session. */
const ACTIVE_KEY = 'blook-active';

interface Active {
  meta: SessionMeta;
  /** Tabs with an attached debugger. */
  attached: Set<number>;
  writer: BatchWriter;
  cdp: CdpCapture;
  keepalive: ReturnType<typeof setInterval>;
  micRunning: boolean;
  permissionTabId?: number;
  /** The Record reload of the first tab started loading (so its `complete` is the new page). */
  reloadSeen?: boolean;
  /** Fallback that ends the loading-page phase if the load event never comes. */
  readyTimer?: ReturnType<typeof setTimeout>;
}

let status: RecordingStatus = { state: 'idle' };
let active: Active | undefined;
let stopping: Promise<RecordingStatus> | undefined;

const send: SendCommand = (tabId, method, params) =>
  browser.debugger.sendCommand({ tabId }, method, params as never) as Promise<any>;

export function getStatus(): RecordingStatus {
  return status;
}

function setStatus(next: RecordingStatus) {
  // Mirror the mic state of the session so the panel can show it without digging into meta.
  status = { ...next, mic: next.session?.mic?.state ?? next.mic };
  const msg: PanelMessage = { type: 'status/update', status };
  browser.runtime.sendMessage(msg).catch(() => {}); // no side panel open
}

function persist() {
  if (!active) return void browser.storage.session.remove(ACTIVE_KEY);
  void browser.storage.session.set({
    [ACTIVE_KEY]: { meta: active.meta, attached: [...active.attached], micRunning: active.micRunning },
  });
}

function sessionIdFor(epoch: number): string {
  const d = new Date(epoch);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function makeActive(meta: SessionMeta, attached: number[]): Active {
  const writer = new BatchWriter();
  writer.start();
  return {
    meta,
    attached: new Set(attached),
    writer,
    cdp: new CdpCapture(meta.id, meta.startedAt, writer, send),
    // Any extension API call resets the service worker idle timer (Chrome 110+).
    keepalive: setInterval(() => void browser.runtime.getPlatformInfo(), 20_000),
    micRunning: false,
  };
}

async function attach(tabId: number) {
  await browser.debugger.attach({ tabId }, '1.3');
  active?.attached.add(tabId);
  await enableDomains(send, tabId);
}

async function registerRecorder() {
  await browser.scripting.unregisterContentScripts({ ids: [RECORDER_ID, RECORDER_MAIN_ID] }).catch(() => {});
  await browser.scripting.registerContentScripts([
    {
      id: RECORDER_MAIN_ID,
      js: [RECORDER_MAIN_JS],
      matches: ['<all_urls>'],
      allFrames: true,
      runAt: 'document_start',
      world: 'MAIN',
      persistAcrossSessions: false,
    },
    {
      id: RECORDER_ID,
      js: [RECORDER_JS],
      matches: ['<all_urls>'],
      allFrames: true,
      runAt: 'document_start',
      persistAcrossSessions: false,
    },
  ]);
}

/** Fallback for documents the registered script missed. The script ignores a second injection. */
function inject(tabId: number) {
  browser.scripting
    .executeScript({ target: { tabId, allFrames: true }, files: [RECORDER_MAIN_JS], world: 'MAIN' })
    .catch(() => {});
  browser.scripting
    .executeScript({ target: { tabId, allFrames: true }, files: [RECORDER_JS] })
    .catch(() => {});
}

export async function startSession(tabId: number): Promise<RecordingStatus> {
  if (status.state !== 'idle') return status;
  const tab = await browser.tabs.get(tabId).catch(() => undefined);
  if (!tab?.url || !/^(https?|file):/.test(tab.url)) {
    setStatus({ state: 'idle', error: 'Blook can only record http(s) and file pages.' });
    return status;
  }
  const settings = await settingsItem.getValue();
  const { openRouterApiKey: _key, ...safeSettings } = settings;
  const epoch = Date.now();
  const meta: SessionMeta = {
    id: sessionIdFor(epoch),
    startedAt: epoch,
    status: 'recording',
    url: tab.url,
    title: tab.title,
    tabs: [{ tabId, t: 0, url: tab.url }],
    navigations: [{ tabId, t: 0, url: tab.url }],
    settings: safeSettings,
    mic: { state: settings.mic ? 'starting' : 'off' },
  };
  active = makeActive(meta, []);
  setStatus({ state: 'starting', session: meta });

  try {
    await attach(tabId);
    await registerRecorder();
  } catch (err) {
    await teardown();
    const msg = String((err as Error)?.message ?? err);
    setStatus({
      state: 'idle',
      error: /already attached/i.test(msg)
        ? 'Another debugger (DevTools?) is attached to this tab. Close it and try again.'
        : `Could not start: ${msg}`,
    });
    return status;
  }

  await putSession(meta);
  persist();
  setStatus({ state: 'recording', phase: 'loading-page', session: meta });
  // Reload so the rrweb snapshot is fresh and every request and socket is seen from the start.
  // No bypassCache: re-downloading a big SPA (10 MB of Grafana JS) left the page blank for
  // seconds. Cached responses still show up in CDP (fromDiskCache).
  await browser.tabs.reload(tabId).catch(() => {});
  active.readyTimer = setTimeout(() => markPageReady('timeout'), PAGE_READY_TIMEOUT_MS);
  if (settings.mic) void startMic();
  return status;
}

async function startMic() {
  if (!active || active.micRunning) return;
  try {
    setMic({ state: 'starting' });
    await ensureOffscreen();
    const msg = {
      target: 'offscreen',
      type: 'mic/start',
      sessionId: active.meta.id,
      startedAt: active.meta.startedAt,
      chunkMs: CHUNK_MS,
    } as const;
    let reply: OffscreenReply = await sendToOffscreen(msg).catch((err): OffscreenReply => ({ ok: false, error: String(err) }));
    // A freshly created offscreen document may not have its listener up yet.
    if (!reply.ok && /receiving end|did not answer/i.test(reply.error ?? '')) {
      await new Promise((r) => setTimeout(r, 300));
      reply = await sendToOffscreen(msg).catch((err): OffscreenReply => ({ ok: false, error: String(err) }));
    }
    if (!active) return;
    if (reply.ok) {
      active.micRunning = true;
      setMic({ state: 'recording' });
      persist();
      if (status.error?.startsWith('Microphone') || status.error?.startsWith('Allow the microphone')) {
        setStatus({ ...status, error: undefined });
      }
      return;
    }
    await onMicError(reply.error ?? 'mic failed', reply.needsPermission);
  } catch (err) {
    await onMicError(String(err));
  }
}

/** Updates the session's mic info, saves it and pushes the status. */
function setMic(mic: MicInfo) {
  if (!active) return;
  active.meta.mic = { ...active.meta.mic, ...mic };
  if (mic.state === 'recording') delete active.meta.mic.error;
  void putSession(active.meta);
  persist();
  setStatus({ ...status, session: active.meta });
}

export async function onMicError(error: string, needsPermission?: boolean) {
  if (!active) return;
  console.warn('[blook] mic', error);
  active.micRunning = false;
  setMic({ state: needsPermission ? 'needs-permission' : 'failed', error });
  if (needsPermission) {
    if (active.permissionTabId === undefined) {
      const tab = await browser.tabs.create({ url: browser.runtime.getURL('/mic-permission.html') });
      if (active) active.permissionTabId = tab.id;
    }
    setStatus({ ...status, error: 'Allow the microphone in the tab that opened. Recording continues without audio until then.' });
  } else {
    setStatus({ ...status, error: `Microphone: ${error}` });
  }
}

export async function onMicPermissionGranted() {
  if (!active) return;
  const permTab = active.permissionTabId;
  active.permissionTabId = undefined;
  const recorded = active.meta.tabs[0]!.tabId;
  await browser.tabs.update(recorded, { active: true }).catch(() => {});
  if (permTab !== undefined) await browser.tabs.remove(permTab).catch(() => {});
  if (active.meta.settings.mic) await startMic();
}

export function rrwebHello(tabId: number | undefined): { record: boolean; mask: boolean; canvas: boolean } {
  const ok = !!active && tabId !== undefined && active.attached.has(tabId) && status.state !== 'stopping';
  return { record: ok, mask: !!active?.meta.settings.mask, canvas: !!active?.meta.settings.canvas };
}

export function addRrwebEvents(tabId: number | undefined, frameId: number | undefined, events: eventWithTime[]) {
  if (!active || tabId === undefined || !active.attached.has(tabId)) return false;
  const { id, startedAt } = active.meta;
  const primary = active.meta.tabs[0]!.tabId;
  if (active.meta.firstSnapshotT === undefined && tabId === primary && (frameId ?? 0) === 0) {
    const snap = events.find((e) => e.type === 2); // EventType.FullSnapshot
    if (snap) {
      active.meta.firstSnapshotT = snap.timestamp - startedAt;
      void putSession(active.meta);
      persist();
      // Live once the page also fired load (the snapshot alone can be an empty shell).
      if (active.meta.pageReadyT !== undefined) setStatus({ ...status, phase: 'live', session: active.meta });
    }
  }
  const rows: RrwebEventRow[] = events.map((event) => ({
    sessionId: id,
    tabId,
    frameId: frameId ?? 0,
    t: event.timestamp - startedAt,
    event,
  }));
  active.writer.addRrweb(rows);
  return true;
}

const PAGE_READY_TIMEOUT_MS = 30_000;

/**
 * The recorded page finished loading (load event of the Record reload, or the fallback timer).
 * Saves pageReadyT and ends the "Loading page…" phase once a snapshot exists too.
 */
function markPageReady(why: 'load' | 'timeout') {
  const a = active;
  if (!a || a.meta.pageReadyT !== undefined) return;
  clearTimeout(a.readyTimer);
  a.meta.pageReadyT = Date.now() - a.meta.startedAt;
  if (why === 'timeout') console.warn('[blook] page load not seen; marking ready');
  void putSession(a.meta);
  persist();
  if (status.state === 'recording') {
    setStatus({ ...status, phase: a.meta.firstSnapshotT !== undefined ? 'live' : 'loading-page', session: a.meta });
  }
}

export async function stopSession(error?: string): Promise<RecordingStatus> {
  if (!active) return status;
  stopping ??= doStop(error).finally(() => (stopping = undefined));
  return stopping;
}

async function doStop(error?: string): Promise<RecordingStatus> {
  const a = active!;
  setStatus({ ...status, state: 'stopping', session: a.meta, error: error ?? status.error });

  // Last rrweb batch from each tab (top frame owns the recorder output).
  await Promise.all(
    [...a.attached].map((tabId) =>
      Promise.race([
        browser.tabs.sendMessage(tabId, { type: 'rrweb/stop' }, { frameId: 0 }).catch(() => {}),
        new Promise((r) => setTimeout(r, 3000)),
      ]),
    ),
  );
  // mic/stop resolves only after the partial last chunk is in IndexedDB, so closing is safe after it.
  let micStopError: string | undefined;
  if (a.micRunning) {
    const reply = await sendToOffscreen({ target: 'offscreen', type: 'mic/stop' }, 15_000);
    if (!reply.ok) micStopError = reply.error ?? 'mic did not stop cleanly';
  }
  await closeOffscreen();
  const chunks = (await getBySession('audioChunks', a.meta.id).catch(() => [])).length;
  if (a.meta.settings.mic) {
    const prev = a.meta.mic ?? { state: 'starting' };
    const why =
      micStopError ??
      prev.error ??
      (chunks === 0 ? `no audio captured (mic state was "${prev.state}")` : undefined);
    a.meta.mic = chunks > 0 && !micStopError ? { state: 'stopped', chunks, ...(prev.error ? { error: prev.error } : {}) } : { state: 'failed', chunks, error: why };
  } else {
    a.meta.mic = { state: 'off', chunks };
  }

  for (const tabId of a.attached) await browser.debugger.detach({ tabId }).catch(() => {});
  a.cdp.finalize();
  await teardown();
  await a.writer.flush();

  const endedAt = Date.now();
  a.meta.endedAt = endedAt;
  a.meta.durationMs = endedAt - a.meta.startedAt;
  a.meta.status = 'stopped';
  await putSession(a.meta);
  const micError = a.meta.mic?.state === 'failed' ? `Microphone: ${a.meta.mic.error}` : undefined;
  setStatus({ state: 'idle', session: a.meta, error: error ?? micError });
  // Transcribe now if a key is set, so Export is quick. Export retries if this fails.
  void ensureTranscript(a.meta.id).catch((err) => console.warn('[blook] transcription', err));
  return status;
}

/** Clears timers, scripts and in-memory state. Leaves stored rows alone. */
async function teardown() {
  const a = active;
  active = undefined;
  persist();
  if (a) {
    clearInterval(a.keepalive);
    clearTimeout(a.readyTimer);
    a.writer.stop();
    if (a.permissionTabId !== undefined) browser.tabs.remove(a.permissionTabId).catch(() => {});
  }
  await browser.scripting.unregisterContentScripts({ ids: [RECORDER_ID, RECORDER_MAIN_ID] }).catch(() => {});
}

// ---- Browser events. Registered synchronously at service worker start. ----

export function registerListeners() {
  browser.debugger.onEvent.addListener((source, method, params) => {
    if (!active || source.tabId === undefined || !active.attached.has(source.tabId)) return;
    active.cdp.handle(source.tabId, method, params);
  });

  browser.debugger.onDetach.addListener((source, reason) => {
    const tabId = source.tabId;
    if (!active || tabId === undefined || !active.attached.has(tabId)) return;
    active.attached.delete(tabId);
    persist();
    const primary = active.meta.tabs[0]!.tabId;
    if (reason === 'canceled_by_user') {
      void stopSession('Recording stopped: the debugger banner was dismissed.');
    } else if (tabId === primary || active.attached.size === 0) {
      void stopSession(reason === 'target_closed' ? undefined : `Recording stopped: debugger detached (${reason}).`);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    if (active && tabId === active.meta.tabs[0]!.tabId) void stopSession();
  });

  // Follow tabs opened from a recorded tab.
  browser.tabs.onCreated.addListener(async (tab) => {
    if (!active || tab.id === undefined || tab.openerTabId === undefined) return;
    if (!active.attached.has(tab.openerTabId) || status.state !== 'recording') return;
    const a = active;
    try {
      await attach(tab.id);
    } catch (err) {
      console.warn('[blook] could not follow tab', tab.id, err);
      return;
    }
    const url = tab.pendingUrl || tab.url || '';
    a.meta.tabs.push({ tabId: tab.id, openerTabId: tab.openerTabId, t: Date.now() - a.meta.startedAt, url });
    await putSession(a.meta);
    persist();
    setStatus({ ...status, session: a.meta });
  });

  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (!active || !active.attached.has(tabId)) return;
    if (info.url) {
      const tab = active.meta.tabs.find((t) => t.tabId === tabId);
      if (tab && !tab.url) tab.url = info.url;
      const navs = (active.meta.navigations ??= []);
      if (navs.at(-1)?.url !== info.url || navs.at(-1)?.tabId !== tabId) {
        navs.push({ tabId, t: Date.now() - active.meta.startedAt, url: info.url });
        void putSession(active.meta);
        persist();
      }
    }
    if (tabId === active.meta.tabs[0]!.tabId && active.meta.pageReadyT === undefined) {
      if (info.status === 'loading') active.reloadSeen = true;
      else if (info.status === 'complete' && active.reloadSeen) markPageReady('load');
    }
    if (info.status === 'complete') inject(tabId);
  });
}

/** Resumes a session after the service worker restarted mid-recording. */
export async function restoreSession() {
  const saved = (await browser.storage.session.get(ACTIVE_KEY))[ACTIVE_KEY] as
    | { meta: SessionMeta; attached: number[]; micRunning: boolean }
    | undefined;
  if (!saved || active) return;
  active = makeActive(saved.meta, []);
  active.micRunning = saved.micRunning;
  for (const tabId of saved.attached) {
    try {
      await attach(tabId);
    } catch (err) {
      // Still attached from before the restart: keep using it.
      if (/already attached/i.test(String(err))) active.attached.add(tabId);
    }
  }
  if (active.attached.size === 0) {
    const a = active;
    await teardown();
    a.meta.status = 'stopped';
    a.meta.endedAt = Date.now();
    a.meta.durationMs = a.meta.endedAt - a.meta.startedAt;
    await putSession(a.meta);
    setStatus({ state: 'idle', session: a.meta, error: 'Recording ended while the extension restarted.' });
    return;
  }
  await registerRecorder().catch(() => {});
  if (active.meta.pageReadyT === undefined) active.readyTimer = setTimeout(() => markPageReady('timeout'), 5000);
  persist();
  setStatus({
    state: 'recording',
    phase: active.meta.firstSnapshotT === undefined || active.meta.pageReadyT === undefined ? 'loading-page' : 'live',
    session: active.meta,
  });
  // Make sure the db is open early.
  await openBlookDB();
}

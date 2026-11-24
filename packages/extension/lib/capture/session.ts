// Recording session lifecycle, run in the background service worker:
// debugger attach and detach, recorder injection, mic, batching and status broadcasts.
import { browser, type Browser } from 'wxt/browser';
import { getBySession, openBlookDB, putSession } from '../db';
import type { BroadcastMessage, ContentMessage, OffscreenReply, RecordingStatus } from '../messages';
import { getSettings } from '../settings';
import { isRecordable } from '../recordable';
import type { MicInfo, RrwebEventRow, SessionMeta } from '@blook/core/types';
import { CdpCapture, enableDomains, type SendCommand } from './cdp';
import { closeOffscreen, ensureOffscreen, sendToOffscreen } from './offscreen';
import { BatchWriter } from './writer';
import { ensureTranscript } from '../transcribe/openrouter';
import { EventType, type eventWithTime } from '@rrweb/types';

/** The isolated-world bridge, registered for every page while recording because a registration can't name tabs. */
const RECORDER_JS = '/content-scripts/recorder.js';
const RECORDER_ID = 'blook-recorder';
/** Injected by rrweb/hello into the asking document of a recorded tab: rrweb in the MAIN world, and the pill in the top frame. */
const RECORDER_MAIN_JS = '/content-scripts/recorder-main.js';
const PILL_JS = '/content-scripts/pill.js';
/** Saved in storage.session so a restarted service worker can resume the session. */
const ACTIVE_KEY = 'blook-active';

interface Active {
  meta: SessionMeta;
  /** Tabs with an attached debugger. */
  attached: Set<number>;
  writer: BatchWriter;
  cdp: CdpCapture;
  micRunning: boolean;
  /** The mic start in flight, so Stop waits for it instead of leaving a mic running in the offscreen document. */
  micStart?: Promise<void>;
  /** The mic error shown in the status, cleared once the mic records. */
  micNotice?: string;
  permissionTabId?: number;
  /** The Record reload of the first tab started loading (so its `complete` is the new page). */
  reloadSeen?: boolean;
  /** Fallback that ends the loading-page phase if the load event never comes. */
  readyTimer?: ReturnType<typeof setTimeout>;
}

let status: RecordingStatus = { state: 'idle' };
let active: Active | undefined;

/** Start, stop, restore and the mic retry run one at a time: a Stop or a second Record during Start waits for it. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/** Resolves once a session from before a worker restart is resumed (or there was none). */
let restored: Promise<void> = Promise.resolve();

/** Holds a browser event until the restore is done, in arrival order: the event that woke the worker isn't dropped. */
const afterRestore =
  <A extends unknown[]>(fn: (...args: A) => unknown) =>
  (...args: A) =>
    void restored.then(() => fn(...args));

// chrome.debugger.sendCommand is untyped; SendCommand gives it the CDP types.
const send = ((target, method: string, params?: object) => browser.debugger.sendCommand(target, method, params)) as SendCommand;

export function getStatus(): RecordingStatus {
  return status;
}

export function isRecordedTab(tabId: number): boolean {
  return !!active?.attached.has(tabId) && status.state === 'recording';
}

/** The status a page in `tabId` may see: the current or just-saved session when the tab is in it, else idle. */
export function statusForTab(tabId: number): RecordingStatus {
  return status.session?.tabs.some((t) => t.tabId === tabId) ? status : { state: 'idle' };
}

function setStatus(next: RecordingStatus) {
  status = next;
  const msg: BroadcastMessage & ContentMessage = { type: 'status/update', status };
  browser.runtime.sendMessage(msg).catch(() => {}); // no extension page open
  // The pill in each recorded tab. After Stop too, so it can show "Saved".
  for (const { tabId } of status.session?.tabs ?? []) browser.tabs.sendMessage(tabId, msg, { frameId: 0 }).catch(() => {});
  // Toolbar badge while recording; cleared on stop and failure (both end in idle).
  const rec = status.state !== 'idle';
  void browser.action.setBadgeText({ text: rec ? 'REC' : '' });
  if (rec) {
    void browser.action.setBadgeBackgroundColor({ color: '#cc3f1d' });
    void browser.action.setBadgeTextColor({ color: '#ffffff' });
  }
}

function persist() {
  if (!active) return void browser.storage.session.remove(ACTIVE_KEY);
  void browser.storage.session.set({
    [ACTIVE_KEY]: { meta: active.meta, attached: [...active.attached], micRunning: active.micRunning },
  });
}

/** Saves the active session's meta to IndexedDB, and the resume state for a worker restart. */
function save(a: Active) {
  putSession(a.meta).catch((err) => console.error('[blook] save session', err));
  persist();
}

/** The tab Record was pressed on. */
const primaryTab = (meta: SessionMeta) => meta.tabs[0]!.tabId;

async function endSession(meta: SessionMeta, error?: string) {
  meta.endedAt = Date.now();
  meta.durationMs = meta.endedAt - meta.startedAt;
  meta.status = 'stopped';
  await putSession(meta);
  setStatus({ state: 'idle', session: meta, error });
}

function sessionIdFor(epoch: number): string {
  const d = new Date(epoch);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function makeActive(meta: SessionMeta): Active {
  const writer = new BatchWriter();
  writer.start();
  return { meta, attached: new Set(), writer, cdp: new CdpCapture(meta.id, meta.startedAt, writer, send), micRunning: false };
}

async function attach(tabId: number) {
  await browser.debugger.attach({ tabId }, '1.3');
  active?.attached.add(tabId);
  await enableDomains(send, { tabId });
}

/** Blook registers no other scripts, so clearing all of them also removes any left by a crash or an update. */
const unregisterAll = () => browser.scripting.unregisterContentScripts().catch(() => {});

async function registerRecorder() {
  await unregisterAll();
  await browser.scripting.registerContentScripts([
    { id: RECORDER_ID, js: [RECORDER_JS], matches: ['<all_urls>'], allFrames: true, runAt: 'document_start', persistAcrossSessions: false },
  ]);
}

/** Fallback for documents the registered bridge missed, like the page open at Record. A second injection only repeats its hello. */
function injectBridge(tabId: number) {
  browser.scripting.executeScript({ target: { tabId, allFrames: true }, files: [RECORDER_JS] }).catch(() => {});
}

/** Puts rrweb (MAIN world) into the document that said hello, and the pill when it's the top frame. Both ignore a second injection. */
function injectRecorder(tabId: number, sender: Browser.runtime.MessageSender) {
  const target = sender.documentId ? { tabId, documentIds: [sender.documentId] } : { tabId, frameIds: [sender.frameId ?? 0] };
  browser.scripting.executeScript({ target, files: [RECORDER_MAIN_JS], world: 'MAIN', injectImmediately: true }).catch(() => {});
  if (sender.frameId === 0) browser.scripting.executeScript({ target, files: [PILL_JS], injectImmediately: true }).catch(() => {});
}

export function startSession(tabId: number): Promise<RecordingStatus> {
  return serial(() => doStart(tabId));
}

async function doStart(tabId: number): Promise<RecordingStatus> {
  if (status.state !== 'idle') return status;
  const tab = await browser.tabs.get(tabId).catch(() => undefined);
  if (!tab?.url || !isRecordable(tab.url)) {
    setStatus({ state: 'idle', error: "Chrome doesn't let extensions record this page." });
    return status;
  }
  const settings = await getSettings();
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
  const a = (active = makeActive(meta));
  setStatus({ state: 'starting', session: meta });

  try {
    await attach(tabId);
    await registerRecorder();
    await putSession(meta);
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

  persist();
  setStatus({ state: 'recording', phase: 'loading-page', session: meta });
  // Reload so the rrweb snapshot is fresh and every request and socket is seen from the start.
  // No bypassCache: re-downloading a big SPA (10 MB of Grafana JS) leaves the page blank for
  // seconds. Cached responses still show up in CDP (fromDiskCache).
  await browser.tabs.reload(tabId).catch(() => {});
  a.readyTimer = setTimeout(() => markPageReady('timeout'), PAGE_READY_TIMEOUT_MS);
  if (settings.mic) void startMic();
  return status;
}

/** Starts the mic for the active session; a call while one is starting shares it. */
function startMic(): Promise<void> {
  const a = active;
  if (!a || a.micRunning) return Promise.resolve();
  a.micStart ??= runMicStart(a).finally(() => (a.micStart = undefined));
  return a.micStart;
}

async function runMicStart(a: Active) {
  try {
    setMic({ state: 'starting' });
    await ensureOffscreen();
    const msg = { target: 'offscreen', type: 'mic/start', sessionId: a.meta.id, startedAt: a.meta.startedAt } as const;
    const reply: OffscreenReply = await sendToOffscreen(msg).catch((err): OffscreenReply => ({ ok: false, error: String(err) }));
    if (active !== a) return;
    if (reply.ok) {
      a.micRunning = true;
      setMic({ state: 'recording' });
      if (a.micNotice && status.error === a.micNotice) setStatus({ ...status, error: undefined });
      a.micNotice = undefined;
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
  save(active);
  setStatus({ ...status, session: active.meta });
}

export async function onMicError(error: string, needsPermission?: boolean) {
  const a = active;
  if (!a) return;
  console.warn('[blook] mic', error);
  a.micRunning = false;
  setMic({ state: needsPermission ? 'needs-permission' : 'failed', error });
  a.micNotice = needsPermission
    ? 'Allow the microphone in the tab that opened. Recording continues without audio until then.'
    : `Microphone: ${error}`;
  setStatus({ ...status, error: a.micNotice });
  if (needsPermission && a.permissionTabId === undefined) {
    a.permissionTabId = -1; // claimed while the tab opens, so a second error doesn't open another
    const tab = await browser.tabs.create({ url: browser.runtime.getURL('/mic-permission.html') }).catch(() => undefined);
    a.permissionTabId = tab?.id;
  }
}

/**
 * Retries the mic while the permission tab is still open, so a failure can't open another tab.
 * It fails when the user picked "Allow this time": that grant ends with the tab, and the
 * offscreen document doesn't get it. The page then asks for a lasting Allow.
 */
export function onMicPermissionGranted(): Promise<{ ok: boolean }> {
  return serial(async () => {
    if (!active?.meta.settings.mic) return { ok: true };
    // A fresh offscreen document, so no state from the denied attempt is left.
    await closeOffscreen();
    await startMic();
    if (!active?.micRunning) return { ok: false };
    const permTab = active.permissionTabId;
    active.permissionTabId = undefined;
    await browser.tabs.update(primaryTab(active.meta), { active: true }).catch(() => {});
    if (permTab !== undefined) await browser.tabs.remove(permTab).catch(() => {});
    return { ok: true };
  });
}

/** Answers the bridge's hello, and injects the recorder when its tab is recorded. */
export function rrwebHello(sender: Browser.runtime.MessageSender): { record: boolean; mask: boolean; canvas: boolean } {
  const tabId = sender.tab?.id;
  const record = !!active && tabId !== undefined && active.attached.has(tabId) && status.state !== 'stopping';
  if (record) injectRecorder(tabId, sender);
  return { record, mask: !!active?.meta.settings.mask, canvas: !!active?.meta.settings.canvas };
}

export function addRrwebEvents(tabId: number | undefined, frameId: number | undefined, events: eventWithTime[]) {
  if (!active || tabId === undefined || !active.attached.has(tabId)) return false;
  const { id, startedAt } = active.meta;
  if (active.meta.firstSnapshotT === undefined && tabId === primaryTab(active.meta) && (frameId ?? 0) === 0) {
    const snap = events.find((e) => e.type === EventType.FullSnapshot);
    if (snap) {
      active.meta.firstSnapshotT = snap.timestamp - startedAt;
      save(active);
      setStatus({ ...status, phase: phaseOf(active.meta), session: active.meta });
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
/** After a worker restart the Record reload is likely long done and its load event already gone. */
const RESTORED_PAGE_READY_TIMEOUT_MS = 5000;

/** Live once the page has both a DOM snapshot and its load event (the snapshot alone can be an empty shell). */
const phaseOf = (meta: SessionMeta): RecordingStatus['phase'] =>
  meta.firstSnapshotT !== undefined && meta.pageReadyT !== undefined ? 'live' : 'loading-page';

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
  save(a);
  if (status.state === 'recording') {
    setStatus({ ...status, phase: phaseOf(a.meta), session: a.meta });
  }
}

/** Stops the active session, if any. Later calls (a closed tab, a detach) find nothing left to stop. */
export function stopSession(error?: string): Promise<RecordingStatus> {
  return serial(async () => (active ? doStop(active, error) : status));
}

async function doStop(a: Active, error?: string): Promise<RecordingStatus> {
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
  // Else a mic still starting comes up after the offscreen document is closed.
  await a.micStart;
  // mic/stop resolves only after the partial last chunk is in IndexedDB, so closing is safe after it.
  let micStopError: string | undefined;
  if (a.micRunning) {
    const reply = await sendToOffscreen({ target: 'offscreen', type: 'mic/stop' }, 15_000);
    if (!reply.ok) micStopError = reply.error ?? 'mic did not stop cleanly';
  }
  await closeOffscreen();
  const chunks = (await getBySession('audioChunks', a.meta.id).catch(() => [])).length;
  if (a.meta.settings.mic) {
    const prev = a.meta.mic;
    const why = micStopError ?? prev.error ?? (chunks === 0 ? `no audio captured (mic state was "${prev.state}")` : undefined);
    a.meta.mic =
      chunks > 0 && !micStopError
        ? { state: 'stopped', chunks, ...(prev.error ? { error: prev.error } : {}) }
        : { state: 'failed', chunks, error: why };
  } else {
    a.meta.mic = { state: 'off', chunks };
  }

  a.cdp.finalize();
  await teardown();
  await a.writer.flush();

  const micError = a.meta.mic.state === 'failed' ? `Microphone: ${a.meta.mic.error}` : undefined;
  await endSession(a.meta, error ?? micError);
  // Transcribe now if a key is set, so Export is quick. Export retries if this fails.
  void ensureTranscript(a.meta.id).catch((err) => console.warn('[blook] transcription', err));
  return status;
}

/** Detaches the debugger, clears timers, scripts and in-memory state. Leaves stored rows alone. */
async function teardown() {
  const a = active;
  active = undefined; // first, so the debugger listeners ignore what still arrives
  persist();
  if (a) {
    for (const tabId of a.attached) await browser.debugger.detach({ tabId }).catch(() => {});
    clearTimeout(a.readyTimer);
    a.writer.stop();
    if (a.permissionTabId !== undefined) browser.tabs.remove(a.permissionTabId).catch(() => {});
  }
  await unregisterAll();
}

// ---- Browser events ----

/** Registers the browser event listeners (synchronously, at worker start) and resumes a session from before a restart. */
export function initSession(): Promise<void> {
  browser.debugger.onEvent.addListener(
    afterRestore((source: Browser.debugger.DebuggerSession, method: string, params?: object) => {
      const tabId = source.tabId;
      if (!active || tabId === undefined || !active.attached.has(tabId)) return;
      active.cdp.handle({ tabId, sessionId: source.sessionId }, method, params);
    }),
  );

  browser.debugger.onDetach.addListener(
    afterRestore((source: Browser.debugger.Debuggee, reason: `${Browser.debugger.DetachReason}`) => {
      const tabId = source.tabId;
      if (!active || tabId === undefined || !active.attached.has(tabId)) return;
      active.attached.delete(tabId);
      persist();
      if (reason === 'canceled_by_user') {
        void stopSession('Recording stopped: the debugger banner was dismissed.');
      } else if (tabId === primaryTab(active.meta) || active.attached.size === 0) {
        void stopSession(reason === 'target_closed' ? undefined : `Recording stopped: debugger detached (${reason}).`);
      }
    }),
  );

  browser.tabs.onRemoved.addListener(
    afterRestore((tabId: number) => {
      if (active && tabId === primaryTab(active.meta)) void stopSession();
    }),
  );

  // A tab opened from a recorded one (a link with target=_blank, an OAuth popup) is recorded too.
  browser.tabs.onCreated.addListener(
    afterRestore(async (tab: Browser.tabs.Tab) => {
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
      save(a);
      setStatus({ ...status, session: a.meta });
    }),
  );

  browser.tabs.onUpdated.addListener(
    afterRestore((tabId: number, info: Browser.tabs.OnUpdatedInfo) => {
      if (!active || !active.attached.has(tabId)) return;
      if (info.url) {
        const tab = active.meta.tabs.find((t) => t.tabId === tabId);
        if (tab && !tab.url) tab.url = info.url;
        const navs = active.meta.navigations;
        if (navs.at(-1)?.url !== info.url || navs.at(-1)?.tabId !== tabId) {
          navs.push({ tabId, t: Date.now() - active.meta.startedAt, url: info.url });
          save(active);
        }
      }
      if (tabId === primaryTab(active.meta) && active.meta.pageReadyT === undefined) {
        if (info.status === 'loading') active.reloadSeen = true;
        else if (info.status === 'complete' && active.reloadSeen) markPageReady('load');
      }
      if (info.status === 'complete') injectBridge(tabId);
    }),
  );

  restored = serial(restoreSession).catch((err) => console.error('[blook] restore', err));
  return restored;
}

/** Resumes a session after the service worker restarted mid-recording. */
async function restoreSession() {
  const saved = (await browser.storage.session.get(ACTIVE_KEY))[ACTIVE_KEY] as
    | { meta: SessionMeta; attached: number[]; micRunning: boolean }
    | undefined;
  if (active) return;
  if (!saved) return void (await unregisterAll());
  active = makeActive(saved.meta);
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
    const { meta } = active;
    await teardown();
    await endSession(meta, 'Recording ended while the extension restarted.');
    return;
  }
  await registerRecorder().catch(() => {});
  if (active.meta.pageReadyT === undefined) active.readyTimer = setTimeout(() => markPageReady('timeout'), RESTORED_PAGE_READY_TIMEOUT_MS);
  persist();
  setStatus({
    state: 'recording',
    phase: phaseOf(active.meta),
    session: active.meta,
  });
  await openBlookDB();
}

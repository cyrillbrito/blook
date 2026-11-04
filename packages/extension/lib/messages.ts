// Message contracts between extension contexts. All go through browser.runtime messaging.
import type { eventWithTime } from '@rrweb/types';
import type { MicState, SessionId, SessionMeta, SessionTime, Settings } from '@blook/core/types';

/** What the side panel shows. Pushed by the background on every change. */
export interface RecordingStatus {
  state: 'idle' | 'starting' | 'recording' | 'stopping';
  session?: SessionMeta;
  /** Set when attach, injection or the mic failed. */
  error?: string;
  /**
   * While `state` is 'recording': 'loading-page' until the first rrweb full snapshot of the
   * recorded tab arrives (no DOM captured yet), then 'live'.
   */
  phase?: 'loading-page' | 'live';
  /** Mic state of the current session. */
  mic?: MicState;
}

/**
 * Requests to the background, keyed by `type`: `req` is the message, `res` is the reply.
 * Senders: side panel (session/*, sessions/*, settings/*), content script (rrweb/*),
 * offscreen document (audio/*, mic/*).
 */
export interface BackgroundRequests {
  // Side panel → background
  'session/start': { req: { tabId: number }; res: RecordingStatus };
  'session/stop': { req: {}; res: RecordingStatus };
  'session/status': { req: {}; res: RecordingStatus };
  'sessions/list': { req: {}; res: SessionMeta[] };
  'session/delete': { req: { sessionId: SessionId }; res: { ok: boolean } };
  /** Builds the ZIP (and transcribes if needed), then downloads it. */
  'session/export': { req: { sessionId: SessionId }; res: { ok: boolean; error?: string } };
  'settings/get': { req: {}; res: Settings };
  'settings/set': { req: { settings: Partial<Settings> }; res: Settings };

  // Content script (rrweb) → background. tabId and frameId come from the sender.
  /** Asks whether to record and with which rrweb options. */
  'rrweb/hello': { req: {}; res: { record: boolean; mask: boolean; canvas: boolean } };
  /** A batch of rrweb events, flushed every second or so. */
  'rrweb/events': { req: { events: eventWithTime[] }; res: { ok: boolean } };

  // Offscreen document → background
  /**
   * The offscreen page wrote an audio chunk to IndexedDB itself
   * (Blobs can't go through runtime messaging), and reports it here.
   */
  'audio/chunk-saved': { req: { sessionId: SessionId; index: number; t: SessionTime }; res: { ok: boolean } };
  'mic/error': { req: { error: string; needsPermission?: boolean }; res: { ok: boolean } };

  // Mic permission page → background
  /** The user allowed the mic on the visible permission page; the background retries the recorder. */
  'mic/permission-granted': { req: {}; res: { ok: boolean } };
}

export type BackgroundRequestType = keyof BackgroundRequests;

export type BackgroundMessage = {
  [K in BackgroundRequestType]: { type: K } & BackgroundRequests[K]['req'];
}[BackgroundRequestType];

/** Background → offscreen document. Has `target: 'offscreen'` so other contexts ignore it. */
export type OffscreenMessage =
  | { target: 'offscreen'; type: 'mic/start'; sessionId: SessionId; startedAt: number }
  | { target: 'offscreen'; type: 'mic/stop' };

/** Offscreen reply to `mic/start` and `mic/stop`. */
export interface OffscreenReply {
  ok: boolean;
  error?: string;
  needsPermission?: boolean;
}

/** Background → content script (browser.tabs.sendMessage). */
export type ContentMessage = { type: 'rrweb/stop' } | { type: 'rrweb/flush' };

/** Background → side panel broadcast (browser.runtime.sendMessage, no reply). */
export type PanelMessage =
  | { type: 'status/update'; status: RecordingStatus }
  /** A session's stored data changed (e.g. transcription progress): refresh the list. */
  | { type: 'sessions/changed'; sessionId: SessionId };

/** Typed request to the background. */
export function sendToBackground<K extends BackgroundRequestType>(
  message: { type: K } & BackgroundRequests[K]['req'],
): Promise<BackgroundRequests[K]['res']> {
  return browser.runtime.sendMessage(message);
}

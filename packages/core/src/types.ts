// Shared data shapes. Every `t` is ms since session start (see docs/architecture.md#clock).
import type { eventWithTime } from '@rrweb/types';
import type { TranscriptSource } from './transcribe/transcript.ts';

export type SessionId = string;
/** Ms since session start, from the epoch saved at Record. */
export type SessionTime = number;

export type SessionStatus = 'recording' | 'stopped';

/** session.json in the bundle. One row in the `sessions` store. */
export interface SessionMeta {
  id: SessionId;
  /** Date.now() at Record. All `t` values are relative to this. */
  startedAt: number;
  /** Date.now() at Stop. */
  endedAt?: number;
  durationMs?: number;
  status: SessionStatus;
  /** URL of the tab when recording started. */
  url: string;
  title?: string;
  tabs: TabInfo[];
  /** URL changes of session tabs, including SPA (pushState) navigations. */
  navigations: NavigationEntry[];
  /** Settings in effect for this session (API key left out). */
  settings: Omit<Settings, 'openRouterApiKey'>;
  /** What happened to the mic. */
  mic: MicInfo;
  /**
   * Transcription progress. Not stored: the background fills it in for `sessions/list`
   * from the transcripts store (see lib/transcribe/openrouter.ts transcriptionStatus).
   */
  transcription?: TranscriptionStatus;
  /** Session time of the first rrweb full snapshot of the first tab (DOM available from here). */
  firstSnapshotT?: SessionTime;
  /** Session time the Record reload of the first tab finished loading (its load event). */
  pageReadyT?: SessionTime;
}

export interface TranscriptionStatus {
  /**
   * none: no audio. no-key: audio but no OpenRouter key. pending: chunks waiting.
   * transcribing: a request is running. done: every chunk transcribed. partial: some failed.
   * failed: every attempted chunk failed.
   */
  state: 'none' | 'no-key' | 'pending' | 'transcribing' | 'done' | 'partial' | 'failed';
  /** Chunks transcribed. */
  done: number;
  /** Audio chunks saved so far. */
  total: number;
  error?: string;
}

/** Result for one audio chunk, kept so later runs only transcribe what's missing. */
export interface TranscriptChunkResult {
  index: number;
  t: SessionTime;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
  error?: string;
  /** How this chunk was transcribed (missing on failed or empty chunks). */
  source?: TranscriptSource;
}

export type MicState = 'off' | 'starting' | 'recording' | 'needs-permission' | 'failed' | 'stopped';

export interface MicInfo {
  state: MicState;
  /** Last mic error, kept after Stop so the export can show why there is no audio. */
  error?: string;
  /** Audio chunks saved (set at Stop). */
  chunks?: number;
}

/** A tab that took part in the session: the first tab plus tabs it opened. */
export interface TabInfo {
  tabId: number;
  openerTabId?: number;
  /** When the tab joined the session. */
  t: SessionTime;
  url: string;
}

export interface NavigationEntry {
  tabId: number;
  t: SessionTime;
  url: string;
}

/** rrweb event as stored. `event.timestamp` stays absolute; export subtracts `startedAt`. */
export interface RrwebEventRow {
  id?: number;
  sessionId: SessionId;
  tabId: number;
  /** Frame id from the sender, 0 for the top frame. */
  frameId: number;
  t: SessionTime;
  event: eventWithTime;
}

export type Headers = Record<string, string>;

/** HTTP request assembled from CDP Network events. Goes into network.json. */
export interface NetworkRequestRow {
  sessionId: SessionId;
  /** CDP requestId. */
  requestId: string;
  tabId: number;
  t: SessionTime;
  /** loadingFinished or loadingFailed. */
  endT?: SessionTime;
  method: string;
  url: string;
  resourceType?: string;
  requestHeaders: Headers;
  requestBody?: string;
  /** Original request body size in UTF-8 bytes, set when requestBody was cut. */
  requestBodySize?: number;
  requestBodyTruncated?: boolean;
  status?: number;
  statusText?: string;
  responseHeaders?: Headers;
  mimeType?: string;
  responseBody?: string;
  /** True when responseBody is base64 (binary content). */
  responseBodyBase64?: boolean;
  /** True when responseBody was cut to the size cap. */
  truncated?: boolean;
  /** Decoded response size in bytes, summed from Network.dataReceived, kept body or not. */
  responseBodySize?: number;
  /** Why the response body wasn't kept (lib/capture/body-policy.ts). */
  responseBodyNotKept?: string;
  errorText?: string;
}

/** One WebSocket connection. Frames are stored separately in `wsFrames`. */
export interface WebSocketRow {
  sessionId: SessionId;
  /** CDP requestId of the socket. */
  socketId: string;
  tabId: number;
  url: string;
  t: SessionTime;
  closedT?: SessionTime;
  requestHeaders?: Headers;
  responseHeaders?: Headers;
  status?: number;
}

export interface WebSocketFrameRow {
  id?: number;
  sessionId: SessionId;
  socketId: string;
  t: SessionTime;
  direction: 'sent' | 'received';
  /** CDP opcode: 1 text, 2 binary (payload is base64). */
  opcode: number;
  payload: string;
  /** Payload size in bytes (decoded for binary), before any cut. */
  size?: number;
  /** The payload was cut at BODY_MAX_BYTES. */
  truncated?: boolean;
}

/** Console call, uncaught exception or browser log entry. Goes into console.json. */
export interface ConsoleRow {
  id?: number;
  sessionId: SessionId;
  tabId: number;
  t: SessionTime;
  /** Runtime.consoleAPICalled, Runtime.exceptionThrown or Log.entryAdded. */
  source: 'console' | 'exception' | 'log';
  level: 'log' | 'debug' | 'info' | 'warn' | 'error';
  text: string;
  url?: string;
  line?: number;
  column?: number;
  stack?: string;
}

/** 20 to 40 s of WebM/Opus mic audio, cut at a pause. Written by the offscreen document. */
export interface AudioChunkRow {
  sessionId: SessionId;
  /** 0, 1, 2… becomes audio/NNN.webm. */
  index: number;
  /** When this chunk started. */
  t: SessionTime;
  durationMs: number;
  mimeType: string;
  blob: Blob;
  /**
   * Voiced ranges [start, end] in ms from the chunk start, from an energy VAD in the offscreen
   * document. Used to pull Whisper word times out of silence. Missing when the audio didn't decode.
   */
  voiced?: [number, number][];
}

export interface TranscriptWord {
  word: string;
  start: SessionTime;
  end: SessionTime;
}

export interface TranscriptSegment {
  text: string;
  start: SessionTime;
  end: SessionTime;
}

/** transcript.json. Times already converted to session time. */
export interface TranscriptRow {
  sessionId: SessionId;
  /** The newest chunk's source. */
  source?: TranscriptSource;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
  /** Chunks that failed to transcribe, if any (the rest is still in segments and words). */
  errors?: { chunk: number; t: SessionTime; error: string }[];
  /** Per-chunk results; `segments`, `words` and `errors` are merged from these. */
  chunks: TranscriptChunkResult[];
}

/** User settings, kept in browser.storage.local (see lib/settings.ts). */
export interface Settings {
  /** rrweb masking (maskAllInputs, maskTextSelector, blockClass) on or off. */
  mask: boolean;
  /** Record the mic in the offscreen document. */
  mic: boolean;
  /** rrweb canvas recording (2 fps WebP snapshots). Off by default: it grows the bundle fast. */
  canvas: boolean;
  openRouterApiKey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  mask: false,
  mic: true,
  canvas: false,
  openRouterApiKey: '',
};

/** OpenRouter speech-to-text model. Whisper, because it returns word timestamps with verbose_json. */
export const TRANSCRIPTION_MODEL = 'openai/whisper-large-v3';

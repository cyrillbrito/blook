// The loaded bundle the viewer works on: the export files of docs/bundle-format.md, parsed.
// Loaders build it from a ZIP, from dropped files or folders, or from a map of paths to bytes.
// No extension APIs here: the standalone viewer.html uses this file too.
import { strFromU8, unzipSync } from 'fflate';
import type { eventWithTime } from '@rrweb/types';
import type { ConsoleOut, RequestOut, SegmentOut, SocketOut } from '@/lib/export/bundle';
import type { TimelineEntry } from '@/lib/export/timeline';

export type { ConsoleOut, RequestOut, SegmentOut, SocketOut, TimelineEntry };
export type FrameOut = SocketOut['frames'][number];

export interface SessionJson {
  format?: string;
  version?: number;
  id: string;
  url: string;
  title?: string;
  status?: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  firstSnapshotT?: number;
  tabs: { tabId: number; t: number; url: string; openerTabId?: number }[];
  navigations?: { tabId: number; t: number; url: string }[];
  settings?: { mask?: boolean; mic?: boolean; canvas?: boolean; transcriptionModel?: string };
  mic?: { state: string; error?: string; chunks?: number };
  counts?: Record<string, number>;
}

export interface TranscriptJson {
  status: string;
  note?: string;
  model?: string;
  errors?: { chunk: number; t: number; error: string }[];
  segments: SegmentOut[];
}

export interface AudioChunk {
  index: number;
  t: number;
  endT?: number;
  durationMs?: number;
  mimeType?: string;
  file: string;
}

export interface Bundle {
  /** Folder name, e.g. `blook-2026-11-03_19-09-02`. */
  name: string;
  session: SessionJson;
  timeline: TimelineEntry[];
  network: RequestOut[];
  websockets: SocketOut[];
  console: ConsoleOut[];
  transcript: TranscriptJson;
  audio: AudioChunk[];
  /** rrweb events per tab, timestamps in session ms, sorted. */
  rrweb: Map<number, eventWithTime[]>;
  /** Session end: durationMs, or the last thing that happened. */
  endT: number;
  /** Raw bytes of any file in the bundle (frame payloads, audio). */
  file(path: string): Uint8Array | undefined;
}

/** Builds a bundle from paths (with or without the `blook-<id>/` folder prefix) to bytes. */
export function bundleFromFiles(input: Map<string, Uint8Array>, fallbackName = 'bundle'): Bundle {
  // Find session.json and treat its folder as the bundle root.
  const sessionPath = [...input.keys()]
    .filter((p) => p === 'session.json' || p.endsWith('/session.json'))
    .sort((a, b) => a.length - b.length)[0];
  if (!sessionPath) throw new Error('No session.json found. Is this a Blook bundle?');
  const prefix = sessionPath.slice(0, -'session.json'.length);
  const files = new Map<string, Uint8Array>();
  for (const [p, bytes] of input) if (p.startsWith(prefix)) files.set(p.slice(prefix.length), bytes);

  const json = <T>(path: string, fallback: T): T => {
    const bytes = files.get(path);
    if (!bytes) return fallback;
    try {
      return JSON.parse(strFromU8(bytes)) as T;
    } catch (e) {
      throw new Error(`${path} is not valid JSON: ${(e as Error).message}`);
    }
  };
  const arr = <T>(path: string): T[] => {
    const v = json<unknown>(path, []);
    // Old bundles (format 1) had other shapes; show what we can.
    return Array.isArray(v) ? (v as T[]) : [];
  };

  const session = json<SessionJson>('session.json', undefined as never);
  session.tabs ??= [];
  const rrweb = new Map<number, eventWithTime[]>();
  const add = (tabId: number, events: unknown) => {
    if (Array.isArray(events) && events.length) rrweb.set(tabId, (events as eventWithTime[]).sort((a, b) => a.timestamp - b.timestamp));
  };
  const rrwebJson = json<{ tabs?: { tabId: number; events: eventWithTime[] }[] }>('rrweb.json', {});
  for (const t of rrwebJson.tabs ?? []) add(t.tabId, t.events);
  // Bundles before format 4: one rrweb/<tabId>.json per tab.
  for (const [p] of files) {
    const m = /^rrweb\/(\d+)\.json$/.exec(p);
    if (m) add(Number(m[1]), arr<eventWithTime>(p));
  }
  // Tab order: as in session.tabs, then any other rrweb file.
  const order = session.tabs.map((t) => t.tabId);
  const sortedRrweb = new Map(
    [...rrweb].sort(([a], [b]) => (order.indexOf(a) + 1 || 1e9) - (order.indexOf(b) + 1 || 1e9)),
  );

  const transcriptRaw = json<Partial<TranscriptJson>>('transcript.json', {});
  const transcript: TranscriptJson = {
    ...transcriptRaw,
    status: transcriptRaw.status ?? 'none',
    segments: Array.isArray(transcriptRaw.segments) ? transcriptRaw.segments : [],
  };
  for (const s of transcript.segments) s.words ??= [];

  const bundle: Omit<Bundle, 'endT'> = {
    name: prefix.replace(/\/$/, '').split('/').pop() || fallbackName,
    session,
    timeline: arr<TimelineEntry>('timeline.json'),
    network: arr<RequestOut>('network.json'),
    websockets: arr<SocketOut>('websockets.json'),
    console: arr<ConsoleOut>('console.json'),
    transcript,
    audio: arr<AudioChunk>('audio/chunks.json'),
    rrweb: sortedRrweb,
    file: (path) => files.get(path),
  };
  for (const s of bundle.websockets) s.frames ??= [];

  const lastRrweb = Math.max(0, ...[...sortedRrweb.values()].map((l) => l.at(-1)!.timestamp));
  const lastTimeline = Math.max(0, ...bundle.timeline.map((e) => (e.endT as number | undefined) ?? e.t));
  const endT = session.durationMs ?? Math.max(lastRrweb, lastTimeline);
  return { ...bundle, endT: Math.max(endT, lastRrweb) };
}

export function bundleFromZip(bytes: Uint8Array, fallbackName?: string): Bundle {
  const entries = unzipSync(bytes, { filter: (f) => !f.name.endsWith('/') && !f.name.startsWith('__MACOSX/') });
  return bundleFromFiles(new Map(Object.entries(entries)), fallbackName);
}

/**
 * Loads what the user dropped or picked: one .zip, or the files of an unzipped folder
 * (from `<input webkitdirectory>` or a dropped directory). `path` is the file's path in the folder.
 */
export async function bundleFromUserFiles(items: { file: File; path: string }[]): Promise<Bundle> {
  const zip = items.find((i) => i.file.name.toLowerCase().endsWith('.zip'));
  if (zip) return bundleFromZip(new Uint8Array(await zip.file.arrayBuffer()), zip.file.name.replace(/\.zip$/i, ''));
  const map = new Map<string, Uint8Array>();
  await Promise.all(items.map(async (i) => map.set(i.path, new Uint8Array(await i.file.arrayBuffer()))));
  return bundleFromFiles(map);
}

/** Files from a drop event, walking dropped folders. */
export async function filesFromDrop(dt: DataTransfer): Promise<{ file: File; path: string }[]> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return [...dt.files].map((file) => ({ file, path: file.name }));
  const out: { file: File; path: string }[] = [];
  const walk = async (entry: FileSystemEntry, dir: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ file, path: dir + entry.name });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns batches; call until empty.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        await Promise.all(batch.map((e) => walk(e, `${dir}${entry.name}/`)));
      }
    }
  };
  await Promise.all(entries.map((e) => walk(e, '')));
  return out;
}

export function filesFromInput(list: FileList): { file: File; path: string }[] {
  return [...list].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}

const TEXT_DECODER = new TextDecoder();
export function decodeText(bytes: Uint8Array): string {
  return TEXT_DECODER.decode(bytes);
}

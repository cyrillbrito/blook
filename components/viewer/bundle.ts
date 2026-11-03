// The loaded bundle the viewer works on: the export files of docs/bundle-format.md, parsed.
// Loaders build it from a ZIP, from dropped files or folders, or from a map of paths to bytes.
import { strFromU8, unzipSync } from 'fflate';
import type { eventWithTime } from '@rrweb/types';
import type { AudioChunkOut, ConsoleOut, RequestOut, SegmentOut, SessionOut, SocketOut, TranscriptOut } from '@/lib/export/bundle';
import type { TimelineEntry } from '@/lib/export/timeline';

export type { AudioChunkOut, ConsoleOut, RequestOut, SegmentOut, SessionOut, SocketOut, TimelineEntry, TranscriptOut };
export type FrameOut = SocketOut['frames'][number];

export interface Bundle {
  /** Folder name, e.g. `blook-2026-11-03_19-09-02`. */
  name: string;
  session: SessionOut;
  timeline: TimelineEntry[];
  network: RequestOut[];
  websockets: SocketOut[];
  console: ConsoleOut[];
  transcript: TranscriptOut;
  audio: AudioChunkOut[];
  /** rrweb events per tab, in session.tabs order, timestamps in session ms. */
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

  /** A JSON file of the bundle; `fallback` only for files that may be absent. */
  const json = <T>(path: string, fallback?: T): T => {
    const bytes = files.get(path);
    if (!bytes) {
      if (fallback === undefined) throw new Error(`${path} is missing from the bundle`);
      return fallback;
    }
    try {
      return JSON.parse(strFromU8(bytes)) as T;
    } catch (e) {
      throw new Error(`${path} is not valid JSON: ${(e as Error).message}`);
    }
  };

  const session = json<SessionOut>('session.json');
  const { tabs } = json<{ tabs: { tabId: number; events: eventWithTime[] }[] }>('rrweb.json', { tabs: [] });
  const rrweb = new Map(tabs.filter((t) => t.events.length).map((t) => [t.tabId, t.events]));

  const bundle: Omit<Bundle, 'endT'> = {
    name: prefix.replace(/\/$/, '').split('/').pop() || fallbackName,
    session,
    timeline: json('timeline.json'),
    network: json('network.json'),
    websockets: json('websockets.json'),
    console: json('console.json'),
    transcript: json('transcript.json'),
    audio: json('audio/chunks.json', []),
    rrweb,
    file: (path) => files.get(path),
  };

  const lastRrweb = Math.max(0, ...[...rrweb.values()].map((l) => l.at(-1)!.timestamp));
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

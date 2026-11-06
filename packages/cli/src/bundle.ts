// Read a Blook bundle (folder or .zip), and answer pure-data questions about its rrweb events:
// viewport, URL and mouse position at time t.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { EventType, IncrementalSource, MouseInteractions, type eventWithTime } from '@rrweb/types';
import { bundleRoot, type SessionOut } from '@blook/core/bundle';
import type { TimelineEntry } from '@blook/core/timeline';
import { CliError, EXIT } from './errors.ts';

export const PASS_A_BUNDLE = 'Pass a blook-*.zip exported by the Blook extension, or its unzipped folder.';

/** An rrweb event with `timestamp` in ms since session start. */
export type RrwebEvent = eventWithTime & { data: any };

/** A bundle's files by their path in the bundle folder, and where they came from. */
export interface BundleFiles {
  kind: 'zip' | 'folder';
  /** The zip file, or the bundle folder. */
  path: string;
  /** Folder prefix inside the zip (`blook-<id>/`), or ''. */
  prefix: string;
  files: Map<string, Uint8Array>;
  session: SessionOut;
  /** A JSON file of the bundle, undefined when it isn't there. */
  json<T>(name: string): T | undefined;
}

/** A folder that holds one unzipped bundle (`unzip -d D`) stands for that bundle. */
function bundleFolder(dir: string): string {
  if (existsSync(join(dir, 'session.json'))) return dir;
  const inner = readdirSync(dir).filter((n) => existsSync(join(dir, n, 'session.json')));
  return inner.length === 1 ? join(dir, inner[0]!) : dir;
}

/** Reads a bundle zip or folder: every file, or only `names`. Checks that it is a Blook bundle. */
export function readBundleFiles(path: string, names?: string[]): BundleFiles {
  if (!existsSync(path)) throw new CliError(`Bundle not found: ${path}`, EXIT.notFound, PASS_A_BUNDLE);
  const wanted = (name: string) => !names || names.some((n) => name === n || name.endsWith(`/${n}`));
  let kind: BundleFiles['kind'];
  let raw: Map<string, Uint8Array>;
  if (statSync(path).isDirectory()) {
    kind = 'folder';
    path = bundleFolder(path);
    raw = new Map();
    const dir = path;
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        const name = relative(dir, p).split('\\').join('/');
        if (e.isDirectory()) walk(p);
        else if (wanted(name)) raw.set(name, readFileSync(p));
      }
    };
    walk(dir);
  } else {
    kind = 'zip';
    try {
      raw = new Map(Object.entries(unzipSync(readFileSync(path), { filter: (f) => !f.name.endsWith('/') && wanted(f.name) })));
    } catch {
      throw new CliError(`Not a Blook bundle: ${path} is not a zip file.`, EXIT.notFound, PASS_A_BUNDLE);
    }
  }
  const root = bundleRoot(raw);
  if (!root) throw new CliError(`Not a Blook bundle: no session.json in ${path}.`, EXIT.notFound, PASS_A_BUNDLE);
  const { prefix, files } = root;

  const json = <T>(name: string): T | undefined => {
    const data = files.get(name);
    if (!data) return undefined;
    try {
      return JSON.parse(strFromU8(data)) as T;
    } catch {
      throw new CliError(`Not a Blook bundle: ${name} in ${path} is not valid JSON.`, EXIT.notFound, PASS_A_BUNDLE);
    }
  };
  const session = json<SessionOut>('session.json');
  if (session?.format !== 'blook-bundle') {
    throw new CliError(`Not a Blook bundle: ${path} has a session.json without "format": "blook-bundle".`, EXIT.notFound, PASS_A_BUNDLE);
  }
  return { kind, path, prefix, files, session, json };
}

export interface Bundle {
  path: string;
  session: SessionOut;
  /** timeline.json entries ([] when missing). */
  timeline: TimelineEntry[];
  /** Session length in ms: session.json durationMs, else the last rrweb event. */
  durationMs: number;
  /** Tab ids with rrweb events, in session.tabs order. */
  tabIds: string[];
  events(tabId?: string): RrwebEvent[];
  /** Resolve an optional --tab value to a tab id present in the bundle. */
  resolveTab(tabId?: string): string;
}

/** The bundle as the replay commands use it: session.json, rrweb.json and timeline.json. */
export function loadBundle(path: string): Bundle {
  const b = readBundleFiles(path, ['session.json', 'rrweb.json', 'timeline.json']);
  const rrweb = b.json<{ tabs: { tabId: number; events: RrwebEvent[] }[] }>('rrweb.json');
  if (!rrweb) throw new CliError(`Not a Blook bundle: no rrweb.json in ${b.path}.`, EXIT.notFound, PASS_A_BUNDLE);
  const byTab = new Map((rrweb.tabs ?? []).filter((t) => t.events?.length).map((t) => [String(t.tabId), t.events]));
  const tabIds = [...byTab.keys()];
  if (!tabIds.length)
    throw new CliError(
      `No page recording in ${b.path}: rrweb.json has no events.`,
      EXIT.notFound,
      'The bundle has no DOM to replay; read timeline.json and the other files instead.',
    );

  const resolveTab = (tabId?: string) => {
    if (tabId == null) return tabIds[0]!;
    if (!tabIds.includes(tabId))
      throw new CliError(`Unknown tab ${tabId}.`, EXIT.usage, `Use --tab with one of: ${tabIds.join(', ')} (\`blook info\` lists them).`);
    return tabId;
  };
  const lastEvent = Math.max(...[...byTab.values()].map((ev) => ev[ev.length - 1]!.timestamp));
  const { session } = b;
  return {
    path: b.path,
    session,
    timeline: b.json<TimelineEntry[]>('timeline.json') ?? [],
    durationMs: typeof session.durationMs === 'number' ? Math.max(session.durationMs, lastEvent) : lastEvent,
    tabIds,
    resolveTab,
    events: (tabId) => byTab.get(resolveTab(tabId))!,
  };
}

export const TIME_FORMATS = 'ms since the recording started (18036), seconds (18.5s) or [hh:]mm:ss[.mmm] (00:18.5)';

/** Parse "12345" (ms), "12.5s", "mm:ss", "mm:ss.mmm" or "hh:mm:ss" into ms. */
export function parseTime(s: string): number {
  const v = s.trim();
  if (/^\d+(ms)?$/.test(v)) return Number(v.replace(/ms$/, ''));
  if (/^\d+\.\d+$/.test(v)) {
    // Bundle times are whole ms, so "3.2" is almost always meant as seconds: ask rather than guess.
    throw new CliError(
      `Ambiguous time "${s}".`,
      EXIT.usage,
      `A bare number is ms: use ${v}s for seconds, or ${Math.round(Number(v) * 1000)} for ms.`,
    );
  }
  if (/^\d+(\.\d+)?s$/.test(v)) return Math.round(Number(v.slice(0, -1)) * 1000);
  if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(v)) {
    const parts = v.split(':').map(Number);
    let sec = 0;
    for (const p of parts) sec = sec * 60 + p;
    return Math.round(sec * 1000);
  }
  throw new CliError(`Bad time "${s}".`, EXIT.usage, `Use ${TIME_FORMATS}.`);
}

/** Throw unless t is within the recording. */
export function checkTime(bundle: Bundle, t: number, input: string = String(t)) {
  if (t <= bundle.durationMs) return;
  throw new CliError(
    `Time ${input} is after the end of the recording (${formatClock(bundle.durationMs)}).`,
    EXIT.timeRange,
    `Use a time between 00:00 and ${formatClock(bundle.durationMs)}; \`blook info ${bundle.path}\` lists click times.`,
  );
}

/** mm:ss.mmm, the CLI's `time` fields (the viewer's formatTime is m:ss.t). */
export function formatClock(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(3).padStart(6, '0')}`;
}

/** MouseInteractions names, lowercased in `mouse.source`, as they are in `nearbyInteractions[].type`. */
const interactionName = (type: number) => MouseInteractions[type] ?? String(type);

export interface PageState {
  url: string | null;
  viewport: { width: number; height: number } | null;
  firstSnapshotAt: number | null;
}

/** URL and viewport at t, from the last Meta / ViewportResize event at or before t. */
export function pageStateAt(events: RrwebEvent[], t: number): PageState {
  let url: string | null = null;
  let viewport: PageState['viewport'] = null;
  let firstSnapshotAt: number | null = null;
  for (const e of events) {
    if (e.type === EventType.FullSnapshot && firstSnapshotAt == null) firstSnapshotAt = e.timestamp;
    if (e.timestamp > t && firstSnapshotAt != null && viewport) break;
    const before = e.timestamp <= t;
    if (e.type === EventType.Meta && (before || !viewport)) {
      url = e.data.href;
      viewport = { width: e.data.width, height: e.data.height };
    } else if (before && e.type === EventType.IncrementalSnapshot && e.data.source === IncrementalSource.ViewportResize) {
      viewport = { width: e.data.width, height: e.data.height };
    }
  }
  return { url, viewport, firstSnapshotAt };
}

export interface MouseAt {
  x: number;
  y: number;
  /** Session time of the sample used. */
  at: number;
  /** t minus at: how stale the position is. */
  ageMs: number;
  source: string;
  /** rrweb node id the event targeted (may differ from the element under the point). */
  nodeId: number | null;
}

export interface InteractionAt {
  t: number;
  type: string;
  nodeId: number;
  x?: number;
  y?: number;
}

/** Last known mouse position at or before t, from mouse moves, touch moves, drags and interactions. */
export function mouseAt(events: RrwebEvent[], t: number): MouseAt | null {
  let best: MouseAt | null = null;
  const take = (x: number, y: number, at: number, source: string, nodeId: number | null) => {
    if (at <= t && (!best || at >= best.at)) best = { x, y, at, ageMs: t - at, source, nodeId };
  };
  for (const e of events) {
    if (e.type !== EventType.IncrementalSnapshot) continue;
    const d = e.data;
    if (d.source === IncrementalSource.MouseMove || d.source === IncrementalSource.TouchMove || d.source === IncrementalSource.Drag) {
      const name = d.source === IncrementalSource.MouseMove ? 'mousemove' : d.source === IncrementalSource.TouchMove ? 'touchmove' : 'drag';
      for (const p of d.positions ?? []) take(p.x, p.y, e.timestamp + (p.timeOffset ?? 0), name, p.id ?? null);
    } else if (d.source === IncrementalSource.MouseInteraction && typeof d.x === 'number') {
      take(d.x, d.y, e.timestamp, interactionName(d.type).toLowerCase(), d.id ?? null);
    }
  }
  return best;
}

/** Mouse interactions (clicks, mousedown, focus, ...) within [from, to]. */
export function interactionsBetween(events: RrwebEvent[], from: number, to: number): InteractionAt[] {
  const out: InteractionAt[] = [];
  for (const e of events) {
    if (e.timestamp < from) continue;
    if (e.timestamp > to) break;
    if (e.type === EventType.IncrementalSnapshot && e.data.source === IncrementalSource.MouseInteraction) {
      const d = e.data;
      out.push({
        t: e.timestamp,
        type: interactionName(d.type),
        nodeId: d.id,
        ...(typeof d.x === 'number' ? { x: d.x, y: d.y } : {}),
      });
    }
  }
  return out;
}

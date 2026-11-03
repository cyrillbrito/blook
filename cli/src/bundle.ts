// Load a Blook bundle (folder or .zip) and answer pure-data questions
// about its rrweb events: viewport, URL and mouse position at time t.
// Only session.json, rrweb.json and timeline.json are read.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { CliError, EXIT } from './errors.ts';

const PASS_A_BUNDLE = 'Pass a blook-*.zip exported by the Blook extension, or its unzipped folder.';

export interface RrwebEvent {
  type: number;
  data: any;
  timestamp: number; // ms since session start
}

export interface Bundle {
  path: string;
  session: any;
  /** timeline.json entries ([] when missing). */
  timeline: any[];
  /** Session length in ms: session.json durationMs, else the last rrweb event. */
  durationMs: number;
  /** Tab ids with rrweb events, in session.tabs order. */
  tabIds: string[];
  events(tabId?: string): RrwebEvent[];
  /** Resolve an optional --tab value to a tab id present in the bundle. */
  resolveTab(tabId?: string): string;
}

/** A folder that holds one unzipped bundle (`unzip -d D`) stands for that bundle. */
function bundleFolder(dir: string): string {
  if (existsSync(join(dir, 'session.json'))) return dir;
  const inner = readdirSync(dir).filter((n) => existsSync(join(dir, n, 'session.json')));
  return inner.length === 1 ? join(dir, inner[0]!) : dir;
}

export function loadBundle(path: string): Bundle {
  if (!existsSync(path)) throw new CliError(`Bundle not found: ${path}`, EXIT.notFound, PASS_A_BUNDLE);
  if (statSync(path).isDirectory()) path = bundleFolder(path);
  const files = statSync(path).isDirectory() ? readFolder(path) : readZip(path);
  const json = (name: string, text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      throw new CliError(`Not a Blook bundle: ${name} in ${path} is not valid JSON.`, EXIT.notFound, PASS_A_BUNDLE);
    }
  };
  const session = json('session.json', files.session);
  if (session?.format !== 'blook-bundle') {
    throw new CliError(`Not a Blook bundle: ${path} has a session.json without "format": "blook-bundle".`, EXIT.notFound, PASS_A_BUNDLE);
  }
  const { tabs } = json('rrweb.json', files.rrweb) as { tabs: { tabId: number; events: RrwebEvent[] }[] };
  const byTab = new Map((tabs ?? []).filter((t) => t.events?.length).map((t) => [String(t.tabId), t.events]));
  const tabIds = [...byTab.keys()];
  if (!tabIds.length) throw new CliError(`No page recording in ${path}: rrweb.json has no events.`, EXIT.notFound, 'The bundle has no DOM to replay; read timeline.json and the other files instead.');

  const resolveTab = (tabId?: string) => {
    if (tabId == null) return tabIds[0]!;
    if (!tabIds.includes(tabId)) throw new CliError(`Unknown tab ${tabId}.`, EXIT.usage, `Use --tab with one of: ${tabIds.join(', ')} (\`blook info\` lists them).`);
    return tabId;
  };
  const lastEvent = Math.max(...[...byTab.values()].map((ev) => ev[ev.length - 1]!.timestamp));
  return {
    path,
    session,
    timeline: files.timeline ? json('timeline.json', files.timeline) : [],
    durationMs: typeof session.durationMs === 'number' ? Math.max(session.durationMs, lastEvent) : lastEvent,
    tabIds,
    resolveTab,
    events: (tabId) => byTab.get(resolveTab(tabId))!,
  };
}

interface BundleFiles { session: string; rrweb: string; timeline?: string }

function readFolder(dir: string): BundleFiles {
  const read = (name: string, required = true) => {
    const file = join(dir, name);
    if (!existsSync(file)) {
      if (!required) return undefined;
      throw new CliError(`Not a Blook bundle: no ${name} in ${dir}.`, EXIT.notFound, PASS_A_BUNDLE);
    }
    return readFileSync(file, 'utf8');
  };
  return { session: read('session.json')!, rrweb: read('rrweb.json')!, timeline: read('timeline.json', false) };
}

function readZip(file: string): BundleFiles {
  // Unzip only the files we read (skip audio and network).
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(readFileSync(file), { filter: (f) => /(^|\/)(session|rrweb|timeline)\.json$/.test(f.name) });
  } catch {
    throw new CliError(`Not a Blook bundle: ${file} is not a zip file.`, EXIT.notFound, PASS_A_BUNDLE);
  }
  const get = (name: string, required = true) => {
    const entry = Object.keys(raw).find((n) => n === name || n.endsWith('/' + name));
    if (!entry) {
      if (!required) return undefined;
      throw new CliError(`Not a Blook bundle: no ${name} in ${basename(file)}.`, EXIT.notFound, PASS_A_BUNDLE);
    }
    return strFromU8(raw[entry]!);
  };
  return { session: get('session.json')!, rrweb: get('rrweb.json')!, timeline: get('timeline.json', false) };
}

export const TIME_FORMATS = 'ms since the recording started (18036), seconds (18.5s) or [hh:]mm:ss[.mmm] (00:18.5)';

/** Parse "12345" (ms), "12.5s", "mm:ss", "mm:ss.mmm" or "hh:mm:ss" into ms. */
export function parseTime(s: string): number {
  const v = s.trim();
  if (/^\d+(ms)?$/.test(v)) return Number(v.replace(/ms$/, ''));
  if (/^\d+\.\d+$/.test(v)) {
    // Bundle times are whole ms, so "3.2" is almost always meant as seconds: ask rather than guess.
    throw new CliError(`Ambiguous time "${s}".`, EXIT.usage, `A bare number is ms: use ${v}s for seconds, or ${Math.round(Number(v) * 1000)} for ms.`);
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
    `Time ${input} is after the end of the recording (${formatTime(bundle.durationMs)}).`,
    EXIT.timeRange,
    `Use a time between 00:00 and ${formatTime(bundle.durationMs)}; \`blook info ${bundle.path}\` lists click times.`,
  );
}

export function formatTime(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(3).padStart(6, '0')}`;
}

// rrweb enums (from @rrweb/types), kept local so this file has no deps.
const EventType = { FullSnapshot: 2, IncrementalSnapshot: 3, Meta: 4 } as const;
const Source = { MouseMove: 1, MouseInteraction: 2, ViewportResize: 4, TouchMove: 6, Drag: 12 } as const;
const Interaction = ['MouseUp', 'MouseDown', 'Click', 'ContextMenu', 'DblClick', 'Focus', 'Blur', 'TouchStart', 'TouchMove_Departed', 'TouchEnd', 'TouchCancel'];

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
    } else if (before && e.type === EventType.IncrementalSnapshot && e.data.source === Source.ViewportResize) {
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
    if (d.source === Source.MouseMove || d.source === Source.TouchMove || d.source === Source.Drag) {
      const name = d.source === Source.MouseMove ? 'mousemove' : d.source === Source.TouchMove ? 'touchmove' : 'drag';
      for (const p of d.positions ?? []) take(p.x, p.y, e.timestamp + (p.timeOffset ?? 0), name, p.id ?? null);
    } else if (d.source === Source.MouseInteraction && typeof d.x === 'number') {
      take(d.x, d.y, e.timestamp, Interaction[d.type]?.toLowerCase() ?? 'interaction', d.id ?? null);
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
    if (e.type === EventType.IncrementalSnapshot && e.data.source === Source.MouseInteraction) {
      const d = e.data;
      out.push({ t: e.timestamp, type: Interaction[d.type] ?? String(d.type), nodeId: d.id, ...(typeof d.x === 'number' ? { x: d.x, y: d.y } : {}) });
    }
  }
  return out;
}

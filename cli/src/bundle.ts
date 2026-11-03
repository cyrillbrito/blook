// Load an Overseer bundle (folder or .zip) and answer pure-data questions
// about its rrweb events: viewport, URL and mouse position at time t.
// Only session.json and rrweb/<tab>.json are read; other files may change shape.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

export interface RrwebEvent {
  type: number;
  data: any;
  timestamp: number; // ms since session start
}

export interface Bundle {
  path: string;
  session: any;
  tabIds: string[];
  events(tabId?: string): RrwebEvent[];
  /** Resolve an optional --tab value to a tab id present in the bundle. */
  resolveTab(tabId?: string): string;
}

export function loadBundle(path: string): Bundle {
  if (!existsSync(path)) throw new Error(`Bundle not found: ${path}`);
  const files = statSync(path).isDirectory() ? readFolder(path) : readZip(path);
  const sessionRaw = files.get('session.json');
  const session = sessionRaw ? JSON.parse(sessionRaw()) : {};
  const tabIds = [...files.keys()]
    .map((f) => /^rrweb\/([^/]+)\.json$/.exec(f)?.[1])
    .filter((x): x is string => !!x);
  if (!tabIds.length) throw new Error(`No rrweb/<tab>.json in ${path}`);
  // Prefer session.json tab order, so the first recorded tab is the default.
  const order: string[] = (session.tabs ?? []).map((t: any) => String(t.tabId));
  tabIds.sort((a, b) => rank(order, a) - rank(order, b));

  const cache = new Map<string, RrwebEvent[]>();
  const resolveTab = (tabId?: string) => {
    if (tabId == null) return tabIds[0]!;
    if (!tabIds.includes(tabId)) throw new Error(`Unknown tab ${tabId}. Tabs: ${tabIds.join(', ')}`);
    return tabId;
  };
  return {
    path,
    session,
    tabIds,
    resolveTab,
    events(tabId) {
      const id = resolveTab(tabId);
      let ev = cache.get(id);
      if (!ev) {
        ev = JSON.parse(files.get(`rrweb/${id}.json`)!()) as RrwebEvent[];
        ev.sort((a, b) => a.timestamp - b.timestamp);
        cache.set(id, ev);
      }
      return ev;
    },
  };
}

function rank(order: string[], id: string) {
  const i = order.indexOf(id);
  return i < 0 ? Infinity : i;
}

type Files = Map<string, () => string>;

function readFolder(dir: string): Files {
  const files: Files = new Map();
  const walk = (rel: string) => {
    for (const name of readdirSync(join(dir, rel))) {
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(join(dir, r)).isDirectory()) {
        if (r.split('/').length < 3) walk(r);
      } else files.set(r, () => readFileSync(join(dir, r), 'utf8'));
    }
  };
  walk('');
  return files;
}

function readZip(file: string): Files {
  // Only unzip what we read: session.json and rrweb/*.json (skip audio, bodies).
  const raw = unzipSync(readFileSync(file), {
    filter: (f) => /(^|\/)session\.json$|(^|\/)rrweb\/[^/]+\.json$/.test(f.name),
  });
  // Entries may sit under a top folder ("overseer-<id>/..."); strip it.
  const names = Object.keys(raw);
  const prefix = names.find((n) => n.endsWith('session.json'))?.slice(0, -'session.json'.length)
    ?? names[0]?.replace(/rrweb\/[^/]+$/, '') ?? '';
  const files: Files = new Map();
  for (const n of names) {
    const rel = n.startsWith(prefix) ? n.slice(prefix.length) : n;
    files.set(rel, () => strFromU8(raw[n]!));
  }
  if (!files.size) throw new Error(`No session.json or rrweb/ files in ${basename(file)}`);
  return files;
}

/** Parse "12345" (ms), "12.5s", "mm:ss", "mm:ss.mmm" or "hh:mm:ss" into ms. */
export function parseTime(s: string): number {
  const v = s.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v));
  if (/^\d+(\.\d+)?s$/.test(v)) return Math.round(Number(v.slice(0, -1)) * 1000);
  if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(v)) {
    const parts = v.split(':').map(Number);
    let sec = 0;
    for (const p of parts) sec = sec * 60 + p;
    return Math.round(sec * 1000);
  }
  throw new Error(`Bad time "${s}": use ms (12345), seconds (12.3s) or mm:ss[.mmm]`);
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

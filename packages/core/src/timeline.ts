// Builds timeline.json: one array, sorted by t, merging everything an agent needs to scan first.
// Each entry is small and has a `ref` into the file that holds the full record.
// The format is documented in docs/bundle-format.md; keep both in sync.
import { EventType, IncrementalSource, MouseInteractions, NodeType } from '@rrweb/types';
import type { SessionMeta } from './types.ts';
import type { ConsoleOut, RequestOut, SocketOut } from './bundle.ts';
import { transcriptFileNote, transcriptSummary, type SegmentOut, type TranscriptOut } from './transcript.ts';

/** Typing into one field within this gap is one `input` entry. */
const INPUT_MERGE_MS = 5000;
/** Scrolls of one node within this gap are one `scroll` entry. */
const SCROLL_MERGE_MS = 1000;
/** Frames of one socket and direction within this window are one `ws-frame` entry. */
const FRAME_GROUP_MS = 1000;
const PREVIEW = 120;

export type TimelineType =
  | 'navigation'
  | 'page-ready'
  | 'tab-open'
  | 'snapshot'
  | 'click'
  | 'input'
  | 'scroll'
  | 'request'
  | 'request-failed'
  | 'ws-open'
  | 'ws-close'
  | 'ws-frame'
  | 'console'
  | 'error'
  | 'speech';

export type TimelineRef =
  | { file: 'session.json'; navigation: number }
  | { file: 'session.json'; tab: number }
  | { file: 'session.json'; field: 'pageReadyT' }
  | { file: 'rrweb.json'; tabId: number; event: number } // index into that tab's events
  | { file: 'network.json'; requestId: string }
  | { file: 'websockets.json'; socketId: string; frame?: number; frameEnd?: number }
  | { file: 'console.json'; index: number }
  | { file: 'transcript.json'; segment: number };

export interface TimelineEntry {
  t: number;
  type: TimelineType;
  tabId?: number;
  summary: string;
  [field: string]: unknown;
  ref?: TimelineRef;
}

/** Chrome logs "Failed to load resource" for every failed request, which is already a request-failed entry. */
export function isNetworkFailureLog(c: { source: string; text: string }): boolean {
  return c.source === 'log' && c.text.startsWith('[network]');
}

function cut(s: string, max = PREVIEW): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

/** Tracks rrweb node ids so clicks can be described as `button "Save"`. */
class NodeMap {
  nodes = new Map<number, any>();
  parent = new Map<number, number>();
  children = new Map<number, number[]>();

  reset() {
    this.nodes.clear();
    this.parent.clear();
    this.children.clear();
  }

  add(node: any, parentId?: number) {
    this.nodes.set(node.id, node);
    if (parentId !== undefined) {
      this.parent.set(node.id, parentId);
      const list = this.children.get(parentId) ?? [];
      list.push(node.id);
      this.children.set(parentId, list);
    }
    for (const child of node.childNodes ?? []) this.add(child, node.id);
  }

  text(id: number, max = 60): string {
    let out = '';
    const walk = (nid: number) => {
      if (out.length >= max) return;
      const n = this.nodes.get(nid);
      if (!n) return;
      if (n.type === NodeType.Text) out += ` ${n.textContent ?? ''}`;
      else if (n.type === NodeType.Element && !['script', 'style'].includes(n.tagName)) {
        for (const c of this.children.get(nid) ?? []) walk(c);
      }
    };
    walk(id);
    return cut(out, max);
  }

  describe(id: number): string {
    let n = this.nodes.get(id);
    let nid = id;
    if (!n) return `node #${id}`;
    if (n.type === NodeType.Document) return 'document'; // page scroll
    if (n.type === NodeType.Text && this.parent.has(id)) {
      nid = this.parent.get(id)!;
      n = this.nodes.get(nid);
    }
    // Climb to a clickable ancestor (button, link) when the target is an icon or span inside it.
    const isControl = ['input', 'textarea', 'select', 'button', 'a'].includes(n?.tagName);
    for (let cur = nid, depth = 0; !isControl && depth < 4 && cur !== undefined; depth++) {
      const c = this.nodes.get(cur);
      if (
        c?.type === NodeType.Element &&
        (['button', 'a', 'label', 'select', 'summary'].includes(c.tagName) || c.attributes?.role === 'button')
      ) {
        nid = cur;
        n = c;
        break;
      }
      cur = this.parent.get(cur)!;
    }
    const a = n?.attributes ?? {};
    const name = a['aria-label'] || a.title || a.placeholder || a.alt || this.text(nid) || a.name || a.value;
    let desc = n?.tagName ?? 'node';
    if (a.type && n.tagName === 'input') desc += `[type=${a.type}]`;
    if (name) desc += ` "${String(name).slice(0, 60)}"`;
    if (a.id) desc += ` #${a.id}`;
    else if (a['data-testid']) desc += ` [data-testid=${a['data-testid']}]`;
    else if (typeof a.class === 'string' && a.class.trim()) desc += ` .${a.class.trim().split(/\s+/).slice(0, 2).join('.')}`;
    return desc;
  }
}

function rrwebEntries(tabId: number, events: any[]): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const map = new NodeMap();
  let href: string | undefined;
  const lastInput = new Map<number, TimelineEntry>();
  const lastScroll = new Map<number, TimelineEntry>();

  events.forEach((e, i) => {
    const t: number = e.timestamp;
    if (e.type === EventType.Meta) {
      href = e.data?.href;
    } else if (e.type === EventType.FullSnapshot) {
      map.reset();
      map.add(e.data.node);
      lastInput.clear();
      lastScroll.clear();
      out.push({
        t,
        type: 'snapshot',
        tabId,
        summary: `DOM snapshot${href ? `: ${href}` : ''}`,
        url: href,
        ref: { file: 'rrweb.json', tabId, event: i },
      });
    } else if (e.type === EventType.IncrementalSnapshot) {
      const d = e.data;
      if (d.source === IncrementalSource.Mutation) {
        for (const add of d.adds ?? []) map.add(add.node, add.parentId);
        for (const txt of d.texts ?? []) {
          const n = map.nodes.get(txt.id);
          if (n) n.textContent = txt.value;
        }
        for (const attr of d.attributes ?? []) {
          const n = map.nodes.get(attr.id);
          if (n?.attributes) Object.assign(n.attributes, attr.attributes);
        }
      } else if (
        d.source === IncrementalSource.MouseInteraction &&
        (d.type === MouseInteractions.Click || d.type === MouseInteractions.DblClick)
      ) {
        const target = map.describe(d.id);
        const dbl = d.type === MouseInteractions.DblClick;
        out.push({
          t,
          type: 'click',
          tabId,
          summary: `${dbl ? 'Double-click' : 'Click'} ${target}`,
          target,
          nodeId: d.id,
          x: d.x,
          y: d.y,
          ...(dbl ? { double: true } : {}),
          ref: { file: 'rrweb.json', tabId, event: i },
        });
      } else if (d.source === IncrementalSource.Input) {
        // Drop inputs nobody typed: nodes rrweb never serialized (id -1), and programmatic value
        // and checked changes (React renders, deselected radio siblings).
        const node = map.nodes.get(d.id);
        if (d.id < 0 || !node || !d.userTriggered) return;
        const kind = String(node.attributes?.type ?? '').toLowerCase();
        const toggle = node.tagName === 'input' && (kind === 'checkbox' || kind === 'radio');
        if (toggle && kind === 'radio' && d.isChecked === false) return;
        const text: string = d.text ?? '';
        const value = toggle ? { checked: !!d.isChecked } : { value: text.slice(0, 200) };
        const shown = toggle ? (d.isChecked ? 'checked' : 'unchecked') : `"${cut(text, 40)}"`;
        const prev = lastInput.get(d.id);
        if (prev && t - (prev.endT as number) < INPUT_MERGE_MS) {
          Object.assign(prev, value, { endT: t, summary: `Input ${prev.target} = ${shown}`, ref: { file: 'rrweb.json', tabId, event: i } });
        } else {
          const target = map.describe(d.id);
          const entry: TimelineEntry = {
            t,
            type: 'input',
            tabId,
            summary: `Input ${target} = ${shown}`,
            target,
            nodeId: d.id,
            ...value,
            endT: t,
            ref: { file: 'rrweb.json', tabId, event: i },
          };
          out.push(entry);
          lastInput.set(d.id, entry);
        }
      } else if (d.source === IncrementalSource.Scroll) {
        const prev = lastScroll.get(d.id);
        if (prev && t - (prev.endT as number) < SCROLL_MERGE_MS) {
          Object.assign(prev, { endT: t, x: d.x, y: d.y, summary: `Scroll ${prev.target} to ${d.x},${d.y}` });
        } else {
          const target = map.describe(d.id);
          const entry: TimelineEntry = {
            t,
            type: 'scroll',
            tabId,
            summary: `Scroll ${target} to ${d.x},${d.y}`,
            target,
            nodeId: d.id,
            x: d.x,
            y: d.y,
            endT: t,
            ref: { file: 'rrweb.json', tabId, event: i },
          };
          out.push(entry);
          lastScroll.set(d.id, entry);
        }
      }
    }
  });
  return out;
}

/** Path and query, for request summaries. */
function pathAndQuery(url: string): string {
  try {
    const u = new URL(url);
    return cut(u.pathname + u.search, 100);
  } catch {
    return cut(url, 100);
  }
}

export function buildTimeline(input: {
  meta: SessionMeta;
  rrwebByTab: Map<number, any[]>;
  requests: RequestOut[];
  sockets: SocketOut[];
  console: ConsoleOut[];
  segments: SegmentOut[];
}): TimelineEntry[] {
  const { meta } = input;
  const out: TimelineEntry[] = [];

  meta.navigations.forEach((nav, i) =>
    out.push({
      t: nav.t,
      type: 'navigation',
      tabId: nav.tabId,
      summary: `Navigate to ${nav.url}`,
      url: nav.url,
      ref: { file: 'session.json', navigation: i },
    }),
  );
  if (meta.pageReadyT !== undefined) {
    const tab = meta.tabs[0]!;
    out.push({
      t: meta.pageReadyT,
      type: 'page-ready',
      tabId: tab.tabId,
      summary: 'Page finished loading (load event)',
      ref: { file: 'session.json', field: 'pageReadyT' },
    });
  }
  meta.tabs.forEach((tab, i) => {
    if (i === 0) return;
    out.push({
      t: tab.t,
      type: 'tab-open',
      tabId: tab.tabId,
      summary: `New tab opened from tab ${tab.openerTabId}: ${tab.url}`,
      url: tab.url,
      openerTabId: tab.openerTabId,
      ref: { file: 'session.json', tab: i },
    });
  });

  for (const [tabId, events] of input.rrwebByTab) out.push(...rrwebEntries(tabId, events));

  for (const r of input.requests) {
    const failed = r.failed;
    const result = r.errorText ?? (r.status !== undefined ? String(r.status) : 'pending');
    out.push({
      t: r.t,
      type: failed ? 'request-failed' : 'request',
      tabId: r.tabId,
      summary: `${r.method} ${pathAndQuery(r.url)} → ${result}${r.durationMs !== undefined ? ` (${r.durationMs} ms)` : ''}`,
      method: r.method,
      url: r.url,
      ...(r.status !== undefined ? { status: r.status } : {}),
      ...(r.errorText ? { errorText: r.errorText } : {}),
      ...(r.resourceType ? { resourceType: r.resourceType } : {}),
      ...(r.endT !== undefined ? { endT: r.endT, durationMs: r.durationMs } : {}),
      ref: { file: 'network.json', requestId: r.id },
    });
  }

  for (const s of input.sockets) {
    out.push({
      t: s.t,
      type: 'ws-open',
      tabId: s.tabId,
      summary: `WebSocket open ${s.url}`,
      url: s.url,
      socketId: s.id,
      ...(s.status !== undefined ? { status: s.status } : {}),
      ref: { file: 'websockets.json', socketId: s.id },
    });
    if (s.endT !== undefined) {
      out.push({
        t: s.endT,
        type: 'ws-close',
        tabId: s.tabId,
        summary: `WebSocket closed ${s.url} after ${s.frameCount} frames`,
        url: s.url,
        socketId: s.id,
        ref: { file: 'websockets.json', socketId: s.id },
      });
    }
    let group: TimelineEntry | undefined;
    for (const f of s.frames) {
      if (group && group.direction === f.direction && f.t - group.t < FRAME_GROUP_MS) {
        group.count = (group.count as number) + 1;
        group.bytes = (group.bytes as number) + f.size;
        group.endT = f.t;
        (group.ref as { frameEnd?: number }).frameEnd = f.index;
        group.summary = `WebSocket ${f.direction} ${group.count} frames (${group.bytes} B): ${group.preview}`;
        continue;
      }
      const preview =
        f.payloadEncoding === 'base64'
          ? `<binary ${f.size} B>`
          : cut(f.payloadEncoding === 'json' ? JSON.stringify(f.payload) : String(f.payload));
      group = {
        t: f.t,
        type: 'ws-frame',
        tabId: s.tabId,
        summary: `WebSocket ${f.direction}: ${preview}`,
        socketId: s.id,
        direction: f.direction,
        count: 1,
        bytes: f.size,
        endT: f.t,
        preview,
        ref: { file: 'websockets.json', socketId: s.id, frame: f.index, frameEnd: f.index },
      };
      out.push(group);
    }
  }

  for (const c of input.console) {
    if (isNetworkFailureLog(c)) continue;
    const isError = c.level === 'error';
    const file = c.url ? c.url.split(/[?#]/)[0]!.split('/').pop() || c.url : '';
    const where = file ? ` (${file}${c.line ? `:${c.line}` : ''})` : '';
    const kind = c.source === 'exception' ? 'Uncaught' : `console.${c.level}`;
    out.push({
      t: c.t,
      type: isError ? 'error' : 'console',
      tabId: c.tabId,
      summary: `${kind}: ${cut(c.text.split('\n')[0] ?? '', 200)}${where}`,
      level: c.level,
      source: c.source,
      ref: { file: 'console.json', index: c.index },
    });
  }

  out.push(...speechEntries(input.segments));
  return sortByT(out);
}

/** Sort by t. Array sort is stable: on a tie, push order wins (so speech, pushed last, comes last). */
function sortByT<E extends { t: number }>(entries: E[]): E[] {
  return entries.sort((a, b) => a.t - b.t);
}

export interface SpeechEntry extends TimelineEntry {
  type: 'speech';
  text: string;
  endT: number;
  ref: { file: 'transcript.json'; segment: number };
}

/** timeline.json `speech` entries, one per segment. */
export function speechEntries(segments: SegmentOut[]): SpeechEntry[] {
  return segments.map((seg) => ({
    t: seg.t,
    type: 'speech',
    summary: `🗣 "${cut(seg.text, 300)}"`,
    text: seg.text,
    endT: seg.endT,
    ref: { file: 'transcript.json', segment: seg.index },
  }));
}

/** Swaps the speech entries of a timeline for new ones, in buildTimeline's order. */
function replaceSpeech<E extends { t: number; type: string }>(timeline: E[], segments: SegmentOut[]): (E | SpeechEntry)[] {
  return sortByT<E | SpeechEntry>([...timeline.filter((e) => e.type !== 'speech'), ...speechEntries(segments)]);
}

/**
 * Rewrites what derives from transcript.json in an existing bundle (`blook transcribe`): the
 * timeline's speech entries and session.json's .transcript, .counts and .files note. zipBundle
 * builds the same fields from scratch.
 */
export function withTranscript<S extends { counts?: object; files?: object }, E extends { t: number; type: string }>(
  session: S,
  timeline: E[],
  t: TranscriptOut,
): { session: S; timeline: (E | SpeechEntry)[] } {
  const next = replaceSpeech(timeline, t.segments);
  return {
    session: {
      ...session,
      transcript: transcriptSummary(t),
      counts: { ...session.counts, timeline: next.length, transcriptSegments: t.segmentCount },
      files: { ...session.files, 'transcript.json': transcriptFileNote(t.status) },
    },
    timeline: next,
  };
}

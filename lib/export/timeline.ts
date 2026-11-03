// Builds timeline.json: one array, sorted by t, merging everything an agent needs to scan first.
// Each entry is small and has a `ref` into the file that holds the full record.
// The format is documented in docs/bundle-format.md; keep both in sync.
import type { SessionMeta } from '../types';
import type { ConsoleOut, RequestOut, SegmentOut, SocketOut } from './bundle';

// rrweb enums, inlined to avoid pulling rrweb into the service worker.
const FULL_SNAPSHOT = 2;
const INCREMENTAL = 3;
const META = 4;
const SOURCE_MUTATION = 0;
const SOURCE_MOUSE_INTERACTION = 2;
const SOURCE_SCROLL = 3;
const SOURCE_INPUT = 5;
const MOUSE_CLICK = 2;
const MOUSE_DBLCLICK = 4;
const NODE_ELEMENT = 2;
const NODE_TEXT = 3;

/** Typing into one field within this gap is one `input` entry. */
const INPUT_MERGE_MS = 5000;
/** Scrolls of one node within this gap are one `scroll` entry. */
const SCROLL_MERGE_MS = 1000;
/** Frames of one socket and direction within this window are one `ws-frame` entry. */
const FRAME_GROUP_MS = 1000;
const PREVIEW = 120;

export type TimelineType =
  | 'navigation'
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
  | { file: string; event: number } // rrweb/<tabId>.json, index into the array
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
      if (n.type === NODE_TEXT) out += ` ${n.textContent ?? ''}`;
      else if (n.type === NODE_ELEMENT && !['script', 'style'].includes(n.tagName)) {
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
    if (n.type === 0) return 'document'; // rrweb NodeType.Document (page scroll)
    if (n.type === NODE_TEXT && this.parent.has(id)) {
      nid = this.parent.get(id)!;
      n = this.nodes.get(nid);
    }
    // Climb to a clickable ancestor (button, link) when the target is an icon or span inside it.
    const isControl = ['input', 'textarea', 'select', 'button', 'a'].includes(n?.tagName);
    for (let cur = nid, depth = 0; !isControl && depth < 4 && cur !== undefined; depth++) {
      const c = this.nodes.get(cur);
      if (
        c?.type === NODE_ELEMENT &&
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
  const file = `rrweb/${tabId}.json`;
  const out: TimelineEntry[] = [];
  const map = new NodeMap();
  let href: string | undefined;
  const lastInput = new Map<number, TimelineEntry>();
  const lastScroll = new Map<number, TimelineEntry>();

  events.forEach((e, i) => {
    const t: number = e.timestamp;
    if (e.type === META) {
      href = e.data?.href;
    } else if (e.type === FULL_SNAPSHOT) {
      map.reset();
      map.add(e.data.node);
      lastInput.clear();
      lastScroll.clear();
      out.push({ t, type: 'snapshot', tabId, summary: `DOM snapshot${href ? `: ${href}` : ''}`, url: href, ref: { file, event: i } });
    } else if (e.type === INCREMENTAL) {
      const d = e.data;
      if (d.source === SOURCE_MUTATION) {
        for (const add of d.adds ?? []) map.add(add.node, add.parentId);
        for (const txt of d.texts ?? []) {
          const n = map.nodes.get(txt.id);
          if (n) n.textContent = txt.value;
        }
        for (const attr of d.attributes ?? []) {
          const n = map.nodes.get(attr.id);
          if (n?.attributes) Object.assign(n.attributes, attr.attributes);
        }
      } else if (d.source === SOURCE_MOUSE_INTERACTION && (d.type === MOUSE_CLICK || d.type === MOUSE_DBLCLICK)) {
        const target = map.describe(d.id);
        const dbl = d.type === MOUSE_DBLCLICK;
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
          ref: { file, event: i },
        });
      } else if (d.source === SOURCE_INPUT) {
        const text: string = d.text ?? '';
        const value = d.isChecked !== undefined && !text ? { checked: d.isChecked } : { value: text.slice(0, 200) };
        const shown = 'checked' in value ? `checked=${value.checked}` : `"${cut(text, 40)}"`;
        const prev = lastInput.get(d.id);
        if (prev && t - (prev.endT as number) < INPUT_MERGE_MS) {
          delete prev.value;
          delete prev.checked;
          Object.assign(prev, value, { endT: t, summary: `Input ${prev.target} = ${shown}`, ref: { file, event: i } });
        } else {
          const target = map.describe(d.id);
          const entry: TimelineEntry = { t, type: 'input', tabId, summary: `Input ${target} = ${shown}`, target, nodeId: d.id, ...value, endT: t, ref: { file, event: i } };
          out.push(entry);
          lastInput.set(d.id, entry);
        }
      } else if (d.source === SOURCE_SCROLL) {
        const prev = lastScroll.get(d.id);
        if (prev && t - (prev.endT as number) < SCROLL_MERGE_MS) {
          Object.assign(prev, { endT: t, x: d.x, y: d.y, summary: `Scroll ${prev.target} to ${d.x},${d.y}` });
        } else {
          const target = map.describe(d.id);
          const entry: TimelineEntry = { t, type: 'scroll', tabId, summary: `Scroll ${target} to ${d.x},${d.y}`, target, nodeId: d.id, x: d.x, y: d.y, endT: t, ref: { file, event: i } };
          out.push(entry);
          lastScroll.set(d.id, entry);
        }
      }
    }
  });
  return out;
}

function shortUrl(url: string): string {
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

  (meta.navigations ?? []).forEach((nav, i) =>
    out.push({ t: nav.t, type: 'navigation', tabId: nav.tabId, summary: `Navigate to ${nav.url}`, url: nav.url, ref: { file: 'session.json', navigation: i } }),
  );
  meta.tabs.forEach((tab, i) => {
    if (i === 0) return;
    out.push({ t: tab.t, type: 'tab-open', tabId: tab.tabId, summary: `New tab opened from tab ${tab.openerTabId}: ${tab.url}`, url: tab.url, openerTabId: tab.openerTabId, ref: { file: 'session.json', tab: i } });
  });

  for (const [tabId, events] of input.rrwebByTab) out.push(...rrwebEntries(tabId, events));

  for (const r of input.requests) {
    const failed = r.failed;
    const result = r.errorText ?? (r.status !== undefined ? String(r.status) : 'pending');
    out.push({
      t: r.t,
      type: failed ? 'request-failed' : 'request',
      tabId: r.tabId,
      summary: `${r.method} ${shortUrl(r.url)} → ${result}${r.durationMs !== undefined ? ` (${r.durationMs} ms)` : ''}`,
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
    out.push({ t: s.t, type: 'ws-open', tabId: s.tabId, summary: `WebSocket open ${s.url}`, url: s.url, socketId: s.id, ...(s.status !== undefined ? { status: s.status } : {}), ref: { file: 'websockets.json', socketId: s.id } });
    if (s.endT !== undefined) {
      out.push({ t: s.endT, type: 'ws-close', tabId: s.tabId, summary: `WebSocket closed ${s.url} after ${s.frameCount} frames`, url: s.url, socketId: s.id, ref: { file: 'websockets.json', socketId: s.id } });
    }
    // Group frames: one entry per direction per FRAME_GROUP_MS window.
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
      const preview = f.opcode === 2 ? `<binary ${f.size} B>` : cut(f.payload ?? `<${f.size} B in ${f.payloadFile}>`);
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
    // Chrome logs "Failed to load resource" for every failed request: already a request-failed entry.
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

  for (const seg of input.segments) {
    out.push({ t: seg.t, type: 'speech', summary: `🗣 "${cut(seg.text, 300)}"`, text: seg.text, endT: seg.endT, ref: { file: 'transcript.json', segment: seg.index } });
  }

  // Stable sort by t; the per-type push order above breaks ties.
  return out.map((e, i) => [e, i] as const).sort((a, b) => a[0].t - b[0].t || a[1] - b[1]).map(([e]) => e);
}

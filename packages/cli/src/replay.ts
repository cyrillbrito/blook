// Headless replay of a Blook bundle: Playwright Chromium + @rrweb/replay.
// One ReplayEngine owns the browser; open() gives a TabReplay that can seek to
// any t repeatedly (an MCP server can keep it alive between calls).
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { launchBrowser } from './browser.ts';
import { type Bundle, type RrwebEvent, type MouseAt, mouseAt, pageStateAt, interactionsBetween, formatTime } from './bundle.ts';
import { CliError, EXIT } from './errors.ts';
import { assets } from './assets.ts';

const { replayJs: REPLAY_JS, replayCss: REPLAY_CSS } = assets();

const HOST_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
${REPLAY_CSS}
html, body { margin: 0; padding: 0; overflow: hidden; background: #fff; }
.replayer-wrapper { position: relative; }
.replayer-mouse, .replayer-mouse-tail { display: none !important; }
#ov-cursor { position: absolute; left: 0; top: 0; z-index: 2147483647; pointer-events: none; display: none; }
</style></head><body><div id="root"></div>
<svg id="ov-cursor" width="40" height="40" viewBox="-20 -20 40 40" style="margin:-20px 0 0 -20px">
  <circle r="14" fill="rgba(255,0,0,0.18)" stroke="rgba(255,0,0,0.85)" stroke-width="2"/>
  <path d="M0 0 L0 15 L4 11 L7 18 L10 17 L7 10 L12 10 Z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
</svg>
</body></html>`;

export interface EngineOptions {
  /** Abort all http(s) requests from the replay (assets of a dead server). Default false. */
  offline?: boolean;
  /** Max ms to wait for images and fonts after a seek. Default 3000. */
  settleMs?: number;
}

export class ReplayEngine {
  private browser: Browser;
  private opts: EngineOptions;
  private constructor(browser: Browser, opts: EngineOptions) {
    this.browser = browser;
    this.opts = opts;
  }

  static async launch(opts: EngineOptions = {}): Promise<ReplayEngine> {
    const browser = await launchBrowser('No browser found to replay in.');
    return new ReplayEngine(browser, opts);
  }

  async open(bundle: Bundle, tabId?: string): Promise<TabReplay> {
    const tab = bundle.resolveTab(tabId);
    const events = bundle.events(tab);
    const first = pageStateAt(events, Infinity);
    const page = await this.browser.newPage({ viewport: first.viewport ?? { width: 1280, height: 800 } });
    if (this.opts.offline) {
      await page.route(/^https?:/, (r) => r.abort());
    }
    await page.setContent(HOST_HTML);
    await page.addScriptTag({ content: REPLAY_JS });
    // Sampled canvas frames are drawn by seek() itself (see canvasFramesAt): rrweb decodes
    // them asynchronously while seeking, and they can land out of order.
    const replayEvents = events.filter((e) => !isCanvasFrame(e));
    await page.evaluate((evs) => {
      const w = window as any;
      w.__replayer = new w.rrwebReplay.Replayer(evs, {
        root: document.getElementById('root'),
        mouseTail: false,
        showWarning: false,
        showDebug: false,
        triggerFocus: false,
        skipInactive: false,
        pauseAnimation: true,
        // Bundles recorded with the Canvas setting carry canvas frames (2 fps).
        UNSAFE_replayCanvas: true,
      });
    }, replayEvents);
    return new TabReplay(page, bundle, tab, this.opts.settleMs ?? 3000);
  }

  async close() {
    await this.browser.close();
  }
}

export interface SeekResult {
  tab: string;
  /** Requested time, ms since session start. */
  t: number;
  /** Time actually replayed to (clamped to the recorded range). */
  replayedT: number;
  time: string;
  url: string | null;
  viewport: { width: number; height: number };
  warnings: string[];
}

export interface ElementInfo {
  tag: string;
  rrwebId: number | null;
  id?: string;
  classes?: string[];
  text?: string;
  attributes: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
  path: string;
}

export interface PointerResult extends SeekResult {
  mouse: MouseAt | null;
  element: ElementInfo | null;
  ancestry: ElementInfo[];
  /** Text selected (highlighted) in the page at t, and the element that contains it. */
  selection: { text: string; element: ElementInfo } | null;
  /** Mouse interactions within ±1 s of t (clicks, focus, ...). */
  nearbyInteractions: ReturnType<typeof interactionsBetween>;
}

export class TabReplay {
  readonly page: Page;
  readonly bundle: Bundle;
  readonly tab: string;
  private settleMs: number;
  constructor(page: Page, bundle: Bundle, tab: string, settleMs: number) {
    this.page = page;
    this.bundle = bundle;
    this.tab = tab;
    this.settleMs = settleMs;
  }

  /** Replay to t (ms since session start) and wait for assets to settle. */
  async seek(t: number): Promise<SeekResult> {
    const events = this.bundle.events(this.tab);
    const warnings: string[] = [];
    const state = pageStateAt(events, t);
    const start = events[0]!.timestamp;
    const end = events[events.length - 1]!.timestamp;
    let rt = t;
    if (state.firstSnapshotAt == null) {
      throw new CliError(`Tab ${this.tab} has no DOM snapshot to replay.`, EXIT.notFound, 'Try another tab with --tab (`blook info` lists them), or read timeline.json.');
    }
    if (t < state.firstSnapshotAt) {
      warnings.push(`t is before the first DOM snapshot (${formatTime(state.firstSnapshotAt)}); replaying that instead`);
      rt = state.firstSnapshotAt;
    } else if (t > end) {
      warnings.push(`t is after the last rrweb event (${formatTime(end)}); showing the final state`);
      rt = end;
    }
    const viewport = pageStateAt(events, rt).viewport ?? { width: 1280, height: 800 };
    const cur = this.page.viewportSize();
    if (!cur || cur.width !== viewport.width || cur.height !== viewport.height) await this.page.setViewportSize(viewport);

    await this.page.evaluate(async ({ offset, settleMs }) => {
      const r = (window as any).__replayer;
      r.pause(offset);
      const frame = r.iframe as HTMLIFrameElement;
      const doc = frame.contentDocument!;
      const raf = () => new Promise((res) => requestAnimationFrame(() => res(null)));
      await raf();
      await raf();
      const pending = [...doc.images].filter((i) => !i.complete).map((i) => new Promise((res) => {
        i.addEventListener('load', res, { once: true });
        i.addEventListener('error', res, { once: true });
      }));
      await Promise.race([
        Promise.all([...pending, doc.fonts?.ready]),
        new Promise((res) => setTimeout(res, settleMs)),
      ]);
    }, { offset: rt - start, settleMs: this.settleMs });

    const frames = canvasFramesAt(events, rt);
    if (frames.length) {
      const missing = await this.page.evaluate(drawCanvasFrames, frames);
      if (missing) warnings.push(`${missing} recorded canvas frame(s) could not be drawn`);
    }

    return { tab: this.tab, t, replayedT: rt, time: formatTime(rt), url: pageStateAt(events, rt).url, viewport, warnings };
  }

  async screenshot(t: number, opts: { out?: string; cursor?: boolean } = {}): Promise<SeekResult & { path: string; mouse: MouseAt | null }> {
    const res = await this.seek(t);
    const mouse = mouseAt(this.bundle.events(this.tab), res.replayedT);
    const draw = opts.cursor !== false && mouse;
    await this.page.evaluate((m) => {
      const c = document.getElementById('ov-cursor')!;
      if (!m) { c.style.display = 'none'; return; }
      c.style.display = 'block';
      c.style.transform = `translate(${m.x}px, ${m.y}px)`;
    }, draw ? { x: mouse.x, y: mouse.y } : null);
    const id = this.bundle.session.id ?? 'session';
    const path = opts.out ?? join(tmpdir(), `blook-${id}-${this.tab}-${res.replayedT}.png`);
    await this.page.screenshot({ path, clip: { x: 0, y: 0, ...res.viewport }, timeout: 15000, animations: 'disabled' });
    return { ...res, path, mouse };
  }

  /** Serialized HTML of the replayed document (or of the elements matching selector). */
  async dom(t: number, opts: { selector?: string } = {}): Promise<SeekResult & { html: string | string[] }> {
    if (opts.selector) {
      const valid = await this.page.evaluate((s) => {
        try { document.createDocumentFragment().querySelector(s); return true; } catch { return false; }
      }, opts.selector);
      if (!valid) throw new CliError(`Invalid CSS selector: ${opts.selector}`, EXIT.usage, 'Pass a CSS selector such as "#save", "button.primary" or "[data-testid=row]".');
    }
    const res = await this.seek(t);
    const html = await this.page.evaluate((selector) => {
      const doc = ((window as any).__replayer.iframe as HTMLIFrameElement).contentDocument!;
      // Serialize a clone with live form values copied into attributes.
      const withValues = (el: Element) => {
        const clone = el.cloneNode(true) as Element;
        const q = 'input, textarea, select, option';
        const src = [el, ...el.querySelectorAll(q)];
        const dst = [clone, ...clone.querySelectorAll(q)];
        // Tag names, not instanceof: these elements belong to the replay iframe's window.
        src.forEach((s: any, i) => {
          const d = dst[i]!;
          if (s.tagName === 'INPUT') {
            if (s.type === 'checkbox' || s.type === 'radio') s.checked ? d.setAttribute('checked', '') : d.removeAttribute('checked');
            else if (s.value !== (s.getAttribute('value') ?? '')) d.setAttribute('value', s.value);
          } else if (s.tagName === 'TEXTAREA') d.textContent = s.value;
          else if (s.tagName === 'OPTION') s.selected ? d.setAttribute('selected', '') : d.removeAttribute('selected');
        });
        // Drop what the replayer itself adds: its <style> under <html> and the paused class.
        if (clone.tagName === 'HTML') {
          const first = clone.firstElementChild;
          if (first?.tagName === 'STYLE' && first.nextElementSibling?.tagName === 'HEAD') first.remove();
        }
        clone.querySelectorAll('.rrweb-paused').forEach((e) => e.classList.remove('rrweb-paused'));
        clone.classList.remove('rrweb-paused');
        if (clone.getAttribute('class') === '') clone.removeAttribute('class');
        return clone.outerHTML;
      };
      if (selector) return [...doc.querySelectorAll(selector)].map(withValues);
      const dt = doc.doctype;
      const doctype = dt ? `<!DOCTYPE ${dt.name}${dt.publicId ? ` PUBLIC "${dt.publicId}"` : ''}${dt.systemId ? ` "${dt.systemId}"` : ''}>\n` : '';
      return doctype + withValues(doc.documentElement);
    }, opts.selector ?? null);
    if (Array.isArray(html) && !html.length) res.warnings.push(`no element matches ${opts.selector} at ${res.time}`);
    return { ...res, html };
  }

  /** Mouse position at t and the element under it in the replayed page. */
  async pointer(t: number): Promise<PointerResult> {
    const res = await this.seek(t);
    const events = this.bundle.events(this.tab);
    const mouse = mouseAt(events, res.replayedT);
    const nearbyInteractions = interactionsBetween(events, res.replayedT - 1000, res.replayedT + 1000);
    if (!mouse) res.warnings.push('no mouse position recorded at or before t');
    const hit = await this.page.evaluate(describeAt, mouse && { x: mouse.x, y: mouse.y });
    return { ...res, mouse, ...hit, nearbyInteractions };
  }
}

/**
 * rrweb's sampled canvas recording (recordCanvas with sampling) stores each frame as one
 * 2D mutation: clearRect, then drawImage of an ImageBitmap of a WebP/PNG blob. Each such event
 * is a whole frame, so the latest one per canvas at t is the canvas content at t.
 */
function isCanvasFrame(e: RrwebEvent): boolean {
  const d = e.data;
  if (e.type !== 3 || d?.source !== 9 || !Array.isArray(d.commands)) return false;
  const [a, b] = d.commands;
  return d.commands.length === 2 && a?.property === 'clearRect' && b?.property === 'drawImage'
    && b.args?.[0]?.rr_type === 'ImageBitmap' && b.args[0].args?.[0]?.rr_type === 'Blob';
}

interface CanvasFrame { id: number; clear: number[]; blob: { type: string; base64: string[] }; drawArgs: number[] }

function canvasFramesAt(events: RrwebEvent[], t: number): CanvasFrame[] {
  const latest = new Map<number, RrwebEvent>();
  for (const e of events) {
    if (e.timestamp > t) break;
    if (isCanvasFrame(e)) latest.set(e.data.id, e);
  }
  return [...latest.values()].map((e) => {
    const [clear, draw] = e.data.commands;
    const blob = draw.args[0].args[0];
    return {
      id: e.data.id,
      clear: clear.args,
      blob: { type: blob.type ?? 'image/webp', base64: blob.data.map((p: any) => p.base64 ?? '') },
      drawArgs: draw.args.slice(1),
    };
  });
}

// Runs in the browser. Returns how many frames failed to draw. Frames of canvases that are
// no longer in the replayed DOM at t (removed panels, old pages) are skipped, not failures.
async function drawCanvasFrames(frames: CanvasFrame[]) {
  const mirror = (window as any).__replayer.getMirror();
  let failed = 0;
  for (const f of frames) {
    try {
      const canvas = mirror.getNode(f.id) as HTMLCanvasElement | null;
      if (!canvas?.isConnected) continue;
      const ctx = canvas.getContext?.('2d');
      if (!ctx) { failed++; continue; }
      const parts = f.blob.base64.map((b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
      const bmp = await createImageBitmap(new Blob(parts, { type: f.blob.type }));
      ctx.clearRect(...(f.clear as [number, number, number, number]));
      (ctx.drawImage as any)(bmp, ...f.drawArgs);
    } catch {
      failed++;
    }
  }
  return failed;
}

// Runs in the browser. Kept self-contained: Playwright serializes it.
function describeAt(point: { x: number; y: number } | null) {
  const { x, y } = point ?? { x: 0, y: 0 };
  const r = (window as any).__replayer;
  const mirror = r.getMirror();
  const top: Document = (r.iframe as HTMLIFrameElement).contentDocument!;
  let doc = top;
  let ox = 0, oy = 0;
  let el: Element | null = point ? doc.elementFromPoint(x, y) : null;
  // Descend into open shadow roots and same-origin iframes.
  for (let i = 0; el && i < 20; i++) {
    const sr = (el as HTMLElement).shadowRoot;
    const inner = sr?.elementFromPoint(x - ox, y - oy);
    if (inner && inner !== el) { el = inner; continue; }
    if (el.tagName === 'IFRAME') {
      const d = (el as HTMLIFrameElement).contentDocument;
      if (!d) break;
      const b = el.getBoundingClientRect();
      ox += b.left; oy += b.top;
      const next = d.elementFromPoint(x - ox, y - oy);
      if (!next) break;
      doc = d; el = next; continue;
    }
    break;
  }
  const KEY = ['role', 'aria-label', 'aria-labelledby', 'aria-expanded', 'aria-selected', 'aria-checked', 'aria-disabled', 'name', 'type', 'href', 'src', 'alt', 'title', 'placeholder', 'for', 'value', 'disabled', 'checked', 'data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];
  const seg = (e: Element) => {
    let s = e.tagName.toLowerCase();
    if (e.id) return `${s}#${CSS.escape(e.id)}`;
    const cls = [...e.classList].filter((c) => !c.startsWith(':')).slice(0, 3);
    if (cls.length) s += cls.map((c) => `.${CSS.escape(c)}`).join('');
    const p = e.parentElement;
    if (p) {
      const same = [...p.children].filter((c) => c.tagName === e.tagName);
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
    }
    return s;
  };
  const path = (e: Element) => {
    const parts: string[] = [];
    for (let c: Element | null = e; c && c.tagName !== 'HTML'; c = c.parentElement) {
      parts.unshift(seg(c));
      if (c.id) break;
    }
    return parts.join(' > ');
  };
  const info = (e: Element) => {
    const attributes: Record<string, string> = {};
    for (const a of KEY) {
      const v = e.getAttribute(a);
      if (v != null) attributes[a] = v.length > 200 ? v.slice(0, 200) + '…' : v;
    }
    if ((e as HTMLInputElement).value !== undefined && typeof (e as HTMLInputElement).value === 'string' && e.tagName !== 'BUTTON' && e.tagName !== 'LI') {
      attributes.value = (e as HTMLInputElement).value;
    }
    const raw = ((e as HTMLElement).innerText ?? e.textContent ?? '').replace(/\s+/g, ' ').trim();
    const b = e.getBoundingClientRect();
    const id = mirror.getId(e);
    const cls = [...e.classList].filter((c) => !c.startsWith(':'));
    return {
      tag: e.tagName.toLowerCase(),
      rrwebId: typeof id === 'number' && id > 0 ? id : null,
      ...(e.id ? { id: e.id } : {}),
      ...(cls.length ? { classes: cls } : {}),
      ...(raw ? { text: raw.length > 200 ? raw.slice(0, 200) + '…' : raw } : {}),
      attributes,
      rect: { x: Math.round(b.left + ox), y: Math.round(b.top + oy), width: Math.round(b.width), height: Math.round(b.height) },
      path: path(e),
    };
  };
  const element = el ? info(el) : null;
  const ancestry = [];
  for (let c = el?.parentElement; c && c.tagName !== 'HTML'; c = c.parentElement) ancestry.push(info(c));
  // The replayer re-applies recorded selections (rrweb selection events) to the top document.
  ox = 0; oy = 0;
  const sel = top.getSelection();
  const selText = sel && sel.rangeCount ? sel.toString().trim() : '';
  let selection = null;
  if (sel && selText) {
    const c = sel.getRangeAt(0).commonAncestorContainer;
    const ce = c.nodeType === 1 ? (c as Element) : c.parentElement;
    if (ce) selection = { text: selText.length > 2000 ? selText.slice(0, 2000) + '…' : selText, element: info(ce) };
  }
  return { element, ancestry, selection };
}

// The recording pill: a small, draggable control on the recorded page (/content-scripts/pill.js).
// Registered by the background at Record next to the recorder, top frame only. It shows the time,
// the mic and Stop while recording, then "Saved" with Open and Download for a few seconds.
//
// It stays out of the replay: the pill lives in a closed shadow root made in this isolated world,
// where rrweb (MAIN world) can't see in. The replay only gets an empty <blook-pill> element, and
// moving the pill changes nothing outside the shadow root.
import { formatDuration } from '@blook/core/format';
import { MIC } from '@/components/mic';
import { sendToBackground, type ContentMessage, type RecordingStatus } from '@/lib/messages';
import { pillPositionItem } from '@/lib/settings';

declare global {
  interface Window {
    /** Set once per document; a second injection only re-attaches the pill. */
    __blookPill?: { attach: () => void };
  }
}

const SAVED_MS = 12_000;
const MARGIN = 12;

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  runAt: 'document_start',
  main() {
    if (window.__blookPill) return void window.__blookPill.attach();
    start();
  },
});

function start() {
  const host = document.createElement('blook-pill');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>${CSS}</style><div class="pill" hidden></div>`;
  const pill = root.querySelector<HTMLDivElement>('.pill')!;

  let status: RecordingStatus = { state: 'idle' };
  /** The session this page showed live; "Saved" is shown only for it. */
  let shownId: string | undefined;
  let saved: { id: string; durationMs?: number; error?: string; until: number; busy?: string } | undefined;
  let pos: { x: number; y: number } | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  /** Some pages replace their document's children; put the pill back. Waits for <body> so the parser isn't disturbed. */
  const attach = () => {
    if (!document.body || host.isConnected) return;
    document.documentElement.append(host);
    place();
  };
  window.__blookPill = { attach };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => render(), { once: true });

  const place = () => {
    if (pill.hidden) return;
    const { width, height } = pill.getBoundingClientRect();
    // clientWidth/Height leave out the page's scrollbars.
    const { clientWidth, clientHeight } = document.documentElement;
    const maxX = (clientWidth || innerWidth) - width - MARGIN;
    const maxY = (clientHeight || innerHeight) - height - MARGIN;
    const x = Math.max(MARGIN, Math.min(maxX, pos?.x ?? MARGIN));
    const y = Math.max(MARGIN, Math.min(maxY, pos?.y ?? maxY));
    pill.style.left = `${x}px`;
    pill.style.top = `${y}px`;
  };
  addEventListener('resize', place);

  function render() {
    const s = status;
    const live = s.state !== 'idle' && !!s.session;
    if (live) {
      shownId = s.session!.id;
      saved = undefined;
    } else if (s.session && s.session.id === shownId && !saved) {
      saved = { id: s.session.id, durationMs: s.session.durationMs, error: s.error, until: Date.now() + SAVED_MS };
    }
    const visible = live || (!!saved && Date.now() < saved.until);
    pill.hidden = !visible;
    clearInterval(timer);
    timer = undefined;
    if (!visible) return;
    attach();

    if (live) {
      const session = s.session!;
      const micState = s.mic ?? session.mic.state;
      const mic = MIC[micState];
      const label =
        s.state === 'starting'
          ? 'Starting…'
          : s.state === 'stopping'
            ? 'Saving…'
            : s.phase === 'loading-page'
              ? 'Loading page…'
              : 'Recording';
      pill.title = [label, mic.label, s.error].filter(Boolean).join(' · ');
      pill.innerHTML = `
        <span class="dot ${s.state === 'recording' ? '' : 'idle'}"></span>
        <span class="time"></span>
        <span class="mic ${mic.tone ?? ''}">${mic.on ? MIC_SVG : MIC_OFF_SVG}</span>
        <button class="stop" data-action="stop" ${s.state === 'recording' ? '' : 'disabled'}>${s.state === 'stopping' ? 'Saving…' : 'Stop'}</button>`;
      const time = pill.querySelector<HTMLSpanElement>('.time')!;
      const tick = () => {
        time.textContent = formatDuration(
          s.state === 'recording' ? Math.max(0, Date.now() - session.startedAt) : (session.durationMs ?? 0),
        );
      };
      tick();
      if (s.state === 'recording') timer = setInterval(tick, 500);
    } else if (saved) {
      pill.title = saved.error ?? 'Saved in Blook';
      pill.innerHTML = `
        <span class="ok">${saved.error ? '!' : '✓'}</span>
        <span>Saved${saved.durationMs != null ? ` · ${formatDuration(saved.durationMs)}` : ''}</span>
        <button class="ghost" data-action="open">Open</button>
        <button class="ghost" data-action="download" ${saved.busy ? 'disabled' : ''}>${saved.busy ?? 'Download'}</button>
        <button class="x" data-action="close" title="Close">✕</button>`;
      pill.querySelector('.ok')!.classList.toggle('warn', !!saved.error);
      // Hide when the time is up, unless the pointer is on it.
      timer = setInterval(() => {
        if (!saved || pill.matches(':hover')) return void (saved && (saved.until = Date.now() + 2000));
        if (Date.now() >= saved.until) render();
      }, 1000);
    }
    place();
  }

  pill.addEventListener('click', async (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (!action || moved) return;
    if (action === 'stop') {
      status = { ...status, state: 'stopping' };
      render();
      await sendToBackground({ type: 'session/stop' }).catch(() => undefined);
    } else if (action === 'close' && saved) {
      saved.until = 0;
      render();
    } else if (action === 'open' && saved) {
      await sendToBackground({ type: 'session/open', sessionId: saved.id }).catch(() => undefined);
    } else if (action === 'download' && saved) {
      const s = saved;
      s.busy = 'Preparing…';
      s.until = Date.now() + SAVED_MS;
      render();
      const res = await sendToBackground({ type: 'session/export', sessionId: s.id }).catch(() => undefined);
      s.busy = res?.ok ? 'Downloaded' : undefined;
      if (!res?.ok) s.error = res?.error ?? 'Download failed.';
      else if (res.warning) s.error = res.warning;
      render();
    }
  });

  // Drag anywhere on the pill; a press that moves more than a few pixels is not a click.
  let moved = false;
  pill.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const box = pill.getBoundingClientRect();
    const dx = e.clientX - box.left;
    const dy = e.clientY - box.top;
    const sx = e.clientX;
    const sy = e.clientY;
    moved = false;
    const move = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 4) return;
      // Capture only once it is a drag: a captured press sends its click to the pill, not the button.
      if (!moved) pill.setPointerCapture(e.pointerId);
      moved = true;
      pill.classList.add('dragging');
      pos = { x: m.clientX - dx, y: m.clientY - dy };
      place();
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      pill.classList.remove('dragging');
      if (moved && pos) void pillPositionItem.setValue(pos);
      // The click after a drag is ignored, then clicks work again.
      setTimeout(() => (moved = false));
    };
    // On window until captured: a fast drag can leave the pill before the capture starts.
    addEventListener('pointermove', move);
    addEventListener('pointerup', up, { once: true });
    addEventListener('pointercancel', up, { once: true });
  });

  browser.runtime.onMessage.addListener((msg: ContentMessage) => {
    if (msg.type !== 'status/update') return undefined;
    status = msg.status;
    render();
    return undefined;
  });

  void pillPositionItem.getValue().then((p) => {
    pos = p;
    place();
  });
  void sendToBackground({ type: 'session/status' })
    .then((s) => {
      status = s;
      render();
    })
    .catch(() => {});
}

const MIC_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const MIC_OFF_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 9.3V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.7 2.5M5 11a7 7 0 0 0 11.5 5.3M19 11a7 7 0 0 1-.4 2.3M12 18v3M3 3l18 18"/></svg>';

// Colours from packages/ui/src/theme.css (slate, and the recording vermilion).
const CSS = `
:host { all: initial; }
.pill[hidden] { display: none; }
.pill {
  position: fixed; z-index: 2147483647; left: ${MARGIN}px; top: ${MARGIN}px;
  display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 4px 0 12px; box-sizing: border-box;
  border-radius: 999px; background: #0f172a; color: #fff; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.35);
  font: 500 12px/1 ui-sans-serif, system-ui, -apple-system, sans-serif; white-space: nowrap;
  cursor: grab; user-select: none; touch-action: none;
}
.pill.dragging { cursor: grabbing; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #f2542d; animation: pulse 1.4s ease-in-out infinite; }
.dot.idle { background: #64748b; animation: none; }
@keyframes pulse { 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
.time { font-variant-numeric: tabular-nums; min-width: 32px; }
.mic { display: grid; place-items: center; color: #94a3b8; }
.mic.warn { color: #fbbf24; }
.mic.danger { color: #f87171; }
.ok { display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: #16a34a; font-size: 10px; font-weight: 700; }
.ok.warn { background: #d97706; }
button {
  all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px;
  border-radius: 999px; font-weight: 600; cursor: pointer;
}
button:focus-visible { outline: 2px solid #94a3b8; outline-offset: 1px; }
button[disabled] { opacity: 0.6; cursor: default; }
.stop { background: #cc3f1d; }
.stop:not([disabled]):hover { background: #b52e15; }
.stop::before { content: ""; width: 8px; height: 8px; border-radius: 2px; background: #fff; }
.ghost { background: #1e293b; }
.ghost:not([disabled]):hover { background: #334155; }
.x { width: 24px; padding: 0; justify-content: center; color: #94a3b8; font-weight: 400; }
.x:hover { color: #fff; }
`;

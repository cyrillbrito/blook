import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Bundle } from './bundle';
import { AudioSync, Clock, TabReplay, lastAtOrBefore } from './playback';
import { ConsolePanel, NetworkPanel, TimelinePanel, TranscriptPanel, WebSocketsPanel, type Focus, type PanelId } from './panels';
import { formatDuration, formatTime, shortUrl } from '@blook/core/format';
import { cx, useNow, usePlaying } from './util';
import { Badge, Button, Switch } from '@blook/ui';
import { BlookIcon, DownloadIcon, PauseIcon, PlayIcon, SpinnerIcon, VolumeIcon } from '@blook/ui/icons';

const SPEEDS = [0.5, 1, 2, 4, 8];

type Download = () => Promise<void>;

export function Viewer({ bundle, onDownload }: { bundle: Bundle; onDownload?: Download }) {
  // Created in an effect, so StrictMode's mount-unmount-mount gets a fresh pair.
  const [pb, setPb] = useState<{ clock: Clock; audio: AudioSync; bundle: Bundle }>();
  useEffect(() => {
    const clock = new Clock(bundle.endT);
    const audio = new AudioSync(bundle, clock);
    setPb({ clock, audio, bundle });
    return () => {
      audio.destroy();
      clock.destroy();
    };
  }, [bundle]);
  if (pb?.bundle !== bundle) return null;
  return <ViewerBody bundle={bundle} onDownload={onDownload} clock={pb.clock} audio={pb.audio} />;
}

function ViewerBody({ bundle, onDownload, clock, audio }: { bundle: Bundle; onDownload?: Download; clock: Clock; audio: AudioSync }) {
  const tabs = useMemo(() => [...bundle.rrweb.keys()], [bundle]);
  const allTabs = useMemo(() => {
    const ids = new Set([...bundle.session.tabs.map((t) => t.tabId), ...tabs]);
    return [...ids];
  }, [bundle, tabs]);
  const [tabId, setTabId] = useState<number | undefined>(tabs[0]);
  const [panel, setPanel] = useState<PanelId>('timeline');
  const [focus, setFocus] = useState<Focus>();
  const [follow, setFollow] = useState(true);
  const [split, setSplit] = useState(() => Math.round(innerWidth * 0.55));

  const seek = useCallback(
    (t: number, tab?: number) => {
      if (tab != null && bundle.rrweb.has(tab)) setTabId(tab);
      clock.seek(t);
    },
    [bundle, clock],
  );
  const open = useCallback((p: PanelId, key: string) => {
    setPanel(p);
    setFocus((f) => ({ panel: p, key, n: (f?.n ?? 0) + 1 }));
  }, []);

  // Space plays/pauses, arrows step 1 s (5 s with Shift).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === ' ') {
        e.preventDefault();
        clock.toggle();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        clock.seek(clock.now() + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5000 : 1000));
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [clock]);

  const s = bundle.session;
  const c = {
    timeline: bundle.timeline.length,
    transcript: bundle.transcript.segments.length,
    network: bundle.network.length,
    websockets: bundle.websockets.length,
    console: bundle.console.length,
  };
  // Timeline errors skip Chrome's "Failed to load resource" lines, which failed requests already cover.
  const errors = bundle.timeline.filter((x) => x.type === 'error').length;
  const failed = bundle.network.filter((x) => x.failed).length;
  const panelProps = { bundle, tabs: allTabs, clock, follow, seek, open, focus };

  return (
    <div className="flex h-screen flex-col bg-surface text-xs text-fg">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-surface-muted px-3">
        <span className="flex shrink-0 items-center gap-1.5 font-semibold">
          <BlookIcon />
          Blook
        </span>
        <span className="h-4 w-px shrink-0 bg-line" />
        <span className="min-w-0 truncate text-sm font-medium" title={s.url}>
          {s.title || shortUrl(s.url)}
        </span>
        <span className="shrink-0 text-muted">
          {new Date(s.startedAt).toLocaleString()} · {formatDuration(bundle.endT)}
        </span>
        <span className="flex shrink-0 gap-1">
          {s.status === 'recording' && <Badge tone="warn">ended without Stop</Badge>}
          {s.settings.mask && <Badge>masked</Badge>}
          {s.settings.canvas && <Badge>canvas</Badge>}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {errors > 0 && <Badge tone="danger">{errors} errors</Badge>}
          {failed > 0 && <Badge tone="danger">{failed} failed requests</Badge>}
          {onDownload && <DownloadButton onDownload={onDownload} />}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-col" style={{ width: split }}>
          {tabs.length > 1 && (
            <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 px-2 py-1">
              {tabs.map((id, i) => {
                const url = s.tabs.find((t) => t.tabId === id)?.url || s.navigations.find((n) => n.tabId === id)?.url;
                return (
                  <button
                    key={id}
                    title={url}
                    onClick={() => setTabId(id)}
                    className={cx(
                      'max-w-56 shrink-0 truncate rounded-control px-2 py-0.5',
                      id === tabId ? 'bg-fg text-white' : 'border border-line-strong hover:bg-surface-sunken',
                    )}
                  >
                    Tab {i + 1}
                    {url && `: ${shortUrl(url)}`}
                  </button>
                );
              })}
            </nav>
          )}
          <AddressBar bundle={bundle} tabId={tabId} clock={clock} />
          {tabId != null ? (
            <Stage key={tabId} bundle={bundle} tabId={tabId} clock={clock} />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-gray-100 text-gray-500">
              This bundle has no DOM recording (rrweb).
            </div>
          )}
          <Controls bundle={bundle} clock={clock} audio={audio} />
        </div>

        <Splitter onDrag={(x) => setSplit(Math.max(320, Math.min(innerWidth - 360, x)))} />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-end gap-0.5 border-b border-gray-200 bg-gray-50 px-1 pt-1">
            {(
              [
                ['timeline', 'Timeline'],
                ['transcript', 'Transcript'],
                ['network', 'Network'],
                ['websockets', 'WebSockets'],
                ['console', 'Console'],
              ] as [PanelId, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setPanel(id)}
                className={cx(
                  'rounded-t border border-b-0 px-2 py-1',
                  panel === id ? 'border-gray-200 bg-white font-medium' : 'border-transparent text-gray-600 hover:text-gray-900',
                )}
              >
                {label}{' '}
                <span className={cx('text-gray-400', id === 'console' && errors > 0 && 'text-red-600')}>
                  {id === 'console' && errors > 0 && '✖ '}
                  {c[id]}
                </span>
              </button>
            ))}
            <span className="mb-1.5 ml-auto px-2 text-gray-600">
              <Switch label="Follow" checked={follow} onChange={setFollow} title="Scroll lists to the playhead while playing" />
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {panel === 'timeline' && <TimelinePanel {...panelProps} />}
            {panel === 'transcript' && <TranscriptPanel {...panelProps} />}
            {panel === 'network' && <NetworkPanel {...panelProps} />}
            {panel === 'websockets' && <WebSocketsPanel {...panelProps} />}
            {panel === 'console' && <ConsolePanel {...panelProps} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Splitter({ onDrag }: { onDrag: (x: number) => void }) {
  return (
    <div
      className="w-1 shrink-0 cursor-col-resize bg-gray-200 hover:bg-blue-400"
      onPointerDown={(e) => {
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => onDrag(ev.clientX);
        const up = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      }}
    />
  );
}

/** The tab's URL at the playhead, from session.navigations. */
function AddressBar({ bundle, tabId, clock }: { bundle: Bundle; tabId?: number; clock: Clock }) {
  const now = useNow(clock, 250);
  const navs = useMemo(() => bundle.session.navigations.filter((n) => n.tabId === tabId), [bundle, tabId]);
  const url = navs[lastAtOrBefore(navs, now)]?.url ?? bundle.session.tabs.find((t) => t.tabId === tabId)?.url ?? '';
  return (
    <div className="shrink-0 border-b border-gray-200 px-2 py-1">
      <div className="truncate rounded bg-gray-100 px-2 py-0.5 font-mono text-gray-700" title={url}>
        {url || '—'}
      </div>
    </div>
  );
}

/** The rrweb replay of one tab, scaled to fit. */
function Stage({ bundle, tabId, clock }: { bundle: Bundle; tabId: number; clock: Clock }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [replay, setReplay] = useState<TabReplay>();
  const [error, setError] = useState<string>();
  const events = bundle.rrweb.get(tabId)!;
  const firstFull = useMemo(() => events.find((e) => e.type === 2)?.timestamp, [events]);
  const now = useNow(clock, 250);

  useEffect(() => {
    const root = rootRef.current!;
    if (firstFull == null) return;
    let r: TabReplay;
    try {
      r = new TabReplay(root, events, clock, { canvas: bundle.session.settings.canvas });
    } catch (e) {
      setError(String(e));
      return;
    }
    setReplay(r);
    return () => {
      r.destroy();
      root.innerHTML = '';
      setReplay(undefined);
    };
  }, [events, clock, bundle, firstFull]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || !replay) return;
    const fit = () => {
      const scale = Math.min(box.clientWidth / replay.width, box.clientHeight / replay.height, 1);
      const wrapper = replay.replayer.wrapper;
      wrapper.style.transform = `scale(${scale})`;
      wrapper.style.transformOrigin = 'top left';
      const root = rootRef.current!;
      root.style.width = `${replay.width * scale}px`;
      root.style.height = `${replay.height * scale}px`;
    };
    replay.onResize = fit;
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [replay]);

  const overlay =
    error ??
    (firstFull == null
      ? 'This tab has no full DOM snapshot, so it cannot be replayed.'
      : now < firstFull
        ? now < Math.min(events[0]!.timestamp, bundle.session.tabs.find((t) => t.tabId === tabId)?.t ?? Infinity)
          ? 'Tab not open yet at this time.'
          : 'Page loading: no DOM captured yet.'
        : undefined);

  return (
    <div ref={boxRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-gray-200">
      <div
        ref={rootRef}
        className={cx('overflow-hidden bg-white shadow [&_iframe]:border-0 [&_iframe]:bg-white', overlay && 'opacity-40')}
      />
      {overlay && <span className="absolute top-2 left-1/2 -translate-x-1/2 rounded bg-gray-800/85 px-3 py-1 text-white">{overlay}</span>}
    </div>
  );
}

interface Marker {
  t: number;
  endT?: number;
  kind: 'error' | 'failed' | 'speech' | 'click' | 'nav';
  label: string;
}

const MARKER_STYLE: Record<Marker['kind'], string> = {
  error: 'bg-red-600',
  failed: 'bg-orange-500',
  click: 'bg-sky-500',
  nav: 'bg-violet-600',
  speech: 'bg-blue-400/60',
};

function Controls({ bundle, clock, audio }: { bundle: Bundle; clock: Clock; audio: AudioSync }) {
  const { playing, speed } = usePlaying(clock);
  const [muted, setMuted] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState<{ x: number; t: number }>();
  const end = Math.max(1, bundle.endT);

  // Playhead moves every frame without React renders.
  useEffect(() => {
    const draw = () => {
      const p = `${(clock.now() / end) * 100}%`;
      if (fillRef.current) fillRef.current.style.width = p;
      if (headRef.current) headRef.current.style.left = p;
      if (timeRef.current) timeRef.current.textContent = formatTime(clock.now());
    };
    draw();
    return clock.onTick(draw);
  }, [clock, end]);

  const markers = useMemo<Marker[]>(() => {
    const m: Marker[] = [];
    for (const e of bundle.timeline) {
      if (e.type === 'error') m.push({ t: e.t, kind: 'error', label: e.summary });
      else if (e.type === 'request-failed') m.push({ t: e.t, kind: 'failed', label: e.summary });
      else if (e.type === 'click') m.push({ t: e.t, kind: 'click', label: e.summary });
      else if (e.type === 'navigation' && e.t > 0) m.push({ t: e.t, kind: 'nav', label: e.summary });
    }
    for (const s of bundle.transcript.segments) m.push({ t: s.t, endT: s.endT, kind: 'speech', label: s.text });
    return m;
  }, [bundle]);

  const tAt = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * end;
  };
  const near = hover ? markers.filter((m) => m.kind !== 'speech' && Math.abs(m.t - hover.t) < end / 150).slice(0, 4) : [];
  const speech = hover ? markers.find((m) => m.kind === 'speech' && hover.t >= m.t && hover.t <= m.endT!) : undefined;

  return (
    <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-2 py-1.5">
      <div
        ref={barRef}
        className="relative h-6 cursor-pointer select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          clock.seek(tAt(e.clientX));
        }}
        onPointerMove={(e) => {
          const r = barRef.current!.getBoundingClientRect();
          setHover({ x: e.clientX - r.left, t: tAt(e.clientX) });
          if (e.buttons & 1) clock.seek(tAt(e.clientX));
        }}
        onPointerLeave={() => setHover(undefined)}
      >
        {/* speech bands on top, event ticks below the track */}
        {markers
          .filter((m) => m.kind === 'speech')
          .map((m, i) => (
            <div
              key={`s${i}`}
              className={cx('absolute top-0 h-1.5 rounded-sm', MARKER_STYLE.speech)}
              style={{ left: `${(m.t / end) * 100}%`, width: `${Math.max(0.3, ((m.endT! - m.t) / end) * 100)}%` }}
            />
          ))}
        <div className="absolute top-2 right-0 left-0 h-1.5 rounded bg-gray-300">
          <div ref={fillRef} className="h-full rounded bg-gray-700" />
        </div>
        {markers
          .filter((m) => m.kind !== 'speech')
          .map((m, i) => (
            <div
              key={`m${i}`}
              className={cx('absolute w-0.5', MARKER_STYLE[m.kind], m.kind === 'click' ? 'top-4 h-1.5 opacity-70' : 'top-3.5 h-2.5')}
              style={{ left: `${(m.t / end) * 100}%` }}
            />
          ))}
        <div ref={headRef} className="pointer-events-none absolute top-0.5 h-5 w-0.5 -translate-x-1/2 bg-amber-500" />
        {hover && (
          <div
            className="pointer-events-none absolute bottom-7 z-20 max-w-80 -translate-x-1/2 rounded bg-gray-900 px-2 py-1 text-[11px] text-white shadow"
            style={{ left: Math.max(60, Math.min(hover.x, (barRef.current?.clientWidth ?? 0) - 60)) }}
          >
            <div className="font-mono">{formatTime(hover.t)}</div>
            {speech && <div className="truncate text-blue-200">🗣 {speech.label}</div>}
            {near.map((m, i) => (
              <div key={i} className={cx('truncate', m.kind === 'error' || m.kind === 'failed' ? 'text-red-300' : 'text-gray-300')}>
                {(m.kind === 'error' || m.kind === 'failed') && '✖ '}
                {m.label}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Button variant="primary" size="sm" className="w-18" onClick={() => clock.toggle()} title="Play/pause (Space)">
          {playing ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
          {playing ? 'Pause' : 'Play'}
        </Button>
        <span className="font-mono tabular-nums">
          <span ref={timeRef} /> <span className="text-gray-400">/ {formatTime(bundle.endT)}</span>
        </span>
        <select
          value={speed}
          onChange={(e) => clock.setSpeed(Number(e.target.value))}
          className="h-6 rounded-control border border-line-strong bg-surface px-1"
          title="Speed"
        >
          {SPEEDS.map((v) => (
            <option key={v} value={v}>
              {v}×
            </option>
          ))}
        </select>
        {audio.available && (
          <Button
            size="sm"
            onClick={() => {
              audio.setMuted(!muted);
              setMuted(!muted);
            }}
            title={speed > 4 ? 'Audio is off above 4×' : 'Mic audio'}
          >
            <VolumeIcon muted={muted} className="h-3.5 w-3.5" />
            {muted ? 'Muted' : 'Audio'}
          </Button>
        )}
        <span className="ml-auto flex gap-2 text-[11px] text-gray-500">
          <Legend cls={MARKER_STYLE.error} label="error" />
          <Legend cls={MARKER_STYLE.failed} label="failed request" />
          <Legend cls={MARKER_STYLE.click} label="click" />
          <Legend cls={MARKER_STYLE.nav} label="navigation" />
          <Legend cls={MARKER_STYLE.speech} label="speech" />
        </span>
      </div>
    </div>
  );
}

function DownloadButton({ onDownload }: { onDownload: Download }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <>
      {error && (
        <span className="max-w-64 truncate text-red-700" title={error}>
          {error}
        </span>
      )}
      <Button
        size="sm"
        disabled={busy}
        title="Download this session as a bundle .zip"
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          await onDownload().catch((e) => setError(String((e as Error)?.message ?? e)));
          setBusy(false);
        }}
      >
        {busy ? <SpinnerIcon className="h-3.5 w-3.5" /> : <DownloadIcon className="h-3.5 w-3.5" />}
        {busy ? 'Preparing…' : 'Download bundle'}
      </Button>
    </>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cx('inline-block h-2 w-2 rounded-sm', cls)} />
      {label}
    </span>
  );
}

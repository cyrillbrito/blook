import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EventType } from '@rrweb/types';
import type { Bundle } from './bundle';
import { AudioSync, Clock, TabReplay, lastAtOrBefore } from './playback';
import { ConsolePanel, NetworkPanel, TimelinePanel, TranscriptPanel, WebSocketsPanel, type Focus, type PanelId } from './panels';
import { formatDuration, formatTime, shortUrl } from '@blook/core/format';
import { useNow, usePlaying } from './util';
import { Badge, Button, Card, Tabs, Toggle, cx, tabPanelProps } from '@blook/ui';
import { KIND, type Kind } from './kinds';
import { BlookIcon, PauseIcon, PlayIcon, Spinner } from '@blook/ui/icons';
import ArrowLeftIcon from 'lucide-react/icons/arrow-left';
import DownloadIcon from 'lucide-react/icons/download';
import Volume2Icon from 'lucide-react/icons/volume-2';
import VolumeXIcon from 'lucide-react/icons/volume-x';

const SPEEDS = [0.5, 1, 2, 4, 8];

type Download = () => Promise<void>;
/** A link out of the viewer, shown first in the header (the extension's "← Recordings"). */
export type BackLink = { href: string; label: string };

export function Viewer({ bundle, onDownload, back }: { bundle: Bundle; onDownload?: Download; back?: BackLink }) {
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
  return <ViewerBody bundle={bundle} onDownload={onDownload} back={back} clock={pb.clock} audio={pb.audio} />;
}

function ViewerBody({
  bundle,
  onDownload,
  back,
  clock,
  audio,
}: {
  bundle: Bundle;
  onDownload?: Download;
  back?: BackLink;
  clock: Clock;
  audio: AudioSync;
}) {
  const tabs = useMemo(() => [...bundle.rrweb.keys()], [bundle]);
  const allTabs = useMemo(() => {
    const ids = new Set([...bundle.session.tabs.map((t) => t.tabId), ...tabs]);
    return [...ids];
  }, [bundle, tabs]);
  const [tabId, setTabId] = useState<number | undefined>(tabs[0]);
  const [panel, setPanel] = useState<PanelId>('timeline');
  const [focus, setFocus] = useState<Focus>();
  // The replay card's share of the width.
  const [split, setSplit] = useState(0.55);
  const tabsId = useId();

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

  // Space plays/pauses, ←/→ step 1 s (5 s with Shift). A key a focused control handled (preventDefault) is its own,
  // as is Space on anything it presses and every key while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target as HTMLElement;
      if (el.closest('input:not([type=range]), textarea, select, [contenteditable]')) return;
      if (e.key === ' ') {
        if (el.closest('button, a, summary')) return;
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
  const panelProps = { bundle, tabs: allTabs, clock, seek, open, focus };

  return (
    <div className="flex h-screen flex-col bg-canvas text-xs text-fg antialiased">
      <header className="flex h-11 shrink-0 items-center gap-3 px-4">
        {back ? (
          <a href={back.href} className="flex shrink-0 items-center gap-1.5 font-medium text-muted hover:text-fg">
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            {back.label}
          </a>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 font-semibold">
            <BlookIcon />
            Blook
          </span>
        )}
        <span className="h-4 w-px shrink-0 bg-line-strong" />
        <h1 className="min-w-0 truncate text-sm font-medium" title={s.url}>
          {s.title || shortUrl(s.url)}
        </h1>
        <span className="shrink-0 text-muted">
          {new Date(s.startedAt).toLocaleString()} · {formatDuration(bundle.endT)}
        </span>
        <span className="flex shrink-0 gap-1">
          {s.status === 'recording' && <Badge tone="warn">ended without Stop</Badge>}
          {s.settings.mask && <Badge>masked</Badge>}
          {s.settings.canvas && <Badge>canvas</Badge>}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">{onDownload && <DownloadButton onDownload={onDownload} />}</span>
      </header>

      <main className="flex min-h-0 flex-1 px-2 pb-2">
        <Card className="flex min-w-80 flex-col overflow-hidden" style={{ flexBasis: `${split * 100}%` }}>
          {tabs.length > 1 && (
            <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
              {tabs.map((id, i) => {
                const url = s.tabs.find((t) => t.tabId === id)?.url || s.navigations.find((n) => n.tabId === id)?.url;
                return (
                  <Toggle key={id} pressed={id === tabId} title={url} onClick={() => setTabId(id)} className="max-w-56">
                    <span className="truncate">
                      Tab {i + 1}
                      {url && `: ${shortUrl(url)}`}
                    </span>
                  </Toggle>
                );
              })}
            </nav>
          )}
          <AddressBar bundle={bundle} tabId={tabId} clock={clock} />
          {tabId != null ? (
            <Stage key={tabId} bundle={bundle} tabId={tabId} clock={clock} />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-surface-sunken text-muted">
              This bundle has no DOM recording (rrweb).
            </div>
          )}
          <Controls bundle={bundle} clock={clock} audio={audio} />
        </Card>

        <Splitter value={split} onChange={(f) => setSplit(Math.max(0.15, Math.min(0.85, f)))} />

        <Card className="flex min-w-90 flex-1 flex-col overflow-hidden">
          <Tabs
            id={tabsId}
            value={panel}
            onChange={setPanel}
            className="flex h-9 shrink-0 items-stretch gap-0.5 border-b border-line-strong px-1.5"
            tabs={PANELS.map(([id, label, none]) => {
              const empty = c[id] === 0;
              return {
                id,
                title: empty ? none : undefined,
                className: cx(empty && 'italic'),
                label: (
                  <>
                    {label}
                    {!empty && (
                      <span className={cx('font-normal text-muted tabular-nums', id === 'console' && errors > 0 && 'text-danger')}>
                        {id === 'console' && errors > 0 && '✖ '}
                        {c[id]}
                      </span>
                    )}
                  </>
                ),
              };
            })}
          />
          <div className="flex min-h-0 flex-1 flex-col" {...tabPanelProps(tabsId, panel)}>
            {panel === 'timeline' && <TimelinePanel {...panelProps} />}
            {panel === 'transcript' && <TranscriptPanel {...panelProps} />}
            {panel === 'network' && <NetworkPanel {...panelProps} />}
            {panel === 'websockets' && <WebSocketsPanel {...panelProps} />}
            {panel === 'console' && <ConsolePanel {...panelProps} />}
          </div>
        </Card>
      </main>
    </div>
  );
}

/** The panels, in tab order: [id, label, tooltip when empty]. */
const PANELS: [PanelId, string, string][] = [
  ['timeline', 'Timeline', 'Nothing happened in this recording'],
  ['console', 'Console', 'No console messages in this recording'],
  ['network', 'Network', 'No HTTP requests in this recording'],
  ['websockets', 'WebSockets', 'No WebSockets in this recording'],
  ['transcript', 'Transcript', 'No speech was transcribed in this recording'],
];

/** The gap between the cards; a line shows on hover. Drag it, or focus it and use ←/→. `value` is the left card's share. */
function Splitter({ value, onChange }: { value: number; onChange: (share: number) => void }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the replay"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={15}
      aria-valuemax={85}
      tabIndex={0}
      className="group flex w-2 shrink-0 cursor-col-resize justify-center rounded-full"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        onChange(value + (e.key === 'ArrowLeft' ? -0.05 : 0.05));
      }}
      onPointerDown={(e) => {
        const el = e.currentTarget;
        const box = el.parentElement!.getBoundingClientRect();
        el.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => onChange((ev.clientX - box.left) / box.width);
        const up = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      }}
    >
      <div className="w-0.5 rounded-full transition-colors group-hover:bg-accent group-active:bg-accent" />
    </div>
  );
}

/** The tab's URL at the playhead, from session.navigations. */
function AddressBar({ bundle, tabId, clock }: { bundle: Bundle; tabId?: number; clock: Clock }) {
  const now = useNow(clock, 250);
  const navs = useMemo(() => bundle.session.navigations.filter((n) => n.tabId === tabId), [bundle, tabId]);
  const url = navs[lastAtOrBefore(navs, now)]?.url ?? bundle.session.tabs.find((t) => t.tabId === tabId)?.url ?? '';
  return (
    <div className="shrink-0 border-b border-line-strong px-2 py-1.5">
      <div className="truncate rounded-control bg-surface-sunken px-3 py-1 text-sm" title={url}>
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
  const firstFull = useMemo(() => events.find((e) => e.type === EventType.FullSnapshot)?.timestamp, [events]);
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
    <div ref={boxRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-surface-sunken">
      <div
        ref={rootRef}
        className={cx('overflow-hidden bg-surface shadow [&_iframe]:border-0 [&_iframe]:bg-surface', overlay && 'opacity-40')}
      />
      {overlay && <span className="absolute top-2 left-1/2 -translate-x-1/2 rounded-control bg-fg/85 px-3 py-1 text-white">{overlay}</span>}
    </div>
  );
}

interface Marker {
  t: number;
  endT?: number;
  kind: Extract<Kind, 'error' | 'failed' | 'speech' | 'user' | 'nav'>;
  label: string;
}

const LEGEND: Marker['kind'][] = ['error', 'failed', 'user', 'nav', 'speech'];

function Controls({ bundle, clock, audio }: { bundle: Bundle; clock: Clock; audio: AudioSync }) {
  const { playing, speed } = usePlaying(clock);
  const [muted, setMuted] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState<{ x: number; t: number }>();
  const end = Math.max(1, bundle.endT);

  // Playhead moves every frame without React renders.
  useEffect(() => {
    const draw = () => {
      const now = clock.now();
      const text = formatTime(now);
      if (fillRef.current) fillRef.current.style.width = `${(now / end) * 100}%`;
      if (rangeRef.current) rangeRef.current.value = String(now);
      if (timeRef.current && timeRef.current.textContent !== text) {
        timeRef.current.textContent = text;
        rangeRef.current?.setAttribute('aria-valuetext', `${text} of ${formatTime(end)}`);
      }
    };
    draw();
    return clock.onTick(draw);
  }, [clock, end]);

  const markers = useMemo<Marker[]>(() => {
    const m: Marker[] = [];
    for (const e of bundle.timeline) {
      if (e.type === 'error') m.push({ t: e.t, kind: 'error', label: e.summary });
      else if (e.type === 'request-failed') m.push({ t: e.t, kind: 'failed', label: e.summary });
      else if (e.type === 'click') m.push({ t: e.t, kind: 'user', label: e.summary });
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
    <div className="shrink-0 border-t border-line-strong px-2 pt-1.5 pb-2">
      {/* The marks are drawn under a native range input, whose thumb is the playhead: it brings the keys,
          dragging and the screen reader value. */}
      <div
        ref={barRef}
        className="relative h-6 select-none"
        onPointerMove={(e) => {
          const r = barRef.current!.getBoundingClientRect();
          setHover({ x: e.clientX - r.left, t: tAt(e.clientX) });
        }}
        onPointerLeave={() => setHover(undefined)}
      >
        {markers
          .filter((m) => m.kind === 'speech')
          .map((m, i) => (
            <div
              key={`s${i}`}
              className={cx('absolute top-0 h-1.5 rounded-sm', KIND.speech.mark)}
              style={{ left: `${(m.t / end) * 100}%`, width: `${Math.max(0.3, ((m.endT! - m.t) / end) * 100)}%` }}
            />
          ))}
        <div className="absolute top-2 right-0 left-0 h-1.5 rounded-full bg-line-strong">
          <div ref={fillRef} className="h-full rounded-full bg-accent" />
        </div>
        {markers
          .filter((m) => m.kind !== 'speech')
          .map((m, i) => (
            <div
              key={`m${i}`}
              className={cx('absolute w-0.5', KIND[m.kind].mark, m.kind === 'user' ? 'top-4 h-1.5 opacity-70' : 'top-3.5 h-2.5')}
              style={{ left: `${(m.t / end) * 100}%` }}
            />
          ))}
        <input
          ref={rangeRef}
          type="range"
          min={0}
          max={end}
          step="any"
          defaultValue={0}
          aria-label="Playback position"
          onChange={(e) => clock.seek(Number(e.target.value))}
          className="scrubber absolute inset-0 h-full w-full"
        />
        {hover && (
          <div
            className="pointer-events-none absolute bottom-7 z-20 max-w-80 -translate-x-1/2 rounded-control bg-fg px-2 py-1 text-2xs text-white shadow-md"
            style={{ left: Math.max(60, Math.min(hover.x, (barRef.current?.clientWidth ?? 0) - 60)) }}
          >
            <div className="tabular-nums">{formatTime(hover.t)}</div>
            {speech && <div className="truncate text-blue-200">🗣 {speech.label}</div>}
            {near.map((m, i) => (
              <div key={i} className={cx('truncate', m.kind === 'error' || m.kind === 'failed' ? 'text-red-300' : 'text-white/70')}>
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
        <span className="tabular-nums">
          <span ref={timeRef} /> <span className="text-muted">/ {formatTime(bundle.endT)}</span>
        </span>
        <select
          value={speed}
          onChange={(e) => clock.setSpeed(Number(e.target.value))}
          className="h-control rounded-control border border-line-strong bg-surface px-1.5"
          title="Speed"
          aria-label="Speed"
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
            {muted ? <VolumeXIcon className="h-3.5 w-3.5" /> : <Volume2Icon className="h-3.5 w-3.5" />}
            {muted ? 'Muted' : 'Audio'}
          </Button>
        )}
        <span className="ml-auto flex gap-2 text-2xs text-muted">
          {LEGEND.map((k) => (
            <Legend key={k} cls={KIND[k].mark} label={KIND[k].label} />
          ))}
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
        <span role="alert" className="max-w-64 truncate text-danger" title={error}>
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
        {busy ? <Spinner className="h-3.5 w-3.5" /> : <DownloadIcon className="h-3.5 w-3.5" />}
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

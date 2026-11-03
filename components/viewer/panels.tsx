import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bundle, ConsoleOut, FrameOut, RequestOut, SocketOut, TimelineEntry } from './bundle';
import { lastAtOrBefore } from './playback';
import { Body, Chip, Detail, KeyValues, RowList, Search, Section, SubTabs, TabBadge, Time, Toolbar, includes, type PanelProps } from './ui';
import { cx, formatBytes, formatMs, formatTime, urlName, useNow } from './util';

export type PanelId = 'timeline' | 'transcript' | 'network' | 'websockets' | 'console';

/** Body props for an inline network.json body: JSON values back to text, base64 as bytes. */
function bodyProps(body: unknown, encoding?: string): { text?: string; base64?: string } {
  if (body === undefined) return {};
  if (encoding === 'base64') return { base64: String(body) };
  return { text: encoding === 'json' ? JSON.stringify(body) : String(body) };
}

/** What a panel should select when opened from another panel. */
export interface Focus {
  panel: PanelId;
  key: string;
  n: number; // bump to re-apply the same key
}

interface Props extends PanelProps {
  bundle: Bundle;
  tabs: number[];
  focus?: Focus;
  open: (panel: PanelId, key: string) => void;
}

function useSelection(panel: PanelId, focus: Focus | undefined) {
  const [sel, setSel] = useState<string>();
  useEffect(() => {
    if (focus?.panel === panel) setSel(focus.key);
  }, [focus, panel]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSel(undefined);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  return [sel, setSel] as const;
}

// ---------------------------------------------------------------- Timeline

const TL_GROUPS: { id: string; label: string; types: string[] }[] = [
  { id: 'nav', label: 'Navigation', types: ['navigation', 'tab-open', 'snapshot'] },
  { id: 'user', label: 'User', types: ['click', 'input', 'scroll'] },
  { id: 'net', label: 'Network', types: ['request', 'request-failed'] },
  { id: 'ws', label: 'WebSocket', types: ['ws-open', 'ws-close', 'ws-frame'] },
  { id: 'console', label: 'Console', types: ['console', 'error'] },
  { id: 'speech', label: 'Speech', types: ['speech'] },
];

const TYPE_STYLE: Record<string, string> = {
  navigation: 'bg-violet-100 text-violet-800',
  'tab-open': 'bg-violet-100 text-violet-800',
  snapshot: 'bg-gray-100 text-gray-600',
  click: 'bg-sky-100 text-sky-800',
  input: 'bg-sky-100 text-sky-800',
  scroll: 'bg-gray-100 text-gray-600',
  request: 'bg-gray-100 text-gray-700',
  'request-failed': 'bg-red-100 text-red-800',
  'ws-open': 'bg-teal-100 text-teal-800',
  'ws-close': 'bg-teal-100 text-teal-800',
  'ws-frame': 'bg-teal-50 text-teal-700',
  console: 'bg-gray-100 text-gray-700',
  error: 'bg-red-100 text-red-800',
  speech: 'bg-blue-100 text-blue-800',
};

export function TimelinePanel({ bundle, tabs, clock, follow, seek, open, focus }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(['snapshot', 'scroll']));
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useSelection('timeline', focus);
  const keyOf = useCallback((e: TimelineEntry) => String(bundle.timeline.indexOf(e)), [bundle]);

  const groupOff = (g: (typeof TL_GROUPS)[number]) => g.types.every((t) => hidden.has(t));
  const toggle = (g: (typeof TL_GROUPS)[number]) => {
    const next = new Set(hidden);
    const off = groupOff(g);
    for (const t of g.types) off ? next.delete(t) : next.add(t);
    setHidden(next);
  };

  const items = useMemo(
    () =>
      bundle.timeline.filter(
        (e) =>
          !hidden.has(e.type) &&
          (!onlyProblems || e.type === 'error' || e.type === 'request-failed') &&
          includes(e.summary, q),
      ),
    [bundle, hidden, onlyProblems, q],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of bundle.timeline) c[e.type] = (c[e.type] ?? 0) + 1;
    return c;
  }, [bundle]);

  const render = useCallback(
    (e: TimelineEntry) => (
      <div className="flex items-center gap-2 px-2 py-px font-mono">
        <Time t={e.t} />
        <span className={cx('w-24 shrink-0 truncate rounded px-1 text-center text-[11px]', TYPE_STYLE[e.type])}>{e.type}</span>
        <TabBadge tabId={e.tabId} tabs={tabs} />
        <span className={cx('truncate', (e.type === 'error' || e.type === 'request-failed') && 'text-red-700')} title={e.summary}>
          {e.summary}
        </span>
      </div>
    ),
    [tabs],
  );

  const selected = sel != null ? bundle.timeline[Number(sel)] : undefined;
  const target = selected ? refTarget(bundle, selected) : undefined;

  return (
    <>
      <Toolbar>
        <Search value={q} onChange={setQ} />
        {TL_GROUPS.map((g) => (
          <Chip key={g.id} active={!groupOff(g)} onClick={() => toggle(g)} title={g.types.join(', ')}>
            {g.label} <span className="opacity-60">{g.types.reduce((n, t) => n + (counts[t] ?? 0), 0)}</span>
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-gray-200" />
        <Chip active={onlyProblems} onClick={() => setOnlyProblems(!onlyProblems)}>
          Problems only
        </Chip>
        <Chip active={!hidden.has('snapshot')} onClick={() => setHidden((h) => toggleOne(h, 'snapshot'))}>
          Snapshots
        </Chip>
        <Chip active={!hidden.has('scroll')} onClick={() => setHidden((h) => toggleOne(h, 'scroll'))}>
          Scrolls
        </Chip>
      </Toolbar>
      <RowList
        items={items}
        getKey={keyOf}
        render={render}
        selectedKey={sel}
        onSelect={(e) => {
          setSel(keyOf(e));
          seek(e.t, e.tabId);
        }}
        clock={clock}
        follow={follow}
        empty="No timeline entries match."
      />
      {selected && (
        <Detail title={selected.summary} onClose={() => setSel(undefined)}>
          {target && (
            <div className="px-2 pt-2">
              <button className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-100" onClick={() => open(target.panel, target.key)}>
                Open in {target.label} →
              </button>
            </div>
          )}
          <pre className="p-2 font-mono text-xs whitespace-pre-wrap">{JSON.stringify(selected, null, 2)}</pre>
        </Detail>
      )}
    </>
  );
}

function toggleOne(set: Set<string>, v: string) {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

function refTarget(bundle: Bundle, e: TimelineEntry): { panel: PanelId; key: string; label: string } | undefined {
  const ref = e.ref as Record<string, unknown> | undefined;
  if (!ref) return;
  if (ref.file === 'network.json') return { panel: 'network', key: String(ref.requestId), label: 'Network' };
  if (ref.file === 'console.json') return { panel: 'console', key: String(ref.index), label: 'Console' };
  if (ref.file === 'transcript.json') return { panel: 'transcript', key: String(ref.segment), label: 'Transcript' };
  if (ref.file === 'websockets.json') {
    const key = ref.frame != null ? `${ref.socketId}:${ref.frame}` : `${ref.socketId}:`;
    return { panel: 'websockets', key, label: 'WebSockets' };
  }
  return undefined;
}

// ---------------------------------------------------------------- Network

const NET_TYPES: { id: string; label: string; match: (r: RequestOut) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'xhr', label: 'Fetch/XHR', match: (r) => r.resourceType === 'Fetch' || r.resourceType === 'XHR' },
  { id: 'doc', label: 'Doc', match: (r) => r.resourceType === 'Document' },
  { id: 'js', label: 'JS', match: (r) => r.resourceType === 'Script' },
  { id: 'css', label: 'CSS', match: (r) => r.resourceType === 'Stylesheet' },
  { id: 'img', label: 'Img', match: (r) => r.resourceType === 'Image' },
  { id: 'font', label: 'Font', match: (r) => r.resourceType === 'Font' },
  {
    id: 'other',
    label: 'Other',
    match: (r) => !['Fetch', 'XHR', 'Document', 'Script', 'Stylesheet', 'Image', 'Font'].includes(r.resourceType ?? ''),
  },
];

export function NetworkPanel({ bundle, tabs, clock, follow, seek, focus }: Props) {
  const [type, setType] = useState('all');
  const [failedOnly, setFailedOnly] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useSelection('network', focus);
  const [tab, setTab] = useState<'headers' | 'payload' | 'response'>('headers');

  const match = NET_TYPES.find((t) => t.id === type)!.match;
  const items = useMemo(
    () => bundle.network.filter((r) => match(r) && (!failedOnly || r.failed) && includes(r.url, q)),
    [bundle, match, failedOnly, q],
  );
  const failedCount = useMemo(() => bundle.network.filter((r) => r.failed).length, [bundle]);

  const render = useCallback(
    (r: RequestOut) => (
      <div className={cx('flex items-center gap-2 px-2 py-px font-mono', r.failed && 'text-red-700')}>
        <Time t={r.t} />
        <span className="w-12 shrink-0">{r.method}</span>
        <span className={cx('w-10 shrink-0 tabular-nums', !r.failed && 'text-gray-600')} title={r.statusText ?? r.errorText}>
          {r.status ?? (r.errorText ? (r.errorText.startsWith('canceled') ? '(canc)' : '(fail)') : r.endT == null ? '…' : '')}
        </span>
        <TabBadge tabId={r.tabId} tabs={tabs} />
        <span className="min-w-0 flex-1 truncate" title={r.url}>
          {urlName(r.url)}
        </span>
        <span className="w-16 shrink-0 truncate text-gray-500">{r.resourceType}</span>
        <span className="w-14 shrink-0 text-right text-gray-500 tabular-nums">{formatMs(r.durationMs)}</span>
      </div>
    ),
    [tabs],
  );
  const header = (
    <div className="flex gap-2 px-2 py-0.5 text-[11px] text-gray-500">
      <span className="w-14 shrink-0">Time</span>
      <span className="w-12 shrink-0">Method</span>
      <span className="w-10 shrink-0">Status</span>
      <span className="flex-1">Name</span>
      <span className="w-16 shrink-0">Type</span>
      <span className="w-14 shrink-0 text-right">Duration</span>
    </div>
  );

  const r = sel != null ? bundle.network.find((x) => x.id === sel) : undefined;

  return (
    <>
      <Toolbar>
        <Search value={q} onChange={setQ} placeholder="Filter URL" />
        {NET_TYPES.map((t) => (
          <Chip key={t.id} active={type === t.id} onClick={() => setType(t.id)}>
            {t.label}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-gray-200" />
        <Chip active={failedOnly} onClick={() => setFailedOnly(!failedOnly)}>
          Failed <span className="opacity-60">{failedCount}</span>
        </Chip>
      </Toolbar>
      <RowList
        items={items}
        getKey={(x) => x.id}
        render={render}
        header={header}
        selectedKey={sel}
        onSelect={(x) => {
          setSel(x.id);
          seek(x.t, x.tabId);
        }}
        clock={clock}
        follow={follow}
        empty="No requests match."
      />
      {r && (
        <Detail title={<span className="font-mono">{r.method} {r.url}</span>} onClose={() => setSel(undefined)}>
          <SubTabs
            tabs={[
              ['headers', 'Headers'],
              ['payload', 'Payload'],
              ['response', 'Response'],
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'headers' && (
            <>
              <Section title="General">
                <KeyValues
                  entries={[
                    ['URL', r.url],
                    ['Method', r.method],
                    ['Status', r.status != null ? `${r.status} ${r.statusText ?? ''}` : undefined],
                    ['Error', r.errorText && <span className="text-red-700">{r.errorText}</span>],
                    ['Type', r.resourceType],
                    ['MIME', r.mimeType],
                    ['Started', formatTime(r.t)],
                    ['Duration', r.durationMs != null ? formatMs(r.durationMs) : 'unfinished at Stop'],
                    ['Request id', r.id],
                  ]}
                />
              </Section>
              <Section title="Response headers">
                <KeyValues entries={Object.entries(r.responseHeaders ?? {})} />
              </Section>
              <Section title="Request headers">
                <KeyValues entries={Object.entries(r.requestHeaders ?? {})} />
              </Section>
            </>
          )}
          {tab === 'payload' && (
            <Body
              key={`${r.id}-req`}
              {...bodyProps(r.requestBody, r.requestBodyEncoding)}
              note={
                r.requestBody === undefined
                  ? 'No request body.'
                  : r.requestBodyTruncated
                    ? `Cut at 1 MB during capture (was ${formatBytes(r.requestBodySize)}).`
                    : undefined
              }
            />
          )}
          {tab === 'response' && (
            <Body
              key={`${r.id}-res`}
              {...bodyProps(r.responseBody, r.responseBodyEncoding)}
              mime={r.mimeType}
              note={
                r.responseBodyNotKept
                  ? `Body not kept: ${r.responseBodyNotKept}${r.responseBodySize !== undefined ? ` (${formatBytes(r.responseBodySize)})` : ''}.`
                  : r.responseBodyTruncated
                    ? `Cut at 1 MB during capture (was ${formatBytes(r.responseBodySize)}).`
                    : r.responseBody === undefined
                      ? 'No body (none sent, or Chrome did not keep it).'
                      : undefined
              }
            />
          )}
        </Detail>
      )}
    </>
  );
}

// ---------------------------------------------------------------- WebSockets

type FrameRow = FrameOut & { socket: SocketOut; key: string };

export function WebSocketsPanel({ bundle, tabs, clock, follow, seek, focus }: Props) {
  const sockets = bundle.websockets;
  const [socketId, setSocketId] = useState<string | undefined>(sockets[0]?.id);
  const [dir, setDir] = useState<'all' | 'sent' | 'received'>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useSelection('websockets', focus);

  // Focus keys are `<socketId>:<frameIndex>` (frame index empty for the socket itself).
  useEffect(() => {
    if (focus?.panel !== 'websockets') return;
    const [sid] = focus.key.split(':');
    setSocketId(sid);
    setDir('all');
    setQ('');
  }, [focus]);

  const socket = sockets.find((s) => s.id === socketId);
  const items = useMemo<FrameRow[]>(() => {
    const src = socket ? [socket] : sockets;
    return src
      .flatMap((s) => s.frames.map((f) => ({ ...f, socket: s, key: `${s.id}:${f.index}` })))
      .filter((f) => (dir === 'all' || f.direction === dir) && includes(f.payload ?? f.payloadFile, q))
      .sort((a, b) => a.t - b.t);
  }, [socket, sockets, dir, q]);

  const render = useCallback(
    (f: FrameRow) => (
      <div className="flex items-center gap-2 px-2 py-px font-mono">
        <Time t={f.t} />
        <span className={cx('w-3 shrink-0 font-bold', f.direction === 'sent' ? 'text-green-700' : 'text-red-600')} title={f.direction}>
          {f.direction === 'sent' ? '↑' : '↓'}
        </span>
        {!socket && <span className="w-24 shrink-0 truncate text-gray-500">{urlName(f.socket.url)}</span>}
        <span className="min-w-0 flex-1 truncate">
          {f.payload ?? <span className="text-gray-500">{f.opcode === 2 ? `<binary ${formatBytes(f.size)}>` : f.payloadFile}</span>}
        </span>
        <span className="w-14 shrink-0 text-right text-gray-500">{formatBytes(f.size)}</span>
      </div>
    ),
    [socket],
  );

  const [selSocket, selFrame] = sel?.split(':') ?? [];
  const frame = selFrame ? sockets.find((s) => s.id === selSocket)?.frames[Number(selFrame)] : undefined;
  const showSocket = sel != null && !selFrame ? sockets.find((s) => s.id === selSocket) : undefined;

  if (!sockets.length) return <div className="p-4 text-center text-gray-400">No WebSockets in this session.</div>;

  return (
    <>
      <div className="max-h-[30%] shrink-0 overflow-auto border-b border-gray-200">
        {sockets.map((s) => (
          <div
            key={s.id}
            onClick={() => {
              setSocketId(s.id === socketId ? undefined : s.id);
              setSel(`${s.id}:`);
              seek(s.t, s.tabId);
            }}
            className={cx('flex cursor-default items-center gap-2 border-b border-gray-100 px-2 py-0.5 font-mono hover:bg-gray-50', s.id === socketId && 'bg-blue-50')}
          >
            <Time t={s.t} />
            <span className="w-8 shrink-0 text-gray-600">{s.status ?? '…'}</span>
            <TabBadge tabId={s.tabId} tabs={tabs} />
            <span className="min-w-0 flex-1 truncate" title={s.url}>
              {s.url}
            </span>
            <span className="shrink-0 text-gray-500">
              <span className="text-green-700">↑{s.sentCount}</span> <span className="text-red-600">↓{s.receivedCount}</span>
            </span>
            <span className="w-14 shrink-0 text-right text-gray-500">{s.endT != null ? formatMs(s.durationMs) : 'open'}</span>
          </div>
        ))}
      </div>
      <Toolbar>
        <Search value={q} onChange={setQ} placeholder="Filter payload" />
        <Chip active={dir === 'all'} onClick={() => setDir('all')}>All</Chip>
        <Chip active={dir === 'sent'} onClick={() => setDir('sent')}>↑ Sent</Chip>
        <Chip active={dir === 'received'} onClick={() => setDir('received')}>↓ Received</Chip>
        <span className="ml-auto text-gray-500">{socket ? urlName(socket.url) : 'All sockets'}</span>
      </Toolbar>
      <RowList
        items={items}
        getKey={(f) => f.key}
        render={render}
        selectedKey={sel}
        onSelect={(f) => {
          setSel(f.key);
          seek(f.t, f.socket.tabId);
        }}
        clock={clock}
        follow={follow}
        empty="No frames."
      />
      {frame && (
        <Detail
          title={`${frame.direction === 'sent' ? '↑ Sent' : '↓ Received'} · frame ${frame.index} · ${formatTime(frame.t)} · ${formatBytes(frame.size)}`}
          onClose={() => setSel(undefined)}
        >
          <Body
            key={sel}
            text={frame.payload}
            file={frame.payloadFile}
            bytes={frame.payloadFile ? () => bundle.file(frame.payloadFile!) : undefined}
            binary={frame.opcode === 2}
            note={frame.truncated ? 'Cut at 256 KB during capture.' : undefined}
          />
        </Detail>
      )}
      {showSocket && (
        <Detail title={showSocket.url} onClose={() => setSel(undefined)}>
          <Section title="General">
            <KeyValues
              entries={[
                ['URL', showSocket.url],
                ['Status', showSocket.status],
                ['Opened', formatTime(showSocket.t)],
                ['Closed', showSocket.endT != null ? formatTime(showSocket.endT) : 'still open at Stop'],
                ['Frames', `${showSocket.frameCount} (${showSocket.sentCount} sent, ${showSocket.receivedCount} received)`],
                ['Socket id', showSocket.id],
              ]}
            />
          </Section>
          <Section title="Response headers">
            <KeyValues entries={Object.entries(showSocket.responseHeaders ?? {})} />
          </Section>
          <Section title="Request headers">
            <KeyValues entries={Object.entries(showSocket.requestHeaders ?? {})} />
          </Section>
        </Detail>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Console

const LEVELS: { id: string; label: string; match: (c: ConsoleOut) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'error', label: 'Errors', match: (c) => c.level === 'error' },
  { id: 'warn', label: 'Warnings', match: (c) => c.level === 'warn' },
  { id: 'info', label: 'Info', match: (c) => c.level === 'info' },
  { id: 'log', label: 'Logs', match: (c) => c.level === 'log' || c.level === 'debug' },
];

const LEVEL_ROW: Record<string, string> = {
  error: 'bg-red-50/60 text-red-700',
  warn: 'bg-amber-50/60 text-amber-800',
  info: 'text-blue-800',
  debug: 'text-gray-500',
  log: '',
};

export function ConsolePanel({ bundle, tabs, clock, follow, seek, focus }: Props) {
  const [level, setLevel] = useState('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useSelection('console', focus);
  const match = LEVELS.find((l) => l.id === level)!.match;
  const items = useMemo(() => bundle.console.filter((c) => match(c) && includes(c.text, q)), [bundle, match, q]);
  const counts = useMemo(() => Object.fromEntries(LEVELS.map((l) => [l.id, bundle.console.filter(l.match).length])), [bundle]);

  const render = useCallback(
    (c: ConsoleOut, selected: boolean) => (
      <div className={cx('px-2 py-px font-mono', LEVEL_ROW[c.level])}>
        <div className="flex items-start gap-2">
          <Time t={c.t} />
          <span className="w-3 shrink-0">{c.level === 'error' ? '✖' : c.level === 'warn' ? '⚠' : ''}</span>
          <TabBadge tabId={c.tabId} tabs={tabs} />
          <span className={cx('min-w-0 flex-1', selected ? 'break-all whitespace-pre-wrap' : 'truncate')}>
            {c.source === 'exception' && <span className="mr-1 rounded bg-red-200 px-1 text-[10px]">uncaught</span>}
            {c.text}
          </span>
          {c.url && (
            <span className="max-w-40 shrink-0 truncate text-gray-400" title={`${c.url}:${c.line ?? ''}:${c.column ?? ''}`}>
              {urlName(c.url)}
              {c.line != null && `:${c.line}`}
            </span>
          )}
        </div>
        {selected && c.stack && <pre className="mt-0.5 ml-16 text-[11px] whitespace-pre-wrap text-gray-600">{c.stack}</pre>}
      </div>
    ),
    [tabs],
  );

  return (
    <>
      <Toolbar>
        <Search value={q} onChange={setQ} />
        {LEVELS.map((l) => (
          <Chip key={l.id} active={level === l.id} onClick={() => setLevel(l.id)}>
            {l.label} <span className="opacity-60">{counts[l.id]}</span>
          </Chip>
        ))}
      </Toolbar>
      <RowList
        items={items}
        getKey={(c) => String(c.index)}
        render={render}
        selectedKey={sel}
        onSelect={(c) => {
          setSel(sel === String(c.index) ? undefined : String(c.index));
          seek(c.t, c.tabId);
        }}
        clock={clock}
        follow={follow}
        empty="No console entries match."
      />
    </>
  );
}

// ---------------------------------------------------------------- Transcript

export function TranscriptPanel({ bundle, clock, follow, seek, focus }: Props) {
  const { transcript, audio } = bundle;
  const segments = transcript.segments;
  const now = useNow(clock);
  const listRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useSelection('transcript', focus);
  const active = lastAtOrBefore(segments, now);
  const inSegment = active >= 0 && now < segments[active]!.endT + 300;

  useEffect(() => {
    const target = sel != null ? Number(sel) : follow && clock.playing ? active : -1;
    if (target < 0) return;
    listRef.current?.querySelector(`[data-i="${target}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, follow, sel, clock]);

  return (
    <>
      {transcript.status !== 'ok' && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
          Transcript {transcript.status}
          {transcript.note && `: ${transcript.note}`}
          {transcript.errors?.map((e) => (
            <div key={e.chunk}>
              Chunk {e.chunk} at {formatTime(e.t)}: {e.error}
            </div>
          ))}
        </div>
      )}
      <div ref={listRef} className="relative min-h-0 flex-1 overflow-auto">
        {segments.map((s, i) => (
          <div
            key={s.index}
            data-i={i}
            className={cx(
              'flex gap-2 border-b border-l-2 border-gray-100 border-l-transparent px-2 py-1 hover:bg-gray-50',
              i === active && inSegment && 'border-l-amber-500 bg-amber-50',
              sel === String(i) && 'bg-blue-50',
            )}
            onClick={() => {
              setSel(String(i));
              seek(s.t);
            }}
          >
            <button className="w-14 shrink-0 text-left font-mono text-gray-400 tabular-nums hover:text-blue-700" title="Seek here">
              {formatTime(s.t)}
            </button>
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed">
              {s.words.length
                ? s.words.map((w, j) => (
                    <span
                      key={j}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSel(String(i));
                        seek(w.t);
                      }}
                      className={cx('cursor-pointer rounded-sm hover:bg-blue-100', now >= w.t && now < w.endT && 'bg-amber-300')}
                    >
                      {w.word}{' '}
                    </span>
                  ))
                : s.text}
            </p>
          </div>
        ))}
        {!segments.length && (
          <div className="space-y-2 p-4 text-center text-gray-400">
            <div>No transcript segments.</div>
            {audio.length > 0 && (
              <div>
                {audio.length} audio chunk{audio.length > 1 && 's'} in the bundle play with the replay (
                {audio.map((c) => `${formatTime(c.t)}–${formatTime(c.endT ?? c.t)}`).join(', ')}).
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Bundle, ConsoleOut, FrameOut, RequestOut, SegmentOut, SocketOut, TimelineEntry, TimelineRef } from './bundle';
import { lastAtOrBefore } from './playback';
import {
  Body,
  Chip,
  Json,
  Detail,
  FilterMenu,
  KeyValues,
  RowList,
  Search,
  Section,
  SubTabs,
  TabBadge,
  Time,
  Toolbar,
  includes,
  type PanelProps,
} from './ui';
import { formatBytes, formatMs, formatTime, urlName } from '@blook/core/format';
import { BODY_MAX_BYTES } from '@blook/core/body-policy';
import { isCanceled, type TranscriptStatus } from '@blook/core/bundle';
import { Button, cx, tabPanelProps } from '@blook/ui';
import ArrowDownIcon from 'lucide-react/icons/arrow-down';
import ArrowUpIcon from 'lucide-react/icons/arrow-up';
import CircleXIcon from 'lucide-react/icons/circle-x';
import TriangleAlertIcon from 'lucide-react/icons/triangle-alert';
import { KIND, TYPE } from './kinds';

export type PanelId = 'timeline' | 'transcript' | 'network' | 'websockets' | 'console';

/** Body props for an inline network.json body: JSON values back to text, base64 as bytes. */
function bodyProps(body: unknown, encoding?: string): { text?: string; base64?: string } {
  if (body === undefined) return {};
  if (encoding === 'base64') return { base64: String(body) };
  return { text: encoding === 'json' ? JSON.stringify(body) : String(body) };
}

/** A body or payload the capture cut at BODY_MAX_BYTES. */
const cutNote = (size: number | undefined) => `Cut at ${BODY_MAX_BYTES / 1_000_000} MB during capture (was ${formatBytes(size)}).`;

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
    // Esc first closes an open popover (the filter menu), which is still open while the key is dispatched.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector(':popover-open') && setSel(undefined);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  return [sel, setSel] as const;
}

// ---------------------------------------------------------------- Timeline

const TL_GROUPS: { id: string; label: string; title: string }[] = [
  { id: 'nav', label: 'Navigation', title: 'navigation, page-ready, tab-open' },
  { id: 'user', label: 'Clicks and inputs', title: 'click, input' },
  { id: 'api', label: 'API requests', title: 'Fetch, XHR and EventSource requests, and every failed request' },
  { id: 'assets', label: 'Assets', title: 'Documents, scripts, styles, fonts, images and other loads that did not fail' },
  { id: 'ws', label: 'WebSockets', title: 'ws-open, ws-close, ws-frame' },
  { id: 'console', label: 'Console', title: 'console, error' },
  { id: 'speech', label: 'Speech', title: 'speech' },
  { id: 'scroll', label: 'Scrolls', title: 'scroll' },
  { id: 'snapshot', label: 'Snapshots', title: 'snapshot' },
];
// Pages load many assets, which drown the story; failed ones still show under API requests.
const TL_DEFAULT = new Set(TL_GROUPS.map((g) => g.id).filter((id) => !['assets', 'scroll', 'snapshot'].includes(id)));
const API_TYPES = new Set(['Fetch', 'XHR', 'EventSource']);

function groupOf(e: TimelineEntry): string {
  switch (e.type) {
    case 'navigation':
    case 'page-ready':
    case 'tab-open':
      return 'nav';
    case 'click':
    case 'input':
      return 'user';
    case 'request-failed':
      return 'api';
    case 'request': {
      const type = e.resourceType as string | undefined;
      return !type || API_TYPES.has(type) ? 'api' : 'assets';
    }
    case 'ws-open':
    case 'ws-close':
    case 'ws-frame':
      return 'ws';
    case 'console':
    case 'error':
      return 'console';
    default:
      return e.type; // speech, scroll, snapshot
  }
}

export function TimelinePanel({ bundle, tabs, clock, seek, open, focus }: Props) {
  const [shown, setShown] = useState(TL_DEFAULT);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useSelection('timeline', focus);
  const keyOf = useCallback((e: TimelineEntry) => String(bundle.timeline.indexOf(e)), [bundle]);

  const items = useMemo(
    () =>
      bundle.timeline.filter(
        (e) => shown.has(groupOf(e)) && (!onlyProblems || e.type === 'error' || e.type === 'request-failed') && includes(e.summary, q),
      ),
    [bundle, shown, onlyProblems, q],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of bundle.timeline) c[groupOf(e)] = (c[groupOf(e)] ?? 0) + 1;
    return c;
  }, [bundle]);
  const problems = useMemo(() => bundle.timeline.filter((e) => e.type === 'error' || e.type === 'request-failed').length, [bundle]);

  const render = useCallback(
    (e: TimelineEntry) => {
      const type = TYPE[e.type];
      const Icon = type.icon;
      return (
        <div className="flex items-center gap-2 px-2 py-px">
          <Time t={e.t} />
          <span title={type.label} className="flex shrink-0">
            <Icon aria-hidden className={cx('size-3.5', KIND[type.kind].icon)} />
            <span className="sr-only">{type.label}: </span>
          </span>
          <TabBadge tabId={e.tabId} tabs={tabs} />
          <span className={cx('truncate', isProblem(e) && 'text-danger')} title={e.summary}>
            {entryText(e)}
          </span>
        </div>
      );
    },
    [tabs],
  );

  const selected = sel != null ? bundle.timeline[Number(sel)] : undefined;

  return (
    <>
      <Toolbar>
        <Search value={q} onChange={setQ} />
        <Chip active={onlyProblems} onClick={() => setOnlyProblems(!onlyProblems)} title="Errors and failed requests">
          Problems <span className="opacity-70">{problems}</span>
        </Chip>
        <FilterMenu
          options={TL_GROUPS.map((g) => ({ ...g, count: counts[g.id] ?? 0 }))}
          shown={shown}
          onChange={setShown}
          reset={TL_DEFAULT}
        />
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
        label="Timeline"
        empty="No timeline entries match."
      />
      {selected && <TimelineDetail bundle={bundle} entry={selected} onClose={() => setSel(undefined)} open={open} />}
    </>
  );
}

/** A timeline entry's detail: the same view as its own panel for requests and frames, else the entry as JSON. */
function TimelineDetail({
  bundle,
  entry,
  onClose,
  open,
}: {
  bundle: Bundle;
  entry: TimelineEntry;
  onClose: () => void;
  open: Props['open'];
}) {
  const ref = entry.ref;
  const target = ref && refTarget(ref);
  const actions = target && (
    <Button size="sm" onClick={() => open(target.panel, target.key)}>
      Show in {target.label}
    </Button>
  );
  if (ref?.file === 'network.json') {
    const r = bundle.network.find((x) => x.id === ref.requestId);
    if (r) return <RequestDetail r={r} onClose={onClose} actions={actions} />;
  }
  if (ref?.file === 'websockets.json' && ref.frame != null) {
    const frame = bundle.websockets.find((s) => s.id === ref.socketId)?.frames[ref.frame];
    if (frame) return <FrameDetail key={`${ref.socketId}:${ref.frame}`} frame={frame} onClose={onClose} actions={actions} />;
  }
  return <EntryDetail bundle={bundle} entry={entry} onClose={onClose} actions={actions} />;
}

const isProblem = (e: TimelineEntry) => e.type === 'error' || e.type === 'request-failed';

/** The summary as the list shows it: a speech row drops the bundle's speaker glyph, the icon says it. */
const entryText = (e: TimelineEntry) => (e.type === 'speech' ? e.summary.replace(/^🗣\uFE0F?\s*/u, '') : e.summary);

/** Any other entry, in words first: its summary or the console message it points to, then the raw entry. */
function EntryDetail({
  bundle,
  entry,
  onClose,
  actions,
}: {
  bundle: Bundle;
  entry: TimelineEntry;
  onClose: () => void;
  actions?: ReactNode;
}) {
  const type = TYPE[entry.type];
  const ref = entry.ref;
  const c = ref?.file === 'console.json' ? bundle.console.find((x) => x.index === ref.index) : undefined;
  const where = c?.url && `${urlName(c.url)}${c.line != null ? `:${c.line}` : ''}${c.column != null ? `:${c.column}` : ''}`;
  return (
    <Detail
      title={
        <>
          {type.label} <span className="font-normal text-muted tabular-nums">· {formatTime(entry.t)}</span>
        </>
      }
      onClose={onClose}
      actions={actions}
    >
      <div className="space-y-2 px-3 py-2.5">
        <p
          className={cx(
            'leading-relaxed break-words whitespace-pre-wrap',
            c ? 'font-mono' : 'text-sm',
            isProblem(entry) && 'text-danger-strong',
          )}
        >
          {c ? c.text : entryText(entry)}
        </p>
        {where && (
          <p className="text-muted" title={c.url}>
            at <span className="font-mono text-fg">{where}</span>
          </p>
        )}
        {c?.stack && <pre className="font-mono text-2xs whitespace-pre-wrap text-muted">{c.stack}</pre>}
      </div>
      <details className="border-t border-line-soft">
        <summary className="cursor-pointer px-3 py-1.5 text-muted -outline-offset-2 hover:text-fg">Timeline entry (JSON)</summary>
        <Json value={entry} />
      </details>
    </Detail>
  );
}

function refTarget(ref: TimelineRef): { panel: PanelId; key: string; label: string } | undefined {
  switch (ref.file) {
    case 'network.json':
      return { panel: 'network', key: ref.requestId, label: 'Network' };
    case 'console.json':
      return { panel: 'console', key: String(ref.index), label: 'Console' };
    case 'transcript.json':
      return { panel: 'transcript', key: String(ref.segment), label: 'Transcript' };
    case 'websockets.json':
      return { panel: 'websockets', key: `${ref.socketId}:${ref.frame ?? ''}`, label: 'WebSockets' };
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------- Network

const NET_TYPES: { id: string; label: string; match: (r: RequestOut) => boolean }[] = [
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

export function NetworkPanel({ bundle, tabs, clock, seek, focus }: Props) {
  const [types, setTypes] = useState(() => new Set(NET_TYPES.map((t) => t.id)));
  const [failedOnly, setFailedOnly] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useSelection('network', focus);
  const typeOf = useCallback((r: RequestOut) => NET_TYPES.find((t) => t.match(r))!.id, []);
  const items = useMemo(
    () => bundle.network.filter((r) => types.has(typeOf(r)) && (!failedOnly || r.failed) && includes(r.url, q)),
    [bundle, types, typeOf, failedOnly, q],
  );
  const failedCount = useMemo(() => bundle.network.filter((r) => r.failed).length, [bundle]);
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of bundle.network) c[typeOf(r)] = (c[typeOf(r)] ?? 0) + 1;
    return c;
  }, [bundle, typeOf]);

  const render = useCallback(
    (r: RequestOut) => (
      <div className={cx('flex items-center gap-2 px-2 py-px tabular-nums', r.failed && 'text-danger')}>
        <Time t={r.t} />
        <span className="w-12 shrink-0">{r.method}</span>
        <span className={cx('w-10 shrink-0 tabular-nums', !r.failed && 'text-muted')} title={r.statusText ?? r.errorText}>
          {r.status ?? (r.errorText ? (isCanceled(r.errorText) ? '(canc)' : '(fail)') : r.endT == null ? '…' : '')}
        </span>
        <TabBadge tabId={r.tabId} tabs={tabs} />
        <span className="min-w-0 flex-1 truncate" title={r.url}>
          {urlName(r.url)}
        </span>
        <span className="w-16 shrink-0 truncate text-muted">{r.resourceType}</span>
        <span className="w-14 shrink-0 text-right text-muted tabular-nums">{formatMs(r.durationMs)}</span>
      </div>
    ),
    [tabs],
  );
  const header = (
    <div className="flex gap-2 px-2 py-1 text-2xs font-medium text-muted">
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
        <Chip active={failedOnly} onClick={() => setFailedOnly(!failedOnly)}>
          Failed <span className="opacity-70">{failedCount}</span>
        </Chip>
        <FilterMenu options={NET_TYPES.map((t) => ({ ...t, count: typeCounts[t.id] ?? 0 }))} shown={types} onChange={setTypes} />
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
        label="Requests"
        empty="No requests match."
      />
      {r && <RequestDetail r={r} onClose={() => setSel(undefined)} />}
    </>
  );
}

/** A request's headers, payload and response. Shared by the Network and Timeline panels. */
export function RequestDetail({ r, onClose, actions }: { r: RequestOut; onClose: () => void; actions?: ReactNode }) {
  const [tab, setTab] = useState<'headers' | 'payload' | 'response'>('headers');
  const tabsId = useId();
  return (
    <Detail
      title={
        <span className="font-mono">
          {r.method} {r.url}
        </span>
      }
      onClose={onClose}
      actions={actions}
    >
      <SubTabs
        id={tabsId}
        tabs={[
          { id: 'headers', label: 'Headers' },
          { id: 'payload', label: 'Payload' },
          { id: 'response', label: 'Response' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div {...tabPanelProps(tabsId, tab)}>
        {tab === 'headers' && (
          <>
            <Section title="General">
              <KeyValues
                entries={[
                  ['URL', r.url],
                  ['Method', r.method],
                  ['Status', r.status != null ? `${r.status} ${r.statusText ?? ''}` : undefined],
                  [
                    'Error',
                    r.errorText && (
                      <span key="error" className="text-danger">
                        {r.errorText}
                      </span>
                    ),
                  ],
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
            note={r.requestBody === undefined ? 'No request body.' : r.requestBodyTruncated ? cutNote(r.requestBodySize) : undefined}
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
                  ? cutNote(r.responseBodySize)
                  : r.responseBody === undefined
                    ? 'No body (none sent, or Chrome did not keep it).'
                    : undefined
            }
          />
        )}
      </div>
    </Detail>
  );
}

// ---------------------------------------------------------------- WebSockets

type FrameRow = FrameOut & { socket: SocketOut; key: string; text?: string };

function FrameDetail({ frame, onClose, actions }: { frame: FrameOut; onClose: () => void; actions?: ReactNode }) {
  return (
    <Detail
      title={`${frame.direction === 'sent' ? 'Sent' : 'Received'} · frame ${frame.index} · ${formatTime(frame.t)} · ${formatBytes(frame.size)}`}
      onClose={onClose}
      actions={actions}
    >
      <Body {...bodyProps(frame.payload, frame.payloadEncoding)} note={frame.truncated ? cutNote(frame.size) : undefined} />
    </Detail>
  );
}

/** A frame's payload as one line of text for the list and the filter; undefined for binary. */
function frameText(f: FrameOut): string | undefined {
  if (f.payloadEncoding === 'base64') return undefined;
  return f.payloadEncoding === 'json' ? JSON.stringify(f.payload) : String(f.payload);
}

export function WebSocketsPanel({ bundle, tabs, clock, seek, focus }: Props) {
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
      .flatMap((s) => s.frames.map((f) => ({ ...f, socket: s, key: `${s.id}:${f.index}`, text: frameText(f) })))
      .filter((f) => (dir === 'all' || f.direction === dir) && includes(f.text, q))
      .sort((a, b) => a.t - b.t);
  }, [socket, sockets, dir, q]);

  const render = useCallback(
    (f: FrameRow) => (
      <div className="flex items-center gap-2 px-2 py-px">
        <Time t={f.t} />
        <span className={cx('flex shrink-0', f.direction === 'sent' ? 'text-ok' : 'text-accent')} title={f.direction}>
          {f.direction === 'sent' ? <ArrowUpIcon aria-hidden className="size-3.5" /> : <ArrowDownIcon aria-hidden className="size-3.5" />}
          <span className="sr-only">{f.direction}</span>
        </span>
        {!socket && <span className="w-24 shrink-0 truncate text-muted">{urlName(f.socket.url)}</span>}
        <span className="min-w-0 flex-1 truncate font-mono">
          {f.text ?? <span className="text-muted">{`<binary ${formatBytes(f.size)}>`}</span>}
        </span>
        <span className="w-14 shrink-0 text-right text-muted tabular-nums">{formatBytes(f.size)}</span>
      </div>
    ),
    [socket],
  );

  const [selSocket, selFrame] = sel?.split(':') ?? [];
  const frame = selFrame ? sockets.find((s) => s.id === selSocket)?.frames[Number(selFrame)] : undefined;
  const showSocket = sel != null && !selFrame ? sockets.find((s) => s.id === selSocket) : undefined;

  if (!sockets.length) return <div className="p-4 text-center text-muted">No WebSockets in this session.</div>;

  return (
    <>
      <div className="max-h-[30%] shrink-0 overflow-auto border-b border-line">
        {sockets.map((s) => (
          <button
            type="button"
            key={s.id}
            aria-pressed={s.id === socketId}
            title="Show this socket's frames and details"
            onClick={() => {
              setSocketId(s.id === socketId ? undefined : s.id);
              setSel(`${s.id}:`);
              seek(s.t, s.tabId);
            }}
            className={cx(
              'flex w-full cursor-default items-center gap-2 border-b border-line-soft px-2 py-0.5 text-left tabular-nums -outline-offset-2 hover:bg-surface-muted',
              s.id === socketId && 'bg-accent-soft',
            )}
          >
            <Time t={s.t} />
            <span className="w-8 shrink-0 text-muted">{s.status ?? '…'}</span>
            <TabBadge tabId={s.tabId} tabs={tabs} />
            <span className="min-w-0 flex-1 truncate" title={s.url}>
              {s.url}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-muted" title={`${s.sentCount} sent, ${s.receivedCount} received`}>
              <span className="flex items-center text-ok">
                <ArrowUpIcon aria-hidden className="size-3" />
                {s.sentCount}
              </span>
              <span className="flex items-center text-accent">
                <ArrowDownIcon aria-hidden className="size-3" />
                {s.receivedCount}
              </span>
            </span>
            <span className="w-14 shrink-0 text-right text-muted">{s.endT != null ? formatMs(s.durationMs) : 'open'}</span>
          </button>
        ))}
      </div>
      <Toolbar>
        <Search value={q} onChange={setQ} placeholder="Filter payload" />
        <Chip active={dir === 'all'} onClick={() => setDir('all')}>
          All
        </Chip>
        <Chip active={dir === 'sent'} onClick={() => setDir('sent')}>
          <ArrowUpIcon aria-hidden className="size-3" />
          Sent
        </Chip>
        <Chip active={dir === 'received'} onClick={() => setDir('received')}>
          <ArrowDownIcon aria-hidden className="size-3" />
          Received
        </Chip>
        <span className="ml-auto text-muted">{socket ? urlName(socket.url) : 'All sockets'}</span>
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
        label="Frames"
        empty="No frames."
      />
      {frame && <FrameDetail key={sel} frame={frame} onClose={() => setSel(undefined)} />}
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
  { id: 'error', label: 'Errors', match: (c) => c.level === 'error' },
  { id: 'warn', label: 'Warnings', match: (c) => c.level === 'warn' },
  { id: 'info', label: 'Info', match: (c) => c.level === 'info' },
  { id: 'log', label: 'Logs', match: (c) => c.level === 'log' || c.level === 'debug' },
];

const LEVEL_ROW: Record<string, string> = {
  error: 'bg-danger-soft text-danger-strong',
  warn: 'bg-warn-soft text-warn',
  info: 'text-sky-800',
  debug: 'text-muted',
  log: '',
};

export function ConsolePanel({ bundle, tabs, clock, seek, focus }: Props) {
  const [levels, setLevels] = useState(() => new Set(LEVELS.map((l) => l.id)));
  const [q, setQ] = useState('');
  const [sel, setSel] = useSelection('console', focus);
  const items = useMemo(
    () => bundle.console.filter((c) => LEVELS.some((l) => levels.has(l.id) && l.match(c)) && includes(c.text, q)),
    [bundle, levels, q],
  );
  const counts = useMemo(() => Object.fromEntries(LEVELS.map((l) => [l.id, bundle.console.filter(l.match).length])), [bundle]);

  const render = useCallback(
    (c: ConsoleOut, selected: boolean) => (
      <div className={cx('px-2 py-px', LEVEL_ROW[c.level])}>
        <div className="flex items-start gap-2">
          <Time t={c.t} />
          <span className="flex h-4 w-3.5 shrink-0 items-center">
            {c.level === 'error' ? (
              <CircleXIcon aria-label="Error" className="size-3.5" />
            ) : c.level === 'warn' ? (
              <TriangleAlertIcon aria-label="Warning" className="size-3.5" />
            ) : null}
          </span>
          <TabBadge tabId={c.tabId} tabs={tabs} />
          <span className={cx('min-w-0 flex-1 font-mono', selected ? 'break-all whitespace-pre-wrap' : 'truncate')}>
            {c.source === 'exception' && (
              <span className="mr-1 rounded-full bg-red-100 px-1.5 font-sans text-2xs font-medium">uncaught</span>
            )}
            {c.text}
          </span>
          {c.url && (
            <span className="max-w-40 shrink-0 truncate text-muted" title={`${c.url}:${c.line ?? ''}:${c.column ?? ''}`}>
              {urlName(c.url)}
              {c.line != null && `:${c.line}`}
            </span>
          )}
        </div>
        {selected && c.stack && <pre className="mt-0.5 ml-16 font-mono text-2xs whitespace-pre-wrap text-muted">{c.stack}</pre>}
      </div>
    ),
    [tabs],
  );

  return (
    <>
      <Toolbar>
        <Search value={q} onChange={setQ} />
        <Chip
          active={levels.size === 1 && levels.has('error')}
          onClick={() => setLevels(levels.size === 1 && levels.has('error') ? new Set(LEVELS.map((l) => l.id)) : new Set(['error']))}
        >
          Errors <span className="opacity-70">{counts.error}</span>
        </Chip>
        <FilterMenu options={LEVELS.map((l) => ({ ...l, count: counts[l.id] }))} shown={levels} onChange={setLevels} />
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
        label="Console messages"
        empty="No console entries match."
      />
    </>
  );
}

// ---------------------------------------------------------------- Transcript

const TRANSCRIPT_STATUS: Record<Exclude<TranscriptStatus, 'ok'>, string> = {
  partial: 'Transcript incomplete',
  pending: 'Transcript not finished',
  none: 'No transcript',
  skipped: 'Transcription skipped',
  failed: 'Transcription failed',
};

export function TranscriptPanel({ bundle, clock, seek, focus }: Props) {
  const { transcript, audio } = bundle;
  const segments = transcript.segments;
  const listRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useSelection('transcript', focus);

  // The word at the playhead gets `data-now`, set on the DOM each tick so the rows don't re-render.
  useEffect(() => {
    let at = '';
    let marked: Element | null | undefined;
    const mark = () => {
      const now = clock.now();
      const i = lastAtOrBefore(segments, now);
      const words = segments[i]?.words ?? [];
      const w = lastAtOrBefore(words, now);
      const next = w >= 0 && now < words[w]!.endT ? `${i}:${w}` : '';
      if (next === at) return;
      at = next;
      marked?.removeAttribute('data-now');
      marked = next ? listRef.current?.querySelector(`[data-i="${i}"] [data-w="${w}"]`) : undefined;
      marked?.setAttribute('data-now', '');
    };
    mark();
    return clock.onTick(mark);
  }, [clock, segments]);

  const render = useCallback(
    (s: SegmentOut) => (
      <div className="flex gap-2 px-2 py-1">
        <Time t={s.t} />
        <p className="min-w-0 flex-1 text-sm leading-relaxed">
          {s.words.length
            ? s.words.map((w, j) => (
                // A click on a word seeks to it; the keyboard selects whole segments.
                // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
                <span
                  key={j}
                  data-w={j}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSel(String(s.index));
                    seek(w.t);
                  }}
                  className="cursor-pointer rounded-sm hover:bg-accent-soft data-now:bg-playhead/40"
                >
                  {w.word}{' '}
                </span>
              ))
            : s.text}
        </p>
      </div>
    ),
    [seek, setSel],
  );

  return (
    <>
      {transcript.status !== 'ok' && (
        <div
          className={cx(
            'shrink-0 border-b border-line px-2 py-1.5',
            transcript.status === 'none' || transcript.status === 'skipped' ? 'bg-surface-muted text-muted' : 'bg-warn-soft text-warn',
          )}
        >
          {TRANSCRIPT_STATUS[transcript.status]}
          {/* Some notes repeat the status ("skipped: no OpenRouter API key set"). */}
          {transcript.note &&
            `: ${transcript.note.startsWith(`${transcript.status}: `) ? transcript.note.slice(transcript.status.length + 2) : transcript.note}`}
          {transcript.errors?.map((e) => (
            <div key={e.chunk}>
              Chunk {e.chunk} at {formatTime(e.t)}: {e.error}
            </div>
          ))}
        </div>
      )}
      {transcript.source && (
        <div
          className="shrink-0 border-b border-line bg-surface-muted px-2 py-1.5 text-muted"
          title={`${transcript.source.at}, Blook ${transcript.source.blookVersion}`}
        >
          {transcript.source.method} {transcript.source.model}, by the {transcript.source.by}
        </div>
      )}
      <RowList
        ref={listRef}
        items={segments}
        getKey={(s) => String(s.index)}
        render={render}
        selectedKey={sel}
        onSelect={(s) => {
          setSel(String(s.index));
          seek(s.t);
        }}
        clock={clock}
        label="Transcript"
        empty={
          <div className="space-y-2">
            <div>No speech in this recording.</div>
            {audio.length > 0 && (
              <div>
                {audio.length} audio chunk{audio.length > 1 && 's'} in the bundle play with the replay (
                {audio.map((c) => `${formatTime(c.t)}–${formatTime(c.endT ?? c.t)}`).join(', ')}).
              </div>
            )}
          </div>
        }
      />
    </>
  );
}

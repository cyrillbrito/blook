import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import type { Clock } from './playback';
import { lastAtOrBefore } from './playback';
import { formatBytes, formatTime } from '@blook/core/format';
import { Button, cx, IconButton, Input, Tabs, Toggle, type TabItem } from '@blook/ui';
import ChevronDownIcon from 'lucide-react/icons/chevron-down';
import ListFilterIcon from 'lucide-react/icons/list-filter';
import SearchIcon from 'lucide-react/icons/search';
import XIcon from 'lucide-react/icons/x';
import { prettyJson, useActiveRow, useNow } from './util';

export interface PanelProps {
  clock: Clock;
  /** Seek, and switch to `tabId`'s replay when given. */
  seek: (t: number, tabId?: number) => void;
}

/**
 * A t-sorted list where the row at the playhead gets `data-active`. A listbox: clicks and the arrow keys
 * (Home, End) select, and selecting seeks. Rows are built once per items/selection change, so playback
 * doesn't re-render them. `ref` is the scrolling element.
 */
export function RowList<T extends { t: number }>({
  items,
  getKey,
  render,
  selectedKey,
  onSelect,
  clock,
  label,
  header,
  empty = 'Nothing here.',
  ref,
}: {
  items: T[];
  getKey: (item: T) => string;
  render: (item: T, selected: boolean) => ReactNode;
  selectedKey?: string;
  onSelect: (item: T) => void;
  clock: Clock;
  /** The listbox's accessible name. */
  label: string;
  header?: ReactNode;
  empty?: ReactNode;
  ref?: RefObject<HTMLDivElement | null>;
}) {
  const ownRef = useRef<HTMLDivElement>(null);
  const listRef = ref ?? ownRef;
  const id = useId();
  const now = useNow(clock);
  // Lists follow the playhead while playing.
  useActiveRow(listRef, lastAtOrBefore(items, now), clock.playing);
  const selIndex = useMemo(
    () => (selectedKey == null ? -1 : items.findIndex((it) => getKey(it) === selectedKey)),
    [items, selectedKey, getKey],
  );

  const rows = useMemo(
    () =>
      items.map((item, i) => {
        const selected = i === selIndex;
        return (
          // Options aren't focusable: the listbox holds focus and points at the selection (aria-activedescendant).
          // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
          <div
            key={getKey(item)}
            id={`${id}-${i}`}
            role="option"
            aria-selected={selected}
            data-i={i}
            onClick={() => onSelect(item)}
            className={cx(
              'cursor-default border-b border-line-soft border-l-2 border-l-transparent hover:bg-surface-muted data-active:border-l-playhead data-active:bg-playhead-soft',
              selected && 'bg-accent-soft! hover:bg-accent-soft',
            )}
          >
            {render(item, selected)}
          </div>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, selIndex, render],
  );

  // Bring the selection into view: after arrow keys, or when set from elsewhere (e.g. "Show in Network").
  useEffect(() => {
    if (selIndex >= 0) listRef.current?.querySelector(`[data-i="${selIndex}"]`)?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selIndex]);

  const onKeyDown = (e: KeyboardEvent) => {
    // Without a selection, the arrows start from the row at the playhead.
    const from = selIndex >= 0 ? selIndex : lastAtOrBefore(items, clock.now());
    const to = { ArrowDown: from + 1, ArrowUp: from - 1, Home: 0, End: items.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const i = Math.max(0, Math.min(items.length - 1, to));
    if (i !== selIndex) onSelect(items[i]!);
  };

  return (
    <div ref={listRef} className={cx('relative min-h-0 flex-1 overflow-auto', header ? 'scroll-pt-7' : undefined)}>
      {header && <div className="sticky top-0 z-10 border-b border-line bg-surface-muted">{header}</div>}
      {items.length === 0 ? (
        <div className="p-4 text-center text-muted">{empty}</div>
      ) : (
        <div
          role="listbox"
          tabIndex={0}
          aria-label={label}
          aria-activedescendant={selIndex >= 0 ? `${id}-${selIndex}` : undefined}
          onKeyDown={onKeyDown}
          className="-outline-offset-2"
        >
          {rows}
        </div>
      )}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-surface-muted px-2 py-1.5">{children}</div>;
}

export function Search({
  value,
  onChange,
  placeholder = 'Filter',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative flex min-w-32 flex-1">
      <SearchIcon className="pointer-events-none absolute top-2 left-2 h-3 w-3 text-muted" />
      <Input
        type="search"
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-6"
      />
    </div>
  );
}

export interface FilterOption {
  id: string;
  label: string;
  count?: number;
  title?: string;
}

/** A "Filter" button with a checklist of what the list shows. `shown` holds the checked ids. */
export function FilterMenu({
  options,
  shown,
  onChange,
  reset,
}: {
  options: FilterOption[];
  shown: Set<string>;
  onChange: (shown: Set<string>) => void;
  /** The default selection, offered as "Reset" when it differs from `shown`. */
  reset?: Set<string>;
}) {
  const id = useId();
  const on = options.filter((o) => shown.has(o.id)).length;
  const toggle = (id: string) => {
    const next = new Set(shown);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const isReset = !reset || (reset.size === shown.size && [...reset].every((id) => shown.has(id)));
  const link = 'cursor-pointer hover:text-fg';

  // A native popover: light dismiss and Esc for free, and the invoker is its anchor.
  return (
    <>
      <Button size="sm" popoverTarget={id}>
        <ListFilterIcon className="h-3 w-3 text-muted" />
        Filter
        <span className="font-normal text-muted tabular-nums">
          {on}/{options.length}
        </span>
        <ChevronDownIcon className="h-3 w-3 text-muted" />
      </Button>
      <div
        id={id}
        popover="auto"
        className="inset-auto m-0 mt-1 w-56 rounded-card border border-line-strong bg-surface px-0 py-1 text-xs text-fg shadow-lg [position-area:block-end_span-inline-start] [position-try-fallbacks:flip-block]"
      >
        <fieldset>
          <legend className="sr-only">Show</legend>
          {options.map((o) => (
            <label key={o.id} title={o.title} className="flex h-control cursor-pointer items-center gap-2 px-2 hover:bg-surface-muted">
              <input type="checkbox" checked={shown.has(o.id)} onChange={() => toggle(o.id)} className="accent-accent" />
              <span className="flex-1">{o.label}</span>
              {o.count != null && <span className="text-muted tabular-nums">{o.count}</span>}
            </label>
          ))}
        </fieldset>
        <div className="mt-1 flex gap-3 border-t border-line px-2 pt-1.5 pb-0.5 text-muted">
          <button type="button" className={link} onClick={() => onChange(new Set(options.map((o) => o.id)))}>
            All
          </button>
          <button type="button" className={link} onClick={() => onChange(new Set())}>
            None
          </button>
          {reset && !isReset && (
            <button type="button" className={cx('ml-auto', link)} onClick={() => onChange(new Set(reset))}>
              Reset
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <Toggle pressed={active} onClick={onClick} title={title}>
      {children}
    </Toggle>
  );
}

export function Time({ t }: { t: number }) {
  return <span className="w-14 shrink-0 tabular-nums text-muted">{formatTime(t)}</span>;
}

export function Detail({
  title,
  onClose,
  actions,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  /** Buttons next to Close. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-[48%] min-h-32 shrink-0 flex-col border-t border-line-strong bg-surface">
      <div className="flex items-center gap-2 border-b border-line bg-surface-muted px-2 py-1.5">
        <div className="min-w-0 flex-1 truncate font-medium">{title}</div>
        {actions}
        <IconButton label="Close (Esc)" onClick={onClose}>
          <XIcon className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

export function SubTabs<K extends string>({
  id,
  tabs,
  value,
  onChange,
}: {
  id: string;
  tabs: TabItem<K>[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <Tabs
      id={id}
      tabs={tabs}
      value={value}
      onChange={onChange}
      className="sticky top-0 flex h-8 items-stretch gap-0.5 border-b border-line bg-surface px-1"
    />
  );
}

export function KeyValues({ entries }: { entries: [string, ReactNode][] }) {
  const shown = entries.filter(([, v]) => v !== undefined && v !== '' && v !== null);
  if (!shown.length) return <div className="px-2 py-1 text-muted">None</div>;
  return (
    <table className="w-full text-xs">
      <tbody>
        {shown.map(([k, v], i) => (
          <tr key={`${k}-${i}`} className="align-top">
            <td className="w-1/3 py-px pr-2 pl-2 break-all text-muted">{k}</td>
            <td className="py-px pr-2 font-mono break-all whitespace-pre-wrap">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line-soft py-1">
      <h4 className="px-2 py-0.5 text-2xs font-semibold text-fg">{title}</h4>
      {children}
    </section>
  );
}

const SHOW_MAX = 200_000;

/** A body or payload: inline text, or base64 for binary. Pretty-prints JSON. */
export function Body({
  text,
  base64,
  mime,
  note,
}: {
  text?: string;
  /** Inline binary body. */
  base64?: string;
  mime?: string;
  note?: ReactNode;
}) {
  const [all, setAll] = useState(false);
  const [raw, setRaw] = useState(false);
  const binary = base64 !== undefined;
  const data = useMemo(() => (base64 !== undefined ? Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) : undefined), [base64]);
  const isImage = binary && (mime ?? '').startsWith('image/');
  const imgUrl = useMemo(
    () => (isImage && data ? URL.createObjectURL(new Blob([data as BlobPart], { type: mime })) : undefined),
    [isImage, data, mime],
  );
  useEffect(() => () => void (imgUrl && URL.revokeObjectURL(imgUrl)), [imgUrl]);

  const body = text;
  const pretty = useMemo(() => (body !== undefined && !raw ? prettyJson(body) : { text: body ?? '', json: false }), [body, raw]);

  if (text === undefined && base64 === undefined) return <div className="px-2 py-1 text-muted">{note ?? 'No body.'}</div>;
  if (binary) {
    return (
      <div className="space-y-2 p-2">
        <div className="text-muted">Binary, {formatBytes(data?.length)}</div>
        {imgUrl && <img src={imgUrl} alt={`The ${mime} body`} className="max-h-80 max-w-full border border-line" />}
        {note}
      </div>
    );
  }
  const shown = all ? pretty.text : pretty.text.slice(0, SHOW_MAX);
  return (
    <div>
      <div className="flex items-center gap-2 px-2 py-1 text-2xs text-muted">
        <span>{formatBytes(new TextEncoder().encode(body ?? '').length)}</span>
        {(pretty.json || raw) && (
          <button type="button" className="cursor-pointer hover:text-fg" onClick={() => setRaw(!raw)}>
            {raw ? 'Pretty' : 'Raw'}
          </button>
        )}
        <button type="button" className="cursor-pointer hover:text-fg" onClick={() => navigator.clipboard?.writeText(body ?? '')}>
          Copy
        </button>
        {note}
      </div>
      <pre className="px-2 pb-2 font-mono text-xs break-all whitespace-pre-wrap">
        {pretty.json && !raw ? <JsonText text={shown} /> : shown}
      </pre>
      {!all && pretty.text.length > SHOW_MAX && (
        <button type="button" className="mx-2 mb-2 cursor-pointer text-accent hover:underline" onClick={() => setAll(true)}>
          Show all ({formatBytes(pretty.text.length)})
        </button>
      )}
    </div>
  );
}

/** A value as pretty, highlighted JSON. */
export function Json({ value }: { value: unknown }) {
  return (
    <pre className="p-2 font-mono text-xs break-all whitespace-pre-wrap">
      <JsonText text={JSON.stringify(value, null, 2)} />
    </pre>
  );
}

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const HIGHLIGHT_MAX = 100_000; // above this, plain text: a span per token gets slow

/** Colors keys, strings, numbers and literals in JSON text. */
function JsonText({ text }: { text: string }) {
  const parts = useMemo(() => {
    if (text.length > HIGHLIGHT_MAX) return [text];
    const out: ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(JSON_TOKEN)) {
      if (m.index > last) out.push(text.slice(last, m.index));
      const [all, str, colon, lit] = m;
      const cls = str ? (colon ? 'text-sky-800' : 'text-emerald-700') : lit ? 'text-violet-700' : 'text-amber-700';
      out.push(
        <span key={m.index} className={cls}>
          {str ?? all}
        </span>,
      );
      if (colon) out.push(colon);
      last = m.index + all.length;
    }
    out.push(text.slice(last));
    return out;
  }, [text]);
  return <>{parts}</>;
}

/** Small "T2" badge for multi-tab sessions. */
export function TabBadge({ tabId, tabs }: { tabId?: number; tabs: number[] }) {
  if (tabs.length < 2 || tabId == null) return null;
  return <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 text-2xs font-medium text-muted">T{tabs.indexOf(tabId) + 1}</span>;
}

export function includes(hay: string | undefined, needle: string) {
  return !needle || (hay ?? '').toLowerCase().includes(needle.toLowerCase());
}

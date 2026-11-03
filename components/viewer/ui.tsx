import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Clock } from './playback';
import { lastAtOrBefore } from './playback';
import { cx, formatBytes, formatTime, prettyJson, useActiveRow, useNow } from './util';
import { decodeText } from './bundle';

export interface PanelProps {
  clock: Clock;
  follow: boolean;
  /** Seek, and switch to `tabId`'s replay when given. */
  seek: (t: number, tabId?: number) => void;
}

/**
 * A t-sorted list where the row at the playhead gets `data-active` and clicks seek.
 * Rows are built once per items/selection change, so playback doesn't re-render them.
 */
export function RowList<T extends { t: number }>({
  items,
  getKey,
  render,
  selectedKey,
  onSelect,
  clock,
  follow,
  header,
  empty = 'Nothing here.',
}: {
  items: T[];
  getKey: (item: T) => string;
  render: (item: T, selected: boolean) => ReactNode;
  selectedKey?: string;
  onSelect: (item: T) => void;
  clock: Clock;
  follow: boolean;
  header?: ReactNode;
  empty?: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const now = useNow(clock);
  useActiveRow(listRef, lastAtOrBefore(items, now), follow && clock.playing);

  const rows = useMemo(
    () =>
      items.map((item, i) => {
        const key = getKey(item);
        const selected = key === selectedKey;
        return (
          <div
            key={key}
            data-i={i}
            onClick={() => onSelect(item)}
            className={cx(
              'cursor-default border-b border-gray-100 border-l-2 border-l-transparent hover:bg-gray-50 data-active:border-l-amber-500 data-active:bg-amber-50',
              selected && 'bg-blue-50! hover:bg-blue-50',
            )}
          >
            {render(item, selected)}
          </div>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, selectedKey, render],
  );

  // Bring the selection into view when it's set from elsewhere (e.g. "open in Network").
  useEffect(() => {
    if (selectedKey == null) return;
    const i = items.findIndex((it) => getKey(it) === selectedKey);
    listRef.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  return (
    <div ref={listRef} className="relative min-h-0 flex-1 overflow-auto">
      {header && <div className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50">{header}</div>}
      {items.length === 0 ? <div className="p-4 text-center text-gray-400">{empty}</div> : rows}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-gray-200 bg-white px-2 py-1">{children}</div>;
}

export function Search({ value, onChange, placeholder = 'Filter' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-6 w-44 rounded border border-gray-300 px-1.5 text-xs outline-none focus:border-blue-500"
    />
  );
}

export function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cx(
        'h-6 rounded px-1.5 text-xs',
        active ? 'bg-gray-200 font-medium text-gray-900' : 'text-gray-500 hover:bg-gray-100',
      )}
    >
      {children}
    </button>
  );
}

export function Time({ t }: { t: number }) {
  return <span className="w-14 shrink-0 tabular-nums text-gray-400">{formatTime(t)}</span>;
}

/** Bottom detail pane with a title bar and a close button. */
export function Detail({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="flex h-[48%] min-h-32 shrink-0 flex-col border-t-2 border-gray-300 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-2 py-1">
        <div className="min-w-0 flex-1 truncate font-medium">{title}</div>
        <button onClick={onClose} className="rounded px-1 text-gray-500 hover:bg-gray-200" title="Close (Esc)">
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

export function SubTabs<K extends string>({ tabs, value, onChange }: { tabs: [K, string][]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="sticky top-0 flex gap-1 border-b border-gray-200 bg-white px-2">
      {tabs.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={cx('border-b-2 px-1.5 py-1 text-xs', k === value ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function KeyValues({ entries }: { entries: [string, ReactNode][] }) {
  const shown = entries.filter(([, v]) => v !== undefined && v !== '' && v !== null);
  if (!shown.length) return <div className="px-2 py-1 text-gray-400">None</div>;
  return (
    <table className="w-full font-mono text-xs">
      <tbody>
        {shown.map(([k, v], i) => (
          <tr key={`${k}-${i}`} className="align-top">
            <td className="w-1/3 py-px pr-2 pl-2 break-all text-gray-500">{k}</td>
            <td className="py-px pr-2 break-all whitespace-pre-wrap">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-gray-100 py-1">
      <h4 className="px-2 py-0.5 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">{title}</h4>
      {children}
    </section>
  );
}

const SHOW_MAX = 200_000;

/** A body or payload: inline text or base64, or a bundle file decoded only when shown. Pretty-prints JSON. */
export function Body({
  text,
  base64,
  file,
  bytes,
  mime,
  binary: binaryFile,
  note,
}: {
  text?: string;
  /** Inline binary body. */
  base64?: string;
  file?: string;
  bytes?: () => Uint8Array | undefined;
  mime?: string;
  binary?: boolean;
  note?: ReactNode;
}) {
  const [all, setAll] = useState(false);
  const [raw, setRaw] = useState(false);
  const binary = binaryFile || base64 !== undefined;
  const data = useMemo(
    () => (base64 !== undefined ? Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) : text === undefined && file ? bytes?.() : undefined),
    [base64, text, file, bytes],
  );
  const isImage = binary && /^image\//.test(mime ?? '');
  const imgUrl = useMemo(
    () => (isImage && data ? URL.createObjectURL(new Blob([data as BlobPart], { type: mime })) : undefined),
    [isImage, data, mime],
  );
  useEffect(() => () => void (imgUrl && URL.revokeObjectURL(imgUrl)), [imgUrl]);

  const body = text ?? (data && !binary ? decodeText(data) : undefined);
  const pretty = useMemo(() => (body !== undefined && !raw ? prettyJson(body) : { text: body ?? '', json: false }), [body, raw]);

  if (text === undefined && base64 === undefined && !file) return <div className="px-2 py-1 text-gray-400">{note ?? 'No body.'}</div>;
  if (file && !data) return <div className="px-2 py-1 text-gray-400">Missing in bundle: {file}</div>;
  if (binary) {
    return (
      <div className="space-y-2 p-2">
        <div className="text-gray-500">
          Binary, {formatBytes(data?.length)}
          {file && <> · <span className="font-mono">{file}</span></>}
        </div>
        {imgUrl && <img src={imgUrl} className="max-h-80 max-w-full border border-gray-200" />}
        {note}
      </div>
    );
  }
  const shown = all ? pretty.text : pretty.text.slice(0, SHOW_MAX);
  return (
    <div>
      <div className="flex items-center gap-2 px-2 py-0.5 text-[11px] text-gray-500">
        {file && <span className="font-mono">{file}</span>}
        <span>{formatBytes(new TextEncoder().encode(body ?? '').length)}</span>
        {(pretty.json || raw) && (
          <button className="hover:text-gray-900" onClick={() => setRaw(!raw)}>
            {raw ? 'Pretty' : 'Raw'}
          </button>
        )}
        <button className="hover:text-gray-900" onClick={() => navigator.clipboard?.writeText(body ?? '')}>
          Copy
        </button>
        {note}
      </div>
      <pre className="px-2 pb-2 font-mono text-xs break-all whitespace-pre-wrap">{shown}</pre>
      {!all && pretty.text.length > SHOW_MAX && (
        <button className="mx-2 mb-2 text-blue-700 hover:underline" onClick={() => setAll(true)}>
          Show all ({formatBytes(pretty.text.length)})
        </button>
      )}
    </div>
  );
}

/** Small "T2" badge for multi-tab sessions. */
export function TabBadge({ tabId, tabs }: { tabId?: number; tabs: number[] }) {
  if (tabs.length < 2 || tabId == null) return null;
  return <span className="shrink-0 rounded bg-gray-200 px-1 text-[10px] text-gray-600">T{tabs.indexOf(tabId) + 1}</span>;
}

export function includes(hay: string | undefined, needle: string) {
  return !needle || (hay ?? '').toLowerCase().includes(needle.toLowerCase());
}

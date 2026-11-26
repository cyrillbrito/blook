// Tiny UI primitives on the theme tokens of theme.css. See README.md.
import type { ComponentProps, HTMLAttributes, InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react';

export function cx(...parts: (string | false | undefined | null)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'record';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong',
  secondary: 'border border-line-strong bg-surface text-fg hover:bg-surface-sunken',
  ghost: 'text-muted hover:bg-surface-sunken hover:text-fg',
  danger: 'bg-danger text-white hover:bg-danger-strong',
  // Disabled, it turns neutral: a faded vermilion reads as an error.
  record:
    'bg-recording-strong text-white shadow-sm hover:bg-recording-hover disabled:bg-surface-sunken disabled:text-muted disabled:opacity-100 disabled:shadow-none',
};

const SIZE: Record<Size, string> = {
  sm: 'h-control gap-1.5 px-2.5 text-xs',
  md: 'h-8 gap-1.5 px-3 text-sm',
  lg: 'h-12 gap-2 px-4 text-base font-semibold',
};

const ICON_SIZE: Record<Size, string> = { sm: 'size-control', md: 'size-8', lg: 'size-12' };

type ButtonProps = ComponentProps<'button'> & { variant?: Variant; size?: Size };

/** A pressed toggle looks like `primary`, a released one like `secondary`. */
export function Toggle({ pressed, ...rest }: Omit<ButtonProps, 'variant'> & { pressed: boolean }) {
  return <Button variant={pressed ? 'primary' : 'secondary'} size="sm" aria-pressed={pressed} {...rest} />;
}

const base =
  'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-control font-medium whitespace-nowrap transition-colors ' +
  'disabled:cursor-default disabled:opacity-50';

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={cx(base, VARIANT[variant], SIZE[size], className)} {...rest} />;
}

/** Square button with only an icon. `label` is the tooltip and the accessible name. */
export function IconButton({
  label,
  variant = 'ghost',
  size = 'sm',
  className,
  type = 'button',
  ...rest
}: ButtonProps & { label: string }) {
  return (
    <button type={type} title={label} aria-label={label} className={cx(base, VARIANT[variant], ICON_SIZE[size], className)} {...rest} />
  );
}

type Tone = 'neutral' | 'accent' | 'danger' | 'warn' | 'ok' | 'recording';

const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-muted',
  accent: 'bg-accent-soft text-accent-strong',
  danger: 'bg-danger-soft text-danger-strong',
  warn: 'bg-warn-soft text-warn',
  ok: 'bg-ok-soft text-ok',
  recording: 'bg-recording-soft text-recording-strong',
};

export function Badge({ tone = 'neutral', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-full px-1.5 text-2xs font-medium', TONE[tone])}>
      {children}
    </span>
  );
}

export function Switch(props: { label: ReactNode; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <label
      title={props.title}
      className={cx('inline-flex items-center gap-2 select-none', props.disabled ? 'opacity-50' : 'cursor-pointer')}
    >
      <input
        type="checkbox"
        role="switch"
        aria-checked={props.checked}
        className="peer sr-only"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span
        className={cx(
          'relative h-4 w-7 shrink-0 rounded-full outline-accent transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
          props.checked ? 'bg-accent' : 'bg-line-strong',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform',
            props.checked && 'translate-x-3',
          )}
        />
      </span>
      {props.label}
    </label>
  );
}

/** One tab in an underlined tab row; the row sets the height and the bottom line. `Tabs` uses it; links use it directly. */
export function tabClass(active: boolean) {
  return cx(
    '-mb-px flex cursor-pointer items-center gap-1 border-b-2 px-2 whitespace-nowrap -outline-offset-2',
    active ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg',
  );
}

export interface TabItem<K extends string> {
  id: K;
  label: ReactNode;
  title?: string;
  className?: string;
}

/**
 * ARIA tabs: one tab stop, and the arrow keys, Home and End select. `id` (from useId) ties the tabs to the panel,
 * which spreads `tabPanelProps(id, value)`. Handled keys are preventDefault-ed, so page shortcuts can skip them.
 */
export function Tabs<K extends string>({
  id,
  tabs,
  value,
  onChange,
  className,
}: {
  id: string;
  tabs: TabItem<K>[];
  value: K;
  onChange: (id: K) => void;
  className?: string;
}) {
  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const tab = tabs[(to + tabs.length) % tabs.length]!;
    onChange(tab.id);
    document.getElementById(`${id}-${tab.id}`)?.focus();
  };
  return (
    <div role="tablist" className={className}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`${id}-${t.id}`}
          aria-selected={t.id === value}
          aria-controls={`${id}-panel`}
          tabIndex={t.id === value ? 0 : -1}
          title={t.title}
          onClick={() => onChange(t.id)}
          onKeyDown={onKeyDown}
          className={cx(tabClass(t.id === value), t.className)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function tabPanelProps(id: string, value: string) {
  return { role: 'tabpanel', id: `${id}-panel`, 'aria-labelledby': `${id}-${value}` } as const;
}

/** White content on the canvas. Every card has the same edge and shadow. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-card border border-line-strong bg-surface shadow-card', className)} {...rest} />;
}

/** Small heading for a group, with optional actions on the right. */
export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-xs font-semibold text-fg">{children}</h2>
      {actions}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx('h-control w-full rounded-control border border-line-strong bg-surface px-2 text-xs placeholder:text-muted', className)}
      {...rest}
    />
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-0.5">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

/** Pulsing red dot for "recording now". */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cx('relative inline-flex h-2.5 w-2.5 shrink-0', className)}>
      <span className="absolute inset-0 animate-ping rounded-full motion-reduce:hidden bg-recording opacity-60" />
      <span className="relative h-2.5 w-2.5 rounded-full bg-recording" />
    </span>
  );
}

export function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'warn'; children: ReactNode }) {
  return (
    <p
      role="alert"
      className={cx(
        'rounded-control border px-2 py-1.5 text-xs',
        tone === 'danger' ? 'border-red-200 bg-danger-soft text-danger-strong' : 'border-amber-200 bg-warn-soft text-warn',
      )}
    >
      {children}
    </p>
  );
}

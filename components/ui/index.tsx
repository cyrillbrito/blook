// Tiny UI primitives on the theme tokens of assets/tailwind.css. See README.md.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function cx(...parts: (string | false | undefined | null)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'record';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-fg text-white hover:bg-gray-700',
  secondary: 'border border-line-strong bg-surface text-fg hover:bg-surface-sunken',
  ghost: 'text-muted hover:bg-surface-sunken hover:text-fg',
  danger: 'bg-danger text-white hover:bg-red-700',
  record: 'bg-recording text-white shadow-sm hover:bg-red-700',
};

const SIZE: Record<Size, string> = {
  sm: 'h-6 gap-1 px-2 text-xs',
  md: 'h-8 gap-1.5 px-3 text-sm',
  lg: 'h-12 gap-2 px-4 text-base font-semibold',
};

const ICON_SIZE: Record<Size, string> = { sm: 'h-6 w-6', md: 'h-8 w-8', lg: 'h-12 w-12' };

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

const base =
  'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-control font-medium whitespace-nowrap transition-colors ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-default disabled:opacity-50';

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
    <button
      type={type}
      title={label}
      aria-label={label}
      className={cx(base, VARIANT[variant], ICON_SIZE[size], className)}
      {...rest}
    />
  );
}

type Tone = 'neutral' | 'accent' | 'danger' | 'warn' | 'ok' | 'recording';

const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-gray-600',
  accent: 'bg-accent-soft text-blue-700',
  danger: 'bg-danger-soft text-red-700',
  warn: 'bg-amber-50 text-amber-700',
  ok: 'bg-green-50 text-green-700',
  recording: 'bg-recording-soft text-red-700',
};

/** Small status pill. */
export function Badge({ tone = 'neutral', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-full px-1.5 text-2xs font-medium', TONE[tone])}>
      {children}
    </span>
  );
}

/** On/off switch with a label. */
export function Switch(props: { label: ReactNode; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <label
      title={props.title}
      className={cx('inline-flex items-center gap-2 select-none', props.disabled ? 'opacity-50' : 'cursor-pointer')}
    >
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span
        className={cx(
          'relative h-4 w-7 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50',
          props.checked ? 'bg-fg' : 'bg-line-strong',
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

/** Bordered white box. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-card border border-line bg-surface', className)}>{children}</div>;
}

/** Small uppercase heading for a group, with optional actions on the right. */
export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-2xs font-semibold tracking-wide text-muted uppercase">{children}</h2>
      {actions}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'h-7 w-full rounded-control border border-line-strong bg-surface px-2 text-xs outline-none focus:border-accent',
        className,
      )}
      {...rest}
    />
  );
}

/** Label above a control. */
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
      <span className="absolute inset-0 animate-ping rounded-full bg-recording opacity-60" />
      <span className="relative h-2.5 w-2.5 rounded-full bg-recording" />
    </span>
  );
}

/** Error or notice line. */
export function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'warn'; children: ReactNode }) {
  return (
    <p
      className={cx(
        'rounded-control border px-2 py-1.5 text-xs',
        tone === 'danger' ? 'border-red-200 bg-danger-soft text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800',
      )}
    >
      {children}
    </p>
  );
}

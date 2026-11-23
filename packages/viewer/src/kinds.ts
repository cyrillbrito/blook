// One colour per kind of event, shared by the timeline tags, the scrubber marks and their legend.
// These are data colours, so they use Tailwind's palette directly instead of theme tokens.
import type { TimelineType } from './bundle';

export type Kind = 'nav' | 'user' | 'request' | 'failed' | 'ws' | 'console' | 'error' | 'speech' | 'quiet';

export const KIND: Record<Kind, { tag: string; mark: string; label: string }> = {
  nav: { tag: 'bg-violet-100 text-violet-800', mark: 'bg-violet-600', label: 'navigation' },
  user: { tag: 'bg-sky-100 text-sky-800', mark: 'bg-sky-500', label: 'click' },
  request: { tag: 'bg-surface-sunken text-muted', mark: 'bg-slate-400', label: 'request' },
  failed: { tag: 'bg-orange-100 text-orange-800', mark: 'bg-orange-500', label: 'failed request' },
  ws: { tag: 'bg-teal-100 text-teal-800', mark: 'bg-teal-500', label: 'WebSocket' },
  console: { tag: 'bg-surface-sunken text-muted', mark: 'bg-slate-400', label: 'console' },
  error: { tag: 'bg-red-100 text-red-800', mark: 'bg-red-600', label: 'error' },
  speech: { tag: 'bg-blue-100 text-blue-800', mark: 'bg-blue-400/60', label: 'speech' },
  quiet: { tag: 'bg-surface-sunken text-muted', mark: 'bg-slate-300', label: 'other' },
};

export const TYPE_KIND: Record<TimelineType, Kind> = {
  navigation: 'nav',
  'page-ready': 'nav',
  'tab-open': 'nav',
  snapshot: 'quiet',
  click: 'user',
  input: 'user',
  scroll: 'quiet',
  request: 'request',
  'request-failed': 'failed',
  'ws-open': 'ws',
  'ws-close': 'ws',
  'ws-frame': 'ws',
  console: 'console',
  error: 'error',
  speech: 'speech',
};

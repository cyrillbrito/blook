// One colour per kind of event, shared by the timeline icons, the scrubber marks and their legend, and one icon and
// plain label per timeline type. These are data colours, so they use Tailwind's palette directly instead of theme tokens.
import type { ComponentType, SVGProps } from 'react';
import type { TimelineType } from './bundle';
import AppWindowIcon from 'lucide-react/icons/app-window';
import ArrowLeftRightIcon from 'lucide-react/icons/arrow-left-right';
import CameraIcon from 'lucide-react/icons/camera';
import CircleAlertIcon from 'lucide-react/icons/circle-alert';
import CircleXIcon from 'lucide-react/icons/circle-x';
import FileCheckIcon from 'lucide-react/icons/file-check';
import MessageSquareQuoteIcon from 'lucide-react/icons/message-square-quote';
import MousePointerClickIcon from 'lucide-react/icons/mouse-pointer-click';
import MoveVerticalIcon from 'lucide-react/icons/move-vertical';
import NavigationIcon from 'lucide-react/icons/navigation';
import PlugIcon from 'lucide-react/icons/plug';
import RadioIcon from 'lucide-react/icons/radio';
import SquareTerminalIcon from 'lucide-react/icons/square-terminal';
import TextCursorInputIcon from 'lucide-react/icons/text-cursor-input';
import UnplugIcon from 'lucide-react/icons/unplug';

export type Kind = 'nav' | 'user' | 'request' | 'failed' | 'ws' | 'console' | 'error' | 'speech' | 'quiet';

/** `icon`: the text colour of a timeline icon (3:1 or more on white). `mark`: the scrubber mark and legend fill. */
export const KIND: Record<Kind, { icon: string; mark: string; label: string }> = {
  nav: { icon: 'text-violet-600', mark: 'bg-violet-600', label: 'navigation' },
  user: { icon: 'text-sky-600', mark: 'bg-sky-500', label: 'click' },
  request: { icon: 'text-slate-500', mark: 'bg-slate-400', label: 'request' },
  failed: { icon: 'text-orange-600', mark: 'bg-orange-500', label: 'failed request' },
  ws: { icon: 'text-teal-600', mark: 'bg-teal-500', label: 'WebSocket' },
  console: { icon: 'text-slate-500', mark: 'bg-slate-400', label: 'console' },
  error: { icon: 'text-red-600', mark: 'bg-red-600', label: 'error' },
  speech: { icon: 'text-blue-600', mark: 'bg-blue-400/60', label: 'speech' },
  quiet: { icon: 'text-slate-500', mark: 'bg-slate-300', label: 'other' },
};

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** Per timeline type: its kind, its icon and a plain label (the icon's tooltip and accessible name). */
export const TYPE: Record<TimelineType, { kind: Kind; icon: Icon; label: string }> = {
  navigation: { kind: 'nav', icon: NavigationIcon, label: 'Navigation' },
  'page-ready': { kind: 'nav', icon: FileCheckIcon, label: 'Page loaded' },
  'tab-open': { kind: 'nav', icon: AppWindowIcon, label: 'Tab opened' },
  snapshot: { kind: 'quiet', icon: CameraIcon, label: 'DOM snapshot' },
  click: { kind: 'user', icon: MousePointerClickIcon, label: 'Click' },
  input: { kind: 'user', icon: TextCursorInputIcon, label: 'Input' },
  scroll: { kind: 'quiet', icon: MoveVerticalIcon, label: 'Scroll' },
  request: { kind: 'request', icon: ArrowLeftRightIcon, label: 'Request' },
  'request-failed': { kind: 'failed', icon: CircleAlertIcon, label: 'Failed request' },
  'ws-open': { kind: 'ws', icon: PlugIcon, label: 'WebSocket opened' },
  'ws-close': { kind: 'ws', icon: UnplugIcon, label: 'WebSocket closed' },
  'ws-frame': { kind: 'ws', icon: RadioIcon, label: 'WebSocket message' },
  console: { kind: 'console', icon: SquareTerminalIcon, label: 'Console' },
  error: { kind: 'error', icon: CircleXIcon, label: 'Error' },
  speech: { kind: 'speech', icon: MessageSquareQuoteIcon, label: 'Speech' },
};

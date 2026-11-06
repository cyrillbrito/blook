// A few inline SVG icons (Lucide-style strokes, drawn here). Size with `className`, colour follows the text.
import type { ReactNode } from 'react';

function Svg({ className = 'h-4 w-4', children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

type P = { className?: string };

/** The app icon (icon.svg), in its own colours. */
export const BlookIcon = ({ className = 'h-4 w-4' }: P) => (
  <svg viewBox="0 0 16 16" className={className} aria-hidden>
    <defs>
      <radialGradient id="blook-glint">
        <stop offset="0" stopColor="#fff" />
        <stop offset=".7" stopColor="#fff" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect y="1" width="16" height="14" rx="3" fill="#334155" />
    <circle cx="2.75" cy="3.75" r="1" fill="#94a3b8" />
    <circle cx="5.75" cy="3.75" r="1" fill="#94a3b8" />
    <path d="M1.5 9.5Q8 2.5 14.5 9.5Q8 16.5 1.5 9.5Z" fill="#fff" />
    <circle cx="8" cy="9.5" r="2.5" fill="#f2542d" />
    <circle cx="8" cy="9.5" r="1.1" fill="#334155" />
    <circle cx="9.1" cy="8.5" r=".65" fill="url(#blook-glint)" />
  </svg>
);
export const RecordIcon = ({ className = 'h-4 w-4' }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <circle cx="12" cy="12" r="7" fill="currentColor" />
  </svg>
);
export const StopIcon = ({ className = 'h-4 w-4' }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
  </svg>
);
export const PlayIcon = ({ className = 'h-4 w-4' }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
  </svg>
);
export const PauseIcon = ({ className = 'h-4 w-4' }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" />
    <rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" />
  </svg>
);
export const DownloadIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Svg>
);
export const TrashIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
);
export const FolderOpenIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 19V6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v2M3 19l3-8h16l-3 8z" />
  </Svg>
);
export const MicIcon = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Svg>
);
export const MicOffIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 3l18 18M9 9v2a3 3 0 0 0 5 2.2M15 10V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3" />
  </Svg>
);
export const GearIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);
export const SpinnerIcon = ({ className = 'h-4 w-4' }: P) => (
  <Svg className={`${className} animate-spin`}>
    <path d="M21 12a9 9 0 1 1-6.2-8.6" />
  </Svg>
);
export const VolumeIcon = (p: P & { muted?: boolean }) => (
  <Svg className={p.className}>
    <path d="M11 5 6 9H3v6h3l5 4z" />
    {p.muted ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
  </Svg>
);

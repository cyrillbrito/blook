// The app icon and the filled media glyphs. Every other icon comes from lucide-react, one deep import each
// (`import MicIcon from 'lucide-react/icons/mic'`). Size with `className`, colour follows the text.
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

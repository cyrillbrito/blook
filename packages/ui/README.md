# UI primitives

The bare minimum so the extension pages, the viewer and the site look alike. No component or icon library.

**Tokens** live in `@theme` in [src/theme.css](src/theme.css) and become normal Tailwind classes (`bg-surface`, `text-muted`, `border-line`, `rounded-card`, `text-2xs`). Use them instead of raw colours. The palette comes from the logo: neutrals are Tailwind slate (the logo's window is slate-700), actions use dark slate (`accent`), and vermilion (`recording`) is kept for the eye and for recording. Write `slate-*`, never `gray-*`. The `-strong` colors are for text and for fills under white text. A host imports them after Tailwind: `@import "tailwindcss"; @import "@blook/ui/theme.css";`. The theme also tells Tailwind to scan these primitives.

**Primitives** in [src/index.tsx](src/index.tsx) (`@blook/ui`), the app icon and the filled record, stop, play and pause glyphs in [src/icons.tsx](src/icons.tsx) (`@blook/ui/icons`, inline SVG, colour follows the text; every other icon is [Lucide](https://lucide.dev), one deep import each: `import MicIcon from 'lucide-react/icons/mic'`), the logo in [src/icon.svg](src/icon.svg) (`packages/extension/scripts/render-icons.sh` turns it into the extension icons):

**Layers.** Every page sits on `bg-canvas` and puts its content in `Card`s (white, `border-line-strong`, `shadow-sm`). Inside a card, `bg-surface-muted` marks bars (toolbars, detail headers) and `bg-surface-sunken` marks wells (the replay stage). Lines go `line-soft` between list rows, `line` between parts of a card, and `line-strong` for card edges and main dividers.

**Sizes.** Small controls (`sm` buttons, `Toggle`, `Input`, selects, the viewer's search and filter) are all `h-control` (28 px). Pages use `text-sm`; the dense viewer uses `text-xs`, with `text-2xs` for tags, legends and column headers. No arbitrary values (`text-[11px]`, `bg-[#…]`): add a token instead.

- `Button`: variants `primary` (the main action), `secondary` (default), `ghost` (quiet toolbar or header actions), `danger` (confirmed destructive action), `record` (Start recording only). Sizes `sm`, `md`, `lg`.
- `Toggle`: an on/off filter button, `primary` when pressed and `secondary` when not.
- `tabClass(active)`: one tab in an underlined tab row (the viewer's panels and sub-tabs, the Recordings page header).
- `IconButton`: icon-only, needs a `label` (tooltip and accessible name). Use for secondary row actions.
- `Badge`: small status pill with a `tone`. Use for states, not for actions.
- `Switch`: boolean settings. `Input` and `Field` (label above) for text settings.
- `Card` groups content; `SectionTitle` heads a list (sentence case, no all-caps labels). `Alert` shows an error line. `LiveDot` means "recording now".

Dense data views (viewer lists and detail panes) keep their own small helpers in `packages/viewer/src/ui.tsx`, built on these primitives. Event colours (timeline tags, scrubber marks, legend) come from one map, `packages/viewer/src/kinds.ts`.

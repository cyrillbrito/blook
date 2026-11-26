# UI primitives

The shared look of the extension pages, the viewer and the site: Tailwind theme tokens, a few React primitives, the logo and the icons. No component library.

- [src/theme.css](src/theme.css): the fonts and the tokens, as normal Tailwind classes (`bg-surface`, `text-muted`, `border-line`, `rounded-card`, `text-2xs`). A host imports it after Tailwind: `@import "tailwindcss"; @import "@blook/ui/theme.css";`. It also tells Tailwind to scan these primitives.
- [src/index.tsx](src/index.tsx) (`@blook/ui`): the primitives listed below.
- [src/icons.tsx](src/icons.tsx) (`@blook/ui/icons`): the app icon, the filled record, stop, play and pause glyphs, and `Spinner`. Every other icon is [Lucide](https://lucide.dev), one deep import each: `import MicIcon from 'lucide-react/icons/mic'`.
- [src/icon.svg](src/icon.svg): the logo. `packages/extension/scripts/render-icons.sh` turns it into the extension icons.

## Rules

**Type.** Instrument Sans for everything (`font-sans`, one variable file for every weight) and IBM Plex Mono 400 (`font-mono`) only for code and data: URLs, bodies, JSON, console text, keys. Times and counts stay in the sans with `tabular-nums`. Both are self-hosted in [src/fonts/](src/fonts/), since extension pages can't load web fonts. Chrome gives extension pages an unlayered `body { font-family: system-ui }`, so the theme sets the body font outside any layer. The recording pill can't use them: it lives in a shadow root on someone else's page, so it keeps the system font.

**Colours.** Use tokens, never raw colours or arbitrary values (`text-[11px]`, `bg-[#…]`): add a token instead. The palette comes from the logo. Neutrals are Tailwind slate (write `slate-*`, never `gray-*`), actions use dark slate (`accent`), and vermilion (`recording`) is only for the eye and for recording. The `-strong` colours are for text and for fills under white text. Event colours and icons in the viewer (timeline icons, scrubber marks, legend) come from one map, `packages/viewer/src/kinds.ts`: an icon per event type, not a coloured pill, so only problems stand out. Text selections are a light vermilion, and scrollbars and carets are slate, so the browser's own surfaces match too.

**Layers.** Every page sits on `bg-canvas` and puts its content in `Card`s (a `line-strong` edge and the short `shadow-card` lift). Inside a card, `bg-surface-muted` marks bars (toolbars, detail headers) and `bg-surface-sunken` marks wells (the replay stage). Lines go `line-soft` between list rows, `line` between parts of a card, and `line-strong` for card edges and main dividers.

**Sizes.** Small controls (`sm` buttons, `Toggle`, `Input`, selects, the viewer's search and filter) are all `h-control` (28 px). Pages use `text-sm`; the dense viewer uses `text-xs`, with `text-2xs` for tags, legends and column headers.

**Focus.** One `:focus-visible` outline in the theme covers every control, so components add no focus styles and never `outline-none`. Inside an `overflow-hidden` parent, add `-outline-offset-2` so the outline isn't clipped.

**Keyboard and screen readers.** Prefer native elements (`<button>`, range and checkbox inputs, `popover`); oxlint's `jsx-a11y` rules flag most of what they replace. A control that handles a key calls `preventDefault()`, because the viewer's page shortcuts (Space, ←/→) skip handled keys. Text that appears later, such as a status or an error, goes in an element that is always rendered, with `role="status"` (or `Alert`): a live region added together with its text isn't announced.

## Primitives

- `Button`: variants `primary` (the main action), `secondary` (default), `ghost` (quiet toolbar or header actions), `danger` (confirmed destructive action), `record` (Start recording only; disabled, it turns neutral, since a faded vermilion reads as an error). Sizes `sm`, `md`, `lg`.
- `Toggle`: an on/off filter button, `primary` when pressed and `secondary` when not.
- `Tabs`: an underlined tab row with the ARIA tab keys (the viewer's panels and a request's sub-tabs). Its panel spreads `tabPanelProps(id, value)`. `tabClass(active)` gives links the same look (the Recordings page header, with `aria-current`).
- `IconButton`: icon-only, needs a `label` (tooltip and accessible name). Use for secondary row actions.
- `Badge`: small status pill with a `tone`. Use for states, not for actions.
- `Switch`: boolean settings. `Input` and `Field` (label above) for text settings.
- `Card` groups content; `SectionTitle` heads a list (sentence case, no all-caps labels). `Alert` shows an error line and announces it. `LiveDot` means "recording now".

Dense data views keep their own helpers in `packages/viewer/src/ui.tsx`, built on these. Every viewer list is a `RowList`: a listbox where clicks and ↑/↓ select a row and selecting seeks.

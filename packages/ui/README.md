# UI primitives

The bare minimum so the side panel, the viewer and the small pages look alike. No component or icon library.

**Tokens** live in `@theme` in [src/theme.css](src/theme.css) and become normal Tailwind classes:
colors `surface`, `surface-muted`, `surface-sunken`, `line`, `line-strong`, `fg`, `muted`, `accent`, `danger`, `warn`, `ok`, `recording` (most with a `-soft` tint; `accent-strong` and `recording-strong` for text, or under white text), radii `rounded-control` and `rounded-card`, and the font size `text-2xs`. Use them instead of raw grays and reds. A host imports them after Tailwind: `@import "tailwindcss"; @import "@blook/ui/theme.css";` (the theme also tells Tailwind to scan these primitives).

**Primitives** in [src/index.tsx](src/index.tsx) (`@blook/ui`), icons in [src/icons.tsx](src/icons.tsx) (`@blook/ui/icons`, inline SVG, colour follows the text), the logo in [src/icon.svg](src/icon.svg) (`packages/extension/scripts/render-icons.sh` turns it into the extension icons):

- `Button`: variants `primary` (the main action), `secondary` (default), `ghost` (quiet toolbar or header actions), `danger` (confirmed destructive action), `record` (Start recording only). Sizes `sm`, `md`, `lg`.
- `IconButton`: icon-only, needs a `label` (tooltip and accessible name). Use for secondary row actions.
- `Badge`: small status pill with a `tone`. Use for states, not for actions.
- `Switch`: boolean settings. `Input` and `Field` (label above) for text settings.
- `Card` groups content; `SectionTitle` heads a list. `Alert` shows an error line. `LiveDot` means "recording now".

Dense data views (viewer lists and detail panes) keep their own small helpers in `packages/viewer/src/ui.tsx`.

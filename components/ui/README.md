# UI primitives

The bare minimum so the side panel, the viewer and the small pages look alike. No component or icon library.

**Tokens** live in `@theme` in [assets/tailwind.css](../../assets/tailwind.css) and become normal Tailwind classes:
colors `surface`, `surface-muted`, `surface-sunken`, `line`, `line-strong`, `fg`, `muted`, `accent`, `danger`, `warn`, `ok`, `recording` (most with a `-soft` tint), radii `rounded-control` and `rounded-card`, and the font size `text-2xs`. Use them instead of raw grays and reds.

**Primitives** in [index.tsx](index.tsx), icons in [icons.tsx](icons.tsx) (inline SVG, colour follows the text):

- `Button`: variants `primary` (the main action), `secondary` (default), `ghost` (quiet toolbar or header actions), `danger` (confirmed destructive action), `record` (Start recording only). Sizes `sm`, `md`, `lg`.
- `IconButton`: icon-only, needs a `label` (tooltip and accessible name). Use for secondary row actions.
- `Badge`: small status pill with a `tone`. Use for states, not for actions.
- `Switch`: boolean settings. `Input` and `Field` (label above) for text settings.
- `Card` groups content; `SectionTitle` heads a list. `Alert` shows an error line. `LiveDot` means "recording now".

Dense data views (viewer lists and detail panes) keep their own small helpers in `components/viewer/ui.tsx`.

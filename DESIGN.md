---
name: Blook
description: Record a browser tab while you talk; replay it, with network, console and voice on one clock.
colors:
  canvas: "#eef1f5"
  surface: "#ffffff"
  surface-muted: "#f8fafc"
  surface-sunken: "#f1f5f9"
  line-soft: "#f1f5f9"
  line: "#e2e8f0"
  line-strong: "#cbd5e1"
  fg: "#0f172a"
  muted: "#475569"
  accent: "#334155"
  accent-strong: "#1e293b"
  accent-soft: "#f1f5f9"
  window-dots: "#94a3b8"
  recording: "#f2542d"
  recording-strong: "#cc3f1d"
  recording-hover: "#b52e15"
  recording-soft: "#fff3f0"
  playhead: "#f59e0b"
  playhead-soft: "#fffbeb"
  danger: "#dc2626"
  danger-strong: "#b91c1c"
  danger-soft: "#fef2f2"
  warn: "#b45309"
  warn-soft: "#fffbeb"
  ok: "#15803d"
  ok-soft: "#f0fdf4"
typography:
  title:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
  caption:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.45
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.33
rounded:
  control: "6px"
  card: "12px"
  pill: "9999px"
spacing:
  control: "28px"
  row: "8px"
  card: "16px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 12px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 12px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-sunken}"
  button-record:
    backgroundColor: "{colors.recording-strong}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 16px"
  button-record-hover:
    backgroundColor: "{colors.recording-hover}"
  button-record-disabled:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.muted}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    height: "{spacing.control}"
    padding: "0 8px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  replay-window-bar:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.line-strong}"
    height: "36px"
  pill:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
---

# Design System: Blook

## Overview

**Creative North Star: "The Quiet Instrument"**

Blook is a measuring tool that sits next to someone else's app. It should feel like a well-made instrument on a bench: calm slate surfaces, precise small type, and one warm signal colour that means "this is recording" or "look here". The interface stays quiet so the recorded page, the narration and the one failing request can be loud.

The character comes from three things, not from decoration: the app icon's motif (a dark slate browser window with a vermilion eye), which the Replay page repeats as the window the replay plays in; a humanist sans (Instrument Sans) with a mono (IBM Plex Mono) for anything that is data; and colour used as meaning, never as ornament. Density is that of a developer tool: compact rows, 28 px controls, a lot on screen, but with air between groups.

Rejected: stock admin-template looks (equal-weight colourful pills on every row), DevTools clones that show raw JSON first, busy gradients, and hype in copy.

**Key Characteristics:**
- Cool slate neutrals on a soft canvas; white cards with a light lift.
- One vermilion for recording; amber for "now" in the viewer; red only for real problems.
- Small coloured icons, not pills, to tell event types apart.
- Plain-language labels; JSON and code one click away, in mono.

## Colors

Cool slate neutrals carry almost everything; colour appears only where it means something.

### Primary
- **Ink Slate** (#334155): the accent. Primary buttons, pressed toggles, the focus outline, the replay window's title bar and the icon's frame.
- **Deep Slate** (#1e293b): hover and pressed state of the accent.

### Secondary
- **Signal Vermilion** (#f2542d): the eye in the logo and the recording dot. Fills and dots only (3.5:1 on white). Selection highlight at 22%.
- **Record Vermilion** (#cc3f1d): the Start recording button under white text (4.9:1); hover #b52e15; soft tint #fff3f0.

### Tertiary
- **Playhead Amber** (#f59e0b): "now" in the viewer: the scrubber head, the current row, the spoken word at the playhead. Soft tint #fffbeb.

### Neutral
- **Canvas** (#eef1f5): page background behind cards.
- **Surface** (#ffffff), **Surface Muted** (#f8fafc), **Surface Sunken** (#f1f5f9): cards, bars, wells and hover fills.
- **Lines** (#f1f5f9 soft, #e2e8f0, #cbd5e1 strong): dividers, row separators, control and card borders.
- **Fg** (#0f172a) and **Muted** (#475569, 7.6:1 on white): text.

### Status
- **Danger** (#dc2626), **Warn** (#b45309), **OK** (#15803d), each with a 50-tint background: problems, warnings and success badges.
- **Event kinds** (viewer only, Tailwind palette in `packages/viewer/src/kinds.ts`): violet navigation, sky clicks, teal WebSockets, orange failed requests, red errors, blue speech, slate for everything routine.

### Named Rules
**The Earned Colour Rule.** Routine events (requests, console logs, scrolls, snapshots) are slate. Colour is for what a reader should notice: what the user did, what failed, what was said.

**The One Vermilion Rule.** Vermilion means recording or the Blook eye. Never use it for errors or for generic emphasis.

## Typography

**Body Font:** Instrument Sans (variable 400 to 700), with ui-sans-serif, system-ui
**Data Font:** IBM Plex Mono 400, with ui-monospace, Menlo

**Character:** a warm, slightly narrow humanist sans that reads well at 11 to 14 px, paired with a calm mono for URLs, timestamps, JSON and code. Both are bundled (`packages/ui/src/fonts/`) because extension pages can't load web fonts.

### Hierarchy
- **Title** (600, 18 px): page titles such as "Recordings".
- **Body** (400, 14 px): settings text, empty states, the transcript.
- **Label** (500, 12 px): buttons, tabs, card headings, timeline rows.
- **Caption** (500, 11 px, `text-2xs`): badges, the legend, secondary metadata.
- **Data** (Plex Mono 12 px, tabular figures): times, URLs, status codes, sizes, JSON.

### Named Rules
**The Mono Means Data Rule.** Mono is only for values a person might copy or compare. Labels, names and sentences are always in the sans.

## Layout

App surfaces are tool layouts, not pages. The Replay page is a header bar, then the replay window beside a tabbed side panel (timeline, transcript, network, WebSockets, console), with the scrubber and controls along the bottom. The Recordings page is one centred column of cards. The popup is a fixed narrow column. Controls share one height (28 px, `h-control`). Rows use 8 px vertical rhythm; cards pad 16 px. At narrow widths, secondary chrome (the legend) hides before anything wraps.

## Elevation & Depth

Mostly tonal layers: canvas, then white cards, then sunken wells. Cards add one short, soft lift; nothing else floats except the pill and menus.

### Shadow Vocabulary
- **Card** (`0 1px 2px rgb(15 23 42 / 0.05), 0 2px 6px -2px rgb(15 23 42 / 0.06)`): every card, via `shadow-card`.
- **Record** (`shadow-sm`): the Start recording button, so the one action stands up from the popup.

## Shapes

Soft rectangles: 6 px on controls, 12 px on cards, full pills only for badges and the recording pill. Borders are 1 px slate lines. The replay card is the browser window: a 36 px dark slate title bar with two dots across its top, like the icon.

## Components

### Buttons
- **Shape:** 6 px radius; 28 px (`sm`), 32 px (`md`) or 48 px (`lg`) tall.
- **Primary:** Ink Slate fill, white text; Deep Slate on hover.
- **Secondary:** white with a strong line border; sunken fill on hover. **Ghost:** muted text, sunken fill on hover.
- **Record:** Record Vermilion fill, white text, `shadow-sm`. Disabled, it turns neutral grey: a faded vermilion reads as an error.
- **Focus:** a 2 px Ink Slate outline, 2 px offset, on every focusable element (an outline survives forced colours; a box-shadow ring does not).

### Badges
- **Style:** full-pill, caption size, tinted background with matching text (danger, warn, ok, neutral).

### Cards
- **Corner Style:** 12 px. **Background:** white. **Border:** line-strong. **Shadow:** Card. **Padding:** 16 px.

### Inputs
- **Style:** 28 px tall, 6 px radius, line-strong border, white fill, muted placeholder. **Focus:** the shared outline.

### Timeline rows (signature)
A mono timestamp, a small kind-coloured icon with a plain label as its tooltip, then the summary in the sans. Problems tint the row red. The current row carries the amber playhead tint. The detail pane leads with a readable summary (message, file and line, stack, status), with raw JSON behind a toggle.

### Replay window (signature)
The replay card itself is the window: an Ink Slate title bar with two slate dots and the tab's URL at the playhead in mono, then the page, scaled to fit in a sunken well, then the controls. No second frame inside the card. It opens just after the first page load, never on an empty "loading" frame.

### Recording pill
A dark full-pill control on the recorded page (closed shadow root, system font so it never loads into other pages): live vermilion dot, elapsed time, Stop; after Stop, Open, Download and Close. Enters with an ease-out pop, no overshoot.

## Do's and Don'ts

### Do:
- **Do** use the theme tokens (`bg-surface`, `text-muted`, `border-line`, `rounded-card`, `shadow-card`), never raw slate classes, in app surfaces.
- **Do** keep routine events slate and give colour only to user actions, problems and speech.
- **Do** put URLs, times, codes and JSON in IBM Plex Mono, and everything else in Instrument Sans.
- **Do** keep first use direct: the Start recording button explains itself. No numbered tutorials or onboarding steps in the popup or the Recordings page.
- **Do** write labels in plain words ("Failed request", "WebSocket message"), not identifiers (`request-failed`, `ws-frame`).

### Don't:
- **Don't** use vermilion for errors, links or emphasis; it means recording.
- **Don't** put a coloured pill on every row, or give every event type its own loud colour.
- **Don't** show raw JSON before a readable summary.
- **Don't** hide primary row actions behind hover.
- **Don't** use bouncy or overshooting easing; motion is short and ease-out.
- **Don't** replace or redraw the app icon; refine around it.

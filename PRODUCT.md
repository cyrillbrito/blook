# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **The recorder.** A developer, at first the author himself, who presses Record in a web app and talks while using it: walks a flow, points with the mouse, describes a bug. They use the popup, the in-page pill and the Recordings page, often while their attention is on the app being recorded.
- **The reviewer.** A developer who receives a bundle (a ZIP), for example attached to a Jira ticket, and opens it in the Replay page or on the website's `/viewer` to find what went wrong. They may have never installed Blook.
- **The coding agent.** Reads the bundle with the `blook` skill and replay CLI, not the UI. The UI never needs to serve it, but the bundle contents must stay legible to it.
- **Public Chrome Web Store users.** Strangers who installed it from the store. How many there will be is unknown and probably small; the UI must still explain itself to someone who has never seen it.

## Product Purpose

Blook records what happens in a browser tab while the user talks, and exports it as one local ZIP: a DOM replay, network and WebSocket traffic, the console, and the voice transcribed word by word, all on one clock. A person or a coding agent can then replay any moment. Success is a bug report or a narrated flow that the reader understands without a call, and that an agent can turn into a fix or an E2E test.

## Positioning

The bundle is made for coding agents as much as for people: no video, a replay that rebuilds the page at any time, JSON files meant for jq, and a CLI that screenshots the page or names the element under the mouse at time T. It is local first: no account, no upload, no hosting.

## Operating Context

- Recording happens inside someone else's web app: the popup and the pill sit on top of the page being recorded and must stay out of its way (and out of the recording).
- Reviewing happens next to an issue tracker or an agent session, often from a ZIP someone else sent.
- Chrome shows its own "started debugging this browser" bar while recording; the first mic use needs a permission prompt.

## Capabilities and Constraints

- Chrome extension (MV3) built with WXT, React and Tailwind. Shared UI in `packages/ui`, the viewer in `packages/viewer`, also hosted by the Astro site at `/viewer`.
- Surfaces: popup, in-page recording pill (closed shadow root), Recordings page with Settings, Replay page (the viewer), mic-permission page, the website home and `/viewer`.
- Personal tool, Chrome only. Deliberately fewer options than Jam or similar recorders. Not goals: accounts, sharing, test selectors, storage state.
- Transcription is optional and needs the user's own OpenRouter key.

## Brand Commitments

- The name Blook and the app icon (`packages/ui/src/icon.svg`): a dark slate browser window with a vermilion eye. The user likes it; small refinements are fine, replacing it is not.
- Plain, short, factual copy. No hype.
- No telemetry, no tracking, nothing uploaded unless the user downloads or transcribes.

## Evidence on Hand

- Real product screenshots and listing images in `packages/store/images/`, a demo team-chat app for recording in `packages/store/demo-app/`, and marketing films in `packages/videos/`.
- Several store and site images are outdated or record busy, unattractive pages; they need to be redone once the app UI settles.
- No testimonials, user counts, or press. Do not invent any.

## Product Principles

1. **Obvious in one look.** Anyone should see what Blook does and the steps to set it up (install, pin, record, stop, open) without reading docs.
2. **Stay out of the way while recording.** The recording controls are small, calm and never in the shot.
3. **One clock, one story.** Every view helps the reviewer line up what was said, what was clicked and what failed at that moment.
4. **The bundle is the product.** What the UI shows is what's in the ZIP; nothing is hidden in the UI that an agent cannot read.
5. **Fewer options.** Add a control only when one of the typical uses needs it.

## Accessibility & Inclusion

Keyboard use is a first-class path in the viewer (Space, arrows, list navigation), and text meets WCAG AA contrast. No other specific requirement was established.

# Overseer

Overseer is a Chrome extension for personal use. It records a browser session while I talk through it, and exports one local bundle that a coding agent can read to fully understand what happened in the browser.

## Goal

I open my web app, press Record, and narrate: walk through a flow, point at things with the mouse, describe bugs and QA findings. When I stop, I get a bundle with:

- a full DOM replay (rrweb), including mouse movement, clicks, scrolls and inputs
- network requests and responses, including WebSocket frames
- console logs and errors
- my voice, transcribed with word-level timestamps

Everything shares one clock, so the agent can line up "this button is broken" in the transcript with the mouse position, the DOM and the network traffic at that moment.

The bundle has no screenshots or video. A replay tool rebuilds the page at any time T, so the agent can ask for a screenshot, the DOM, or the element under the mouse whenever it needs one. The replay is the source of truth.

Typical uses: report bugs to an agent, and let an agent write E2E tests from a narrated flow.

## Scope

- Personal tool, Chrome only, local first. No accounts, no hosting, no telemetry.
- Fewer options than products like Proofline Session Recorder or Jam. Build only what the use cases above need.
- Not a goal for now: stable test selectors, capturing cookies or storage state, multi-user sharing.

## Stack

- [WXT](https://wxt.dev) for the MV3 extension
- React and Tailwind for the UI
- [rrweb](https://github.com/rrweb-io/rrweb) (upstream, MIT) for DOM recording and replay
- `chrome.debugger` (Chrome DevTools Protocol) for network, WebSocket and console
- OpenRouter speech-to-text (`/api/v1/audio/transcriptions`) for transcription

## Docs

- [Architecture](docs/architecture.md)
- [References and inspiration](docs/references.md): other tools, how they work, what to borrow. Their source is cloned in `references/` (git-ignored).
- [Research](docs/research.md): the original tool comparison and safety review

## Prior art

`~/Repos/session-recorder-chrome-extension` is a fork of Proofline Session Recorder (AGPL-3.0), a WXT extension that does much of this without rrweb. Read it for ideas on debugger capture, the offscreen mic recorder and the export bundle. Don't copy code from it without considering the AGPL license.

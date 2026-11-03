# References and inspiration

Tools that do part of what Blook does: what each one is, how it works, and what to borrow. Source code for the open-source ones is cloned (shallow) in `references/`, which git ignores. To refresh a clone, run `git -C references/<name> pull`.

The full earlier research, with pricing and a safety review of Proofline, is in [research.md](research.md).

## Quick map

| Tool | Open source | DOM replay | Network | WebSocket frames | Console | Voice | Local export | Cloned |
|---|---|---|---|---|---|---|---|---|
| rrweb | MIT | Yes (it *is* the replay) | Plugin, fetch/XHR | No | Plugin | No | Your own | `references/rrweb` |
| Proofline Session Recorder | AGPL-3.0 | No | CDP | Yes | CDP | Yes | ZIP | `references/proofline-session-recorder` |
| OpenReplay (tracker + Spot) | AGPL-3.0 (ee/ separate) | Own format | Patch (tracker), CDP (Spot) | No | Yes | Spot: yes | No | `references/openreplay` |
| Crikket | AGPL-3.0 | No (video) | Patch fetch/XHR | No | Yes | No | No | `references/crikket` |
| PostHog replay | MIT (`posthog-js`) | rrweb fork | Patch fetch/XHR | No ([open issue](https://github.com/PostHog/posthog/issues/25721)) | Yes | No | No | No |
| Sentry replay | MIT (`sentry-javascript`) | rrweb fork | Patch fetch/XHR | No | Yes | No | No | No |
| Jam | Closed | Unknown | Yes | Yes | Yes | Yes | Unknown | n/a |

## rrweb

`references/rrweb`. MIT. [rrweb.com](https://www.rrweb.com)

- **What:** the open-source library behind PostHog and Sentry replay. It records the DOM as a full snapshot plus a stream of mutation and input events, then rebuilds and replays it.
- **How:** `rrweb-snapshot` serializes the DOM and gives each node an id. A `MutationObserver` records changes, and listeners record mouse, scroll, input, viewport and media events. Each event has an absolute ms `timestamp`. The replayer rebuilds the DOM in an iframe (or with `rrdom` without a browser) and applies events up to any time.
- **Packages to know:** `@rrweb/record`, `@rrweb/replay`, `rrweb-player` (UI player), `rrdom` / `rrdom-nodejs` (virtual DOM for headless replay), `@rrweb/packer` (compression), `rrvideo` (renders a replay to video).
- **Plugins:** `rrweb-plugin-console-record`, `rrweb-plugin-network-record` (patches fetch/XHR, merged June 2026), `rrweb-plugin-canvas-webrtc-record`.
- **Borrow:** `packages/web-extension` is rrweb's own browser extension. It records any site and has a replay page. It's the closest thing to Blook's rrweb half, so read it first for how it injects the recorder and stores events. `rrvideo` shows how to drive a replay headlessly, which is the base for the replay tool's `screenshot <t>`.

## Proofline Session Recorder

`references/proofline-session-recorder` (my fork, also at `~/Repos/session-recorder-chrome-extension`). AGPL-3.0, so use it for ideas and don't copy code.

- **What:** a WXT + React Chrome extension that records clicks, inputs, network, WebSocket frames, console, screenshots, annotations, mic narration and tab video, and exports a ZIP with `report.md` for agents.
- **How:**
  - A background service worker funnel (`entrypoints/background.ts`, `recordEvent()`) stamps every event with ms since start and batches it into IndexedDB.
  - `lib/capture/debugger.ts` and `network.ts` use `chrome.debugger` with the Network, Runtime and Log domains, and fetch bodies on `loadingFinished`.
  - WebSocket frames are attached to one `net-request` per socket, capped at 100 frames and 2 KB each.
  - Screenshots come from CDP `Page.captureScreenshot`.
  - An offscreen document records the mic in 30 s WebM chunks and the tab video through `tabCapture`.
  - Transcription goes through pluggable providers (`lib/transcription/`).
- **Borrow:** the debugger attach and detach handling, network assembly and redaction, the offscreen mic flow (including the visible mic-permission page), segment timing, and the export idea of one readable timeline plus machine-readable JSON.
- **Watch out:** the OpenAI-compatible provider doesn't request word timestamps, and its batch word timings are stored in segment-relative seconds.

## OpenReplay (tracker and Spot)

`references/openreplay`. AGPL-3.0 (`ee/` has its own license).

- **What:** self-hostable product analytics and session replay. Two recording paths:
  - The **tracker** (`tracker/tracker`) is a JS SDK you put in your app.
  - **Spot** (`spot/`) is a bug-report browser extension.
- **How:**
  - The tracker has its own DOM recorder, not rrweb, which writes OpenReplay's binary "mob" format. Its modules are in `tracker/tracker/src/main/modules`: `mouse`, `input`, `scroll`, `network`, `console`, `exception`, `cssrules`, `fonts`, `img`, `webAnimations` and more. Their own `player/` replays it.
  - Spot is built with **WXT + Solid**. It records tab video through `tabCapture` in an offscreen document and adds mic audio. Network goes through `chrome.debugger` (`spot/utils/networkDebuggerTracking.ts`: `requestWillBeSent`, `responseReceived`, `loadingFinished`, `getResponseBody`).
  - Recordings upload to an OpenReplay server, and self-hosting is about 20 containers.
- **Borrow:**
  - Spot is a second WXT extension using `chrome.debugger` for network, so compare its handling with Proofline's.
  - The tracker modules are a checklist of DOM edge cases a recorder has to handle: constructed stylesheets, fonts, web animations and adopted CSS. Use it when rrweb replay looks wrong.
  - `networkProxy/` shows the patch-in-page approach to network capture.

## Crikket

`references/crikket`. AGPL-3.0. [crikket.io](https://crikket.io)

- **What:** an open-source Jam or Marker.io alternative for bug reports: screenshot or tab video, steps, console and network, shared as a link.
- **How:** a monorepo (`apps/extension`, `apps/server` with Hono, `apps/web`, `sdks/capture`, `packages/capture-core`). Video comes from `tabCapture` with `audio: false`, so there's no voice. Network is captured by patching `fetch` and `XMLHttpRequest` in the page (`packages/capture-core/src/debugger/engine/page/network/`). There's no WebSocket capture. Reports upload to its server.
- **Borrow:** the page-patching network code, if we ever want capture without the debugger banner. The step recorder for click and navigation descriptions. An embeddable SDK pattern.

## PostHog session replay

[posthog-js](https://github.com/PostHog/posthog-js), MIT. Not cloned because it's large. Clone it if needed.

- **What:** product analytics with session replay.
- **How:** uses a patched rrweb fork (`@posthog/rrweb`). Network capture is its own rrweb plugin that patches fetch and XHR (`src/extensions/replay/external/network-plugin.ts`). It's the origin of rrweb's official network plugin. Headers and bodies are opt-in and masked by a deny-list. It doesn't capture WebSocket, and network capture is off on localhost.
- **Borrow:** the masking defaults (header deny-list, `maskCapturedNetworkRequestFn`) and the player UX that shows network and console in sync with the replay.

## Sentry session replay

[sentry-javascript](https://github.com/getsentry/sentry-javascript) (`packages/replay-internal`), MIT. Not cloned.

- **What:** replay attached to errors.
- **How:** an rrweb fork (`@sentry-internal/rrweb`). It keeps a buffer of recent activity and uploads it when an error happens. It records network through its own breadcrumbs instead of the rrweb plugin.
- **Borrow:** the "replay buffer" idea, which keeps the last N minutes and saves them on demand. It could become a "save the last 2 minutes" hotkey later.

## Jam

[jam.dev](https://jam.dev). Closed source.

- **What:** the polished commercial version of this idea. An extension records screenshot, video or an "instant replay" of the last few minutes, plus console, network, [WebSocket](https://jam.dev/blog/launching-today-websocket-inspector/), device info and voice. It also has an MCP server so agents can read Jams.
- **How:** unknown in detail. Jams upload to Jam's cloud, and the free tier is capped.
- **Borrow:** product ideas only: the instant-replay buffer, the WebSocket inspector UI, and serving recordings to agents through MCP.

## Screenity

[screenity](https://github.com/alyssaxuu/screenity), GPL-3.0. Not cloned.

- **What:** a free screen recorder extension with the best drawing tools (arrows, shapes, click highlights). It doesn't capture network or console.
- **Borrow:** annotation and click-highlight UX, if we add a pointing tool.

## Agent browser tools

These let an agent read or drive a live browser. None records a narrated session over time.

- **Chrome DevTools MCP** ([repo](https://github.com/ChromeDevTools/chrome-devtools-mcp), Apache-2.0): CDP from an MCP server: console, network, screenshots, performance. It doesn't capture WebSocket frames ([issue #1172](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1172)). A good model for the shape of Blook's replay-tool MCP.
- **Playwright trace viewer** ([docs](https://playwright.dev/docs/trace-viewer), Apache-2.0): per-action DOM snapshots, network and console in one trace ZIP. The closest existing "bundle an agent can read" format. Its time-travel snapshot UI is worth studying.
- **Orca Design Mode** (MIT), **Stagewise** (AGPL-3.0), **React Grab** (MIT), **T3 Code** (MIT): element pickers that give an agent the HTML, computed styles, a selector and the React component or source file. Use them for ideas if `pointer <t>` should return richer element context.
- **Claude in Chrome**, **Cursor browser** (closed): an agent drives the browser and reads console, network and DOM.

## Transcription

- **OpenRouter STT** ([docs](https://openrouter.ai/docs/guides/overview/multimodal/stt)): `POST /api/v1/audio/transcriptions`. Use `verbose_json` with `timestamp_granularities: ["word"]` for word times. Whisper models support it, while `openai/gpt-4o-transcribe` rejects it.
- **Local options**, if needed later: [Speaches](https://github.com/speaches-ai/speaches) (faster-whisper with an OpenAI-compatible API, reads WebM) and the [whisper.cpp server](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server).

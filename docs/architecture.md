# Architecture

Blook has a recording side (the extension) and a reviewing side (the viewer for people, the skill and replay CLI for agents). The bundle ZIP sits between them. Its fields are in [bundle-format.md](bundle-format.md).

```mermaid
flowchart TD
  P["Side panel"] -->|"Record / Stop / Export"| BG["Background worker"]
  RR["rrweb recorder in the page"] --> BG
  CDP["chrome.debugger: network, WebSocket, console"] --> BG
  MIC["Offscreen mic recorder"] --> BG
  BG --> DB[("IndexedDB")]
  STT["OpenRouter speech-to-text"] --> DB
  DB --> ZIP["Bundle ZIP"]
  ZIP --> V["Viewer: Replay page or viewer.html"]
  ZIP --> A["Agent: skill + replay CLI"]
```

## Recording

**Side panel** (`entrypoints/sidepanel/`). Record and Stop, settings (mask, mic, canvas, OpenRouter key), past sessions with Replay and Export. It only sends messages to the background.

**Background worker** (`entrypoints/background.ts`, `lib/capture/session.ts`). Owns the session. It attaches the debugger, injects the recorder, starts the mic, and writes every event to IndexedDB about once a second (`lib/capture/writer.ts`), so a worker restart loses little.

**rrweb recorder** (`entrypoints/recorder-main.content.ts`, `entrypoints/recorder.content.ts`). rrweb runs in the page's own world. A small bridge in the isolated world forwards its events to the background.

**CDP capture** (`lib/capture/cdp.ts`). Turns `chrome.debugger` events into requests with bodies, sockets with frames, and console entries.

**Mic** (`entrypoints/offscreen/`, `entrypoints/mic-permission/`). An offscreen document records the mic in chunks of about 30 s. The first mic permission needs a visible page.

**Transcription** (`lib/transcribe/openrouter.ts`). Sends each audio chunk to OpenRouter and stores word times per chunk.

**Export** (`lib/export/`). Builds the ZIP from IndexedDB, including `timeline.json`, which merges every source into one sorted list.

## Reviewing

**Viewer** (`components/viewer/`). A React app that plays the rrweb replay with the mic audio on one clock, next to the timeline, transcript, network, WebSockets and console. Two hosts use it: the extension's Replay page (`entrypoints/replay/`, which reads a session straight from IndexedDB), and the standalone `dist/viewer.html` (`bun run build:viewer`), one file that opens from disk and takes a dropped ZIP or folder.

**Agent skill** (`skills/blook/`). Tells an agent how to read a bundle: read order, jq recipes, and workflows for bug triage, task lists and E2E tests.

**Replay CLI** (`cli/`). Replays the rrweb file in headless Chromium (Playwright) and answers `screenshot`, `dom` and `pointer` at time T. See [cli/README.md](../cli/README.md).

## Key decisions

- **CDP over patching.** `chrome.debugger` sees every request, including ones made before page scripts run, gets full bodies and WebSocket frames, and needs no code in the page. The cost is Chrome's "debugging this browser" banner, and recording fails if DevTools is already attached to the tab.
- **rrweb in the MAIN world.** rrweb patches `insertRule`, adopted stylesheets and canvas. Those patches only see the page's calls in the page's own world. Run isolated, CSS-in-JS styles were missing from the replay.
- **Reload on Record.** After attaching the debugger, the tab reloads. The first snapshot is fresh, and every request and socket is seen from the start (CDP doesn't report sockets that were already open). The recorder snapshots as soon as `<body>` exists instead of waiting for `load`. The reload uses the HTTP cache, so big app bundles don't re-download, and the side panel shows "Loading page…" until the load event (`pageReadyT`).
- **Bodies only for API calls.** Response bodies are kept for what the app's code asks for (XHR, Fetch, EventSource, …) and for page loads that failed, cut at 1 MB. Scripts, CSS, fonts, images and normal page loads are most of the bytes and rarely the bug, so their bodies aren't even fetched; only their metadata stays. No hash either: it would mean fetching every body again, and URLs and cache headers already tell builds apart. Request bodies are always kept. The rule is one function, `lib/capture/body-policy.ts`, with no setting.
- **One network.json.** Bodies are inline, and JSON bodies are stored parsed, so jq walks straight into them. Fewer files for an agent to follow, at the cost of a larger `network.json` that must be queried, not read whole.
- **One clock.** Every `t` is ms since Record, from one `Date.now()` epoch. rrweb timestamps are shifted to the same clock at export.
- **One MediaRecorder per chunk.** Each ~30 s chunk is its own recorder run, so every file is a standalone WebM. Timeslice chunks aren't: only the first has the header.
- **Transcription.** Whisper on OpenRouter with `verbose_json` and word timestamps (`gpt-4o-transcribe` rejects that format). Chunks are transcribed as they are saved, and Export fills in any gaps. Word time = chunk start + seconds × 1000, after an energy VAD (`lib/transcribe/vad.ts`, run in the offscreen document per chunk) moves word edges out of silence.
- **No screenshots or video.** The replay can rebuild any moment, so the bundle stays small and the agent asks for visuals only when it needs them.

## Known limits

- rrweb doesn't replay video or cross-origin iframes. Canvas replays only with the canvas setting (2 fps).
- Pointing is the mouse position. There is no "mark this element" hotkey.
- Images and fonts in the replay load from the original server.

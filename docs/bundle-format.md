# Bundle format

What Blook exports, file by file and field by field. Format version **1** (`session.json` `.version`). The agent skill is written from this doc, so it stays exact. The code that writes it is `lib/export/bundle.ts` and `lib/export/timeline.ts`.

The export is a ZIP with one folder, `blook-<sessionId>/`. All paths below are relative to that folder.

## Clock rules

- Every `t` and `endT` in every file is an **integer number of ms since the session start**. The session start is `session.json` `.startedAt`, a Unix time in ms taken when Record was pressed.
- Absolute time = `startedAt + t`. `session.json` also has `startedAtIso`.
- rrweb events keep the rrweb field name `timestamp`, and it uses the same clock: ms since start, not Unix time.
- `durationMs` is always `endT - t` of the same record. It's left out when `endT` is unknown, for example a request still in flight at Stop or a socket that never closed.
- Transcript times use the same clock: speech at `t` lines up with clicks, requests and DOM changes at `t`.
- `t` values from different sources are comparable to a few ms. Network and WebSocket times come from Chrome's network clock, console times from the page's wall clock, rrweb times from the page's `Date.now()`, and mic times from the offscreen document's `Date.now()`.
- Records at `t < 0` don't exist. The tab is reloaded at Record, so the page starts at about `t = 0`.

## Ids and references

| Thing | Id field | Unique within | Where |
|---|---|---|---|
| HTTP request | `id` (string, the CDP requestId) | the session | `network.json` |
| WebSocket | `id` (string, the CDP requestId of the handshake) | the session | `websockets.json` |
| WebSocket frame | `index` (0-based, per socket, in `t` order) | its socket | `websockets.json` `.frames` |
| Console entry | `index` (0-based position in the array) | the session | `console.json` |
| Transcript segment | `index` (0-based position in the array) | the session | `transcript.json` `.segments` |
| rrweb event | position in its tab's `events` (0-based) | its tab | `rrweb.json` `.tabs[] | select(.tabId == T) | .events` |
| Tab | `tabId` (Chrome tab id, number) | the session | `session.json` `.tabs` |

- A redirect reuses the CDP requestId. Each earlier hop gets its own record with id `<requestId>#redirect<N>`, where N = 1, 2, ….
- `console.json[i].index == i` and `transcript.json.segments[i].index == i`, so `.[i]` and `select(.index == i)` give the same record.

## Files

```
session.json                  entry point: meta, counts, mic outcome, files map
timeline.json                 every event in one array sorted by t, with refs
rrweb.json                    rrweb events per tab (DOM replay source of truth)
network.json                  HTTP requests, with kept bodies inline
websockets.json               WebSocket connections with their frames, payloads inline
console.json                  console calls, uncaught exceptions, browser log entries
transcript.json               narration: segments with words
audio/chunks.json             mic chunk index (only when there is audio)
audio/NNN.webm                raw mic audio, WebM/Opus, 20 to 40 s each, cut at pauses
```

Every file except `audio/chunks.json` and `audio/*.webm` is always present, even when empty (`[]`). `rrweb.json` is present when the page was recorded. `session.json` `.files` lists exactly the files and folders in this bundle.

JSON files are pretty-printed, except `rrweb.json`, which is one line.

## session.json

The entry point. Read it first.

| Field | Type | Meaning |
|---|---|---|
| `format` | `"blook-bundle"` | Constant. |
| `version` | number | Bundle format version. `1` for this doc. |
| `id` | string | Session id, `YYYY-MM-DD_HH-MM-SS` in local time at Record. |
| `url` | string | URL of the recorded tab at Record. |
| `title` | string? | Tab title at Record. |
| `status` | `"stopped"` \| `"recording"` | `"recording"` only if the extension died mid-session. |
| `startedAt` | number | Unix ms at Record. The zero point of every `t`. |
| `startedAtIso` | string | `startedAt` as ISO 8601 UTC. |
| `endedAt` | number? | Unix ms at Stop. |
| `t` | `0` | The session start on the session clock. |
| `endT` | number? | The session end (`= durationMs`). |
| `durationMs` | number? | `endedAt - startedAt`. |
| `exportedAt` | string | ISO time of the export. |
| `clock` | string | The clock rule in one sentence. |
| `firstSnapshotT` | number? | `t` of the first rrweb full snapshot of the first tab. Before this there is no DOM. It can come while the page is still loading, so the DOM may be an empty shell at first. Missing if the page was never captured. |
| `pageReadyT` | number? | `t` when the Record reload of the first tab fired its load event (scripts loaded, app booting). From here the page normally shows real content. If no load event came within 30 s, it's the time Blook gave up waiting. |
| `tabs` | `{ tabId, t, url, openerTabId? }[]` | Tabs in the session. `[0]` is the recorded tab. The others were opened from a session tab; `t` is when they joined. |
| `navigations` | `{ tabId, t, url }[]` | URL changes of session tabs, including SPA `pushState` changes, in `t` order. `[0]` is the start URL at `t = 0`. |
| `settings` | `{ mask, mic, canvas }` (booleans) | Settings in effect. `mask`: inputs and marked text were masked. `mic`: the mic was on. `canvas`: canvas content was recorded at 2 fps. |
| `mic` | `{ state, error?, chunks? }` | What happened to the mic. After Stop, `state` is `"off"` (setting off), `"stopped"` (recorded fine) or `"failed"` (no or partial audio: see `error`). A bundle built while recording (the Replay page) can show `"starting"`, `"recording"` or `"needs-permission"`. `chunks` is the number of saved audio files, set at Stop. |
| `transcript` | `{ status, note?, source? }` | Same as the top of `transcript.json`. |
| `counts` | object | `rrwebEvents`, `timeline`, `requests`, `failedRequests`, `webSockets`, `webSocketFrames`, `console`, `errors` (console entries with level `error`, minus Chrome's `[network]` failed-resource lines; equals the number of timeline `error` entries), `audioChunks`, `transcriptSegments`. |
| `files` | `{ [path]: string }` | Every file or folder in the bundle, with a one-line description. Folder keys end with `/`. |

Example (shortened):

```json
{
  "format": "blook-bundle",
  "version": 1,
  "id": "2026-11-03_19-09-02",
  "url": "http://localhost:4791/",
  "title": "Blook test",
  "status": "stopped",
  "startedAt": 1793732942100,
  "startedAtIso": "2026-11-03T19:09:02.100Z",
  "endedAt": 1793732954973,
  "t": 0,
  "endT": 12873,
  "durationMs": 12873,
  "exportedAt": "2026-11-03T19:09:05.000Z",
  "clock": "Every t, endT and rrweb timestamp in this bundle is integer ms since startedAt (Unix ms). Absolute time = startedAt + t.",
  "firstSnapshotT": 57,
  "pageReadyT": 4060,
  "tabs": [{ "tabId": 1653097249, "t": 0, "url": "http://localhost:4791/" }],
  "navigations": [{ "tabId": 1653097249, "t": 0, "url": "http://localhost:4791/" }],
  "settings": { "mask": false, "mic": true, "canvas": true },
  "mic": { "state": "stopped", "chunks": 1 },
  "transcript": { "status": "skipped", "note": "skipped: no OpenRouter API key set" },
  "counts": { "rrwebEvents": 61, "timeline": 33, "requests": 7, "failedRequests": 1, "webSockets": 1, "webSocketFrames": 5, "console": 9, "errors": 3, "audioChunks": 1, "transcriptSegments": 0 },
  "files": {
    "session.json": "This file: session meta, counts, mic outcome and this map. Read it first.",
    "timeline.json": "Every event in one array sorted by t (…); ref points into the detail files.",
    "rrweb.json": "rrweb events per tab ({ tabs: [{ tabId, url, events }] }, timestamp = ms since start, one line); …"
  }
}
```

## timeline.json

One array of entries sorted by `t` (ties keep source order). It's the file to scan first. Each entry is small and points to its full record with `ref`.

Common fields on every entry:

| Field | Type | Meaning |
|---|---|---|
| `t` | number | When it happened (start, for things with a duration). |
| `type` | string | One of the types below. |
| `tabId` | number? | Tab it happened in. Missing on `speech`. |
| `summary` | string | One human-readable line, for example `Click button "Save" #save`. |
| `ref` | object? | Where the full record is. Its `file` field is a bundle path; the other fields say which record (see each type). |

Optional fields are left out when they don't apply. They are never `null`.

| `type` | Extra fields | `ref` |
|---|---|---|
| `navigation` | `url` | `{ file: "session.json", navigation: i }`: index into `.navigations` |
| `page-ready` | none | `{ file: "session.json", field: "pageReadyT" }`. The recorded page finished its first load (see `pageReadyT`). |
| `tab-open` | `url`, `openerTabId` | `{ file: "session.json", tab: i }`: index into `.tabs` |
| `snapshot` | `url?` | `{ file: "rrweb.json", tabId, event: i }`. A full DOM snapshot (page load or rrweb re-snapshot). The DOM is replayable from here. |
| `click` | `target`, `nodeId`, `x`, `y`, `double?` | `{ file: "rrweb.json", tabId, event: i }`. `x`/`y` are viewport CSS px. `nodeId` is the rrweb node id. `target` describes the element (tag, accessible name, `#id` or `.class`). |
| `input` | `target`, `nodeId`, `value` or `checked`, `endT` | rrweb ref to the **last** input event of the burst. Typing into one field with gaps under 5 s is one entry. `value` is the final text (at most 200 chars; masked as `*` when `mask` was on). Checkboxes and radios have `checked` (boolean) instead of `value`, and the summary says `checked` or `unchecked`. Only user input is listed: programmatic value and checked changes (the app rendering form state, radios unchecked because a sibling was picked) and nodes rrweb never serialized (id -1) are dropped, using rrweb's `userTriggered` flag. The raw events, programmatic ones included, stay in the rrweb file. |
| `scroll` | `target`, `nodeId`, `x`, `y`, `endT` | rrweb ref to the **first** scroll event. Scrolls of one element with gaps under 1 s are one entry; `x`/`y` are the final scroll offset. `target` is `document` for the page. |
| `request` | `method`, `url`, `status?`, `resourceType?`, `endT?`, `durationMs?` | `{ file: "network.json", requestId }`. Every HTTP request that didn't fail. |
| `request-failed` | as `request`, plus `errorText?` | Same. The request had a network error (not a cancel) or HTTP status ≥ 400. |
| `ws-open` | `url`, `socketId`, `status?` | `{ file: "websockets.json", socketId }` |
| `ws-close` | `url`, `socketId` | Same. `t` is when the socket closed. |
| `ws-frame` | `socketId`, `direction` (`"sent"` \| `"received"`), `count`, `bytes`, `endT`, `preview` | `{ file: "websockets.json", socketId, frame, frameEnd }`. A group of `count` frames of one socket and one direction within 1 s of the group's first frame. `frame`..`frameEnd` (inclusive) are frame indexes. `preview` is the first frame's payload as text (JSON re-serialized) cut to 120 chars, or `<binary N B>`. |
| `console` | `level`, `source` | `{ file: "console.json", index }`. Console entries with level `log`, `info`, `warn` or `debug`. |
| `error` | `level`, `source` | Same. Level `error`: `console.error`, uncaught exceptions and browser errors. Chrome's `[network] Failed to load resource` lines are skipped, because the request already has a `request-failed` entry. |
| `speech` | `text`, `endT` | `{ file: "transcript.json", segment: i }` |

Mouse movement is not in the timeline. It's in the rrweb file (incremental source 1), and the replay tool answers "where was the pointer at t".

Example entries:

```json
[
  { "t": 0, "type": "navigation", "tabId": 1653097249, "summary": "Navigate to http://localhost:4791/", "url": "http://localhost:4791/", "ref": { "file": "session.json", "navigation": 0 } },
  { "t": 57, "type": "snapshot", "tabId": 1653097249, "summary": "DOM snapshot: http://localhost:4791/", "url": "http://localhost:4791/", "ref": { "file": "rrweb.json", "tabId": 1653097249, "event": 1 } },
  { "t": 8056, "type": "click", "tabId": 1653097249, "summary": "Click button \"Load data\" #go", "target": "button \"Load data\" #go", "nodeId": 22, "x": 196, "y": 223, "ref": { "file": "rrweb.json", "tabId": 1653097249, "event": 30 } },
  { "t": 8063, "type": "request-failed", "tabId": 1653097249, "summary": "GET /api/fail → 500 (1 ms)", "method": "GET", "url": "http://localhost:4791/api/fail", "status": 500, "resourceType": "Fetch", "endT": 8064, "durationMs": 1, "ref": { "file": "network.json", "requestId": "64397.24" } },
  { "t": 5079, "type": "ws-frame", "tabId": 1653097249, "summary": "WebSocket received: {\"tick\":0,\"at\":1793732947150}", "socketId": "64397.20", "direction": "received", "count": 1, "bytes": 30, "endT": 5079, "preview": "{\"tick\":0,\"at\":1793732947150}", "ref": { "file": "websockets.json", "socketId": "64397.20", "frame": 2, "frameEnd": 2 } },
  { "t": 12000, "type": "speech", "summary": "🗣 \"This button does nothing\"", "text": "This button does nothing", "endT": 13400, "ref": { "file": "transcript.json", "segment": 3 } }
]
```

## rrweb.json

`{ "tabs": [{ "tabId": number, "url": string?, "events": [...] }] }`, one entry per recorded tab in the order the tabs were opened (as in `session.json` `.tabs`); usually one. `url` is the tab's URL when it joined the session.


Each `events` is the rrweb event array of one tab, sorted by `timestamp`, in [rrweb's event format](https://github.com/rrweb-io/rrweb/blob/master/docs/recipes/index.md) (`@rrweb/types` `eventWithTime`), with one change: **`timestamp` is ms since session start**. The viewer and the replay CLI use it directly. Only top-frame events are kept; rrweb folds cross-origin iframes into them.

Event `type`: 0 DomContentLoaded, 1 Load, 2 FullSnapshot, 3 IncrementalSnapshot, 4 Meta (`data.href`, `data.width`, `data.height`), 5 Custom, 6 Plugin. Incremental `data.source`: 0 Mutation, 1 MouseMove, 2 MouseInteraction (`data.type` 2 = Click, 4 = DblClick), 3 Scroll, 4 ViewportResize, 5 Input, 8 StyleSheetRule (`insertRule`/`deleteRule`), 9 CanvasMutation (only when `settings.canvas`), 15 AdoptedStyleSheet. The recorder runs in the page's own JavaScript world, so CSS-in-JS rules and canvas calls are captured.

Notes:
- The first full snapshot can arrive while the page is still parsing (at `firstSnapshotT`). The rest of the page then comes in as mutations, so the replay at `t` shows what the user saw at `t`.
- Canvas content (`settings.canvas`) is recorded as 2 fps WebP snapshots. To replay it, the replayer needs `UNSAFE_replayCanvas: true`.
- `timeline.json` `ref.event` is an index into the `events` of tab `ref.tabId`.

## network.json

Array of HTTP requests sorted by `t`. `data:` and `blob:` URLs are not recorded. WebSocket handshakes are in `websockets.json`.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | CDP requestId (see [Ids](#ids-and-references)). |
| `tabId` | number | Tab that made it. |
| `t` | number | Request sent. |
| `endT` | number? | Finished or failed. Missing if still in flight at Stop. |
| `durationMs` | number? | `endT - t`. |
| `method` | string | HTTP method. |
| `url` | string | Full URL, including any fragment. |
| `resourceType` | string? | CDP type: `Document`, `Stylesheet`, `Image`, `Script`, `XHR`, `Fetch`, `WebSocket`, `Font`, `Other`, …. |
| `status`, `statusText` | number?, string? | HTTP status. Missing when no response arrived. |
| `mimeType` | string? | Response MIME type from Chrome. |
| `failed` | boolean | `true` when `errorText` is set (and isn't a cancel) or `status >= 400`. |
| `errorText` | string? | Network error, e.g. `net::ERR_CONNECTION_REFUSED`, or `canceled (…)`. Cancels don't count as failed. |
| `socketId` | string? | Set when this request is a WebSocket handshake that also appears in `websockets.json` (usually it doesn't, because CDP reports handshakes only as socket events). |
| `requestHeaders` | `{ [name]: string }` | Request headers as Chrome sent them. |
| `responseHeaders` | `{ [name]: string }`? | Response headers. |
| `requestBody` | any? | Request body (POST data). Parsed JSON when `requestBodyEncoding` is `json`, else a string. Always kept when the request had one. |
| `requestBodyEncoding` | `"json"` \| `"text"`? | `json`: the `Content-Type` is JSON, the body parsed, and it wasn't cut. `text`: anything else. |
| `requestBodySize` | number? | Request body size in UTF-8 bytes, before any cut. |
| `requestBodyTruncated` | `true`? | The body was cut at 1 MB (1,000,000 bytes) during capture. It's then always a `text` string. |
| `responseBody` | any? | Response body, when kept (see below). Parsed JSON when `responseBodyEncoding` is `json`, a string otherwise. |
| `responseBodyEncoding` | `"json"` \| `"text"` \| `"base64"`? | `json`: `mimeType` contains `json`, the body parsed, and it wasn't cut. `text`: other text, including HTML or XML. `base64`: binary, as Chrome sent it. |
| `responseBodySize` | number? | Decoded response size in bytes, before any cut. Present for dropped bodies too, when Chrome reported data. |
| `responseBodyTruncated` | `true`? | The body was cut at 1 MB during capture (a `text` or `base64` prefix). |
| `responseBodyNotKept` | string? | Why there's no `responseBody`, e.g. `static resource (Script)`, `page load (Document) that did not fail`, `static asset (image/png)`. |

Which response bodies are kept (one rule, `lib/capture/body-policy.ts`):

- Kept: API calls, meaning `resourceType` `XHR`, `Fetch` or `EventSource`, whatever the content type (JSON, XML, text, or HTML such as htmx fragments or a proxy's 502 page). `Other`, `Ping`, `Preflight`, `CSPViolationReport` and a missing type count as API calls too, unless `mimeType` is an image, font, audio or video.
- Kept: a `Document` (page load) with `status >= 400`.
- Not kept: everything else the browser loads by itself: `Document` that didn't fail, `Script`, `Stylesheet`, `Font`, `Image`, `Media`, `Manifest`, `TextTrack`, `Prefetch`, …. These keep `url`, `method`, `status`, headers, timing, `mimeType` and `responseBodySize`, plus `responseBodyNotKept`. There is no hash of them.

Without `responseBody` and without `responseBodyNotKept`, there was no body: the request failed or was still running at Stop, or Chrome had none to give (204, redirect, evicted, or the tab navigated away).

`network.json` can be large, since it holds every kept body. Query it with jq; don't read it whole.

Example:

```json
{
  "id": "64397.23",
  "tabId": 1653097249,
  "t": 8058,
  "endT": 8061,
  "durationMs": 3,
  "method": "GET",
  "url": "http://localhost:4791/api/big",
  "resourceType": "Fetch",
  "status": 200,
  "statusText": "OK",
  "mimeType": "application/json",
  "failed": false,
  "requestHeaders": { "Accept": "*/*", "User-Agent": "Mozilla/5.0 …" },
  "responseHeaders": { "content-type": "application/json", "Content-Length": "8191" },
  "responseBody": { "items": [{ "id": 1, "name": "first" }], "total": 1 },
  "responseBodyEncoding": "json",
  "responseBodySize": 8191
}
```

## websockets.json

Array of WebSocket connections sorted by `t`. Each has all its frames, with every payload inline, so the file can be large: query it with jq.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Socket id: the CDP requestId of the handshake. |
| `requestId` | string | Same value as `id`. It links to `network.json` records whose `socketId` equals it, if any exist. |
| `tabId` | number | Tab that opened it. |
| `url` | string | `ws://` or `wss://` URL. |
| `t` | number | Socket created. |
| `endT` | number? | Socket closed. Missing if it was still open at Stop. |
| `durationMs` | number? | `endT - t`. |
| `status` | number? | Handshake HTTP status (101 when it worked). |
| `requestHeaders`, `responseHeaders` | object? | Handshake headers. |
| `frameCount`, `sentCount`, `receivedCount` | number | Frame counts: all, sent by the page, received by the page. |
| `frames` | Frame[] | All frames in `t` order. |

Frame fields:

| Field | Type | Meaning |
|---|---|---|
| `index` | number | 0-based, per socket. `frames[i].index == i`. |
| `t` | number | When it was sent or received. |
| `direction` | `"sent"` \| `"received"` | `sent` = page to server. |
| `opcode` | number | 1 text, 2 binary. |
| `size` | number | Payload size in bytes (decoded for binary), before any cut. |
| `payload` | any | The payload, always inline. Parsed JSON when `payloadEncoding` is `json`, else a string. |
| `payloadEncoding` | `"json"` \| `"text"` \| `"base64"` | `json`: a text frame that starts with `{` or `[`, parsed, and wasn't cut. `text`: any other text frame. `base64`: a binary frame, as Chrome sent it. |
| `truncated` | `true`? | The payload was cut at 1 MB (1,000,000 bytes) during capture, like HTTP bodies. It's then a `text` or `base64` prefix. |

Example:

```json
{
  "id": "64397.20",
  "requestId": "64397.20",
  "tabId": 1653097249,
  "url": "ws://localhost:4791/ws",
  "t": 4061,
  "endT": 8073,
  "durationMs": 4012,
  "status": 101,
  "requestHeaders": { "Upgrade": "websocket", "Origin": "http://localhost:4791" },
  "responseHeaders": { "Upgrade": "websocket", "Connection": "Upgrade" },
  "frameCount": 5,
  "sentCount": 2,
  "receivedCount": 3,
  "frames": [
    { "index": 0, "t": 4077, "direction": "sent", "opcode": 1, "size": 18, "payload": { "hello": "server" }, "payloadEncoding": "json" },
    { "index": 1, "t": 4078, "direction": "sent", "opcode": 1, "size": 5, "payload": "ping!", "payloadEncoding": "text" },
    { "index": 2, "t": 4079, "direction": "received", "opcode": 2, "size": 4, "payload": "3q2+7w==", "payloadEncoding": "base64" }
  ]
}
```

## console.json

Array of console entries sorted by `t`. Entries from Blook's own scripts (a `chrome-extension://` URL or top stack frame, for example rrweb's canvas readback warning) are left out.

| Field | Type | Meaning |
|---|---|---|
| `index` | number | 0-based position in this array. |
| `tabId` | number | Tab. |
| `t` | number | When it was logged. |
| `source` | `"console"` \| `"exception"` \| `"log"` | `console`: a `console.*` call. `exception`: an uncaught exception or unhandled rejection. `log`: a browser log entry (network errors, violations, security, …); its `text` starts with `[<source>]`, e.g. `[network]`. |
| `level` | `"log"` \| `"debug"` \| `"info"` \| `"warn"` \| `"error"` | Severity. `console.assert` and `console.error` map to `error`. |
| `text` | string | The message, with arguments rendered roughly like DevTools does: objects as `{key: value}`, arrays as `Array(n) [ … ]`. |
| `url`, `line`, `column` | string?, number?, number? | Source location, 1-based. |
| `stack` | string? | Stack trace, one `    at fn (url:line:col)` per line. Present for errors, exceptions, `console.trace` and `console.assert`. |

`console.json` keeps Chrome's `[network] Failed to load resource` lines (`source: "log"`, level `error`). They are left out of `timeline.json` and of `counts.errors`, because each one repeats a failed request in `network.json`.

Example:

```json
{
  "index": 9,
  "tabId": 1653097249,
  "t": 8066,
  "source": "exception",
  "level": "error",
  "text": "Error: Boom from test page",
  "url": "http://localhost:4791/",
  "line": 28,
  "column": 44,
  "stack": "    at <anonymous> (http://localhost:4791/:28:44)"
}
```

## transcript.json

The narration. It's always present; check `status` first.

The audio in `audio/` is the source; the transcript is one run of speech-to-text over it, and can be re-run. The extension transcribes with OpenRouter while recording when an API key is set. `blook transcribe <bundle>` fills it in or re-runs it later, with OpenRouter or locally with whisper.cpp, and rewrites this file, the `speech` entries of `timeline.json`, and `session.json` `.transcript`, `.counts` and `.files`. A bundle holds one transcript, and `source` says how it was made.

| Field | Type | Meaning |
|---|---|---|
| `status` | `"ok"` \| `"partial"` \| `"pending"` \| `"none"` \| `"skipped"` \| `"failed"` | `ok`: every audio chunk was transcribed. `partial`: some chunks failed (see `errors`) or were left out (no API key for the rest); what was transcribed is here. `pending`: transcription is still running (only in a bundle built while it ran, e.g. the Replay page during or right after recording); the segments so far are here. `none`: there's no audio (see `note`, and `session.json` `.mic`). `skipped`: there's audio but no OpenRouter API key was set, so `audio/` has the raw files: run `blook transcribe`. `failed`: transcription failed (see `note`). |
| `note` | string? | Why, for any status other than `ok`. |
| `source` | object? | How the transcript was made (missing when nothing was transcribed): `method` (`"openrouter"` or `"whisper.cpp"`), `model` (the OpenRouter model id, e.g. `openai/whisper-large-v3`, or the ggml model name, e.g. `base.en`), `by` (`"extension"` while recording, `"cli"` for `blook transcribe`), `at` (ISO time of the run; for the extension, when its last chunk was transcribed) and `blookVersion`. |
| `errors` | `{ chunk, t, error }[]`? | Chunks that failed: audio chunk index, its start `t`, and the error. |
| `segmentCount`, `wordCount` | number | Totals. |
| `segments` | Segment[] | Sorted by `t`. |

Segment fields: `index` (0-based, `segments[i].index == i`), `t`, `endT`, `durationMs`, `text`, and `words`. Each word is `{ word, t, endT }`. A word belongs to the segment it starts in, or else to the last segment that started before it. All times are session ms, converted as `chunk.t + seconds × 1000`, the same way for every `source`. When the chunk has `voiced` ranges (see [audio/](#audio)), word and segment boundaries that the model put in silence are moved to the nearest voiced edge first: a start in silence moves to the next voiced range, an end in silence back to the previous one, and the first word of a voiced range that starts within 0.8 s of its onset moves to the onset. That fixes the first word of a chunk spanning the leading silence, and late word starts after a pause. Inside continuous speech, word times stay as loose as the model's (about ±0.3 s with Whisper). With `whisper.cpp`, words come from DTW token times. Words can carry punctuation (`"loading."`).

Example:

```json
{
  "status": "ok",
  "source": { "method": "openrouter", "model": "openai/whisper-large-v3", "by": "extension", "at": "2026-11-03T19:09:04.512Z", "blookVersion": "0.1.4" },
  "segmentCount": 1,
  "wordCount": 4,
  "segments": [
    {
      "index": 0,
      "t": 12000,
      "endT": 13400,
      "durationMs": 1400,
      "text": "This button does nothing",
      "words": [
        { "word": "This", "t": 12000, "endT": 12210 },
        { "word": "button", "t": 12210, "endT": 12560 },
        { "word": "does", "t": 12560, "endT": 12800 },
        { "word": "nothing", "t": 12800, "endT": 13400 }
      ]
    }
  ]
}
```

## audio/

Only present when the mic recorded something. `audio/NNN.webm` are standalone WebM/Opus files (32 kbit/s). A chunk ends at the first pause (0.4 s below the voice level) after 20 s, or at 40 s, so words are rarely split across files; without a live mic level it ends at 30 s. The last one is shorter and ends at Stop. `audio/chunks.json` indexes them:

```json
[{ "index": 0, "t": 127, "endT": 12867, "durationMs": 12740, "voiced": [[5167, 5707], [6787, 11127]], "mimeType": "audio/webm;codecs=opus", "size": 50026, "file": "audio/000.webm" }]
```

Fields: `index`, `t`, `endT`, `durationMs`, `voiced?`, `mimeType`, `size` (bytes) and `file`. `t` is when that chunk's recorder started. A word at `s` seconds into the file is at session time `t + s × 1000`. `voiced` (missing when the audio didn't decode) lists `[t, endT]` ranges in session ms where the chunk has speech-level energy, from a simple energy detector run when the chunk was saved. Outside them the mic was quiet.

## jq recipes

```sh
jq -c '.[] | select(.type == "error" or .type == "request-failed")' timeline.json     # what went wrong
jq -c '.[] | select(.t >= 10000 and .t <= 15000) | [.t, .type, .summary]' timeline.json  # a window
jq '.[] | select(.id == "64397.23")' network.json                                       # one request
jq -c '.[] | {url, frames: [.frames[] | {t, direction, payload}]}' websockets.json     # socket traffic
jq -r '.segments[] | "\(.t)\t\(.text)"' transcript.json                                # narration
```

# Messaging

What Blook is for, who it's for, and what a film may say about it. Films pick from here; `BRIEF.md` has the brand and the real example to show it with. Every claim below is true today; the "Proof" lines name what to put on screen.

## The idea, in one line

**A browser session anyone can replay exactly: the real page, everything under it, and what you said, in one small ZIP.**

Shorter lines, for titles: "Record your browser while you talk." · "Not a video. The real page." · "Everything on one clock." · "One ZIP. Any agent can read it."

## Five pillars

### 1. Talk, don't type

You narrate while you use the app: walk a flow, point with the mouse, say what's wrong. Nobody writes steps to reproduce. The narration is transcribed word by word, and every word sits on the same clock as the clicks.

- Proof: the spoken line appears word by word while the cursor clicks; in the timeline the speech row sits right above the click it describes.
- Facts: transcription with your own OpenRouter key, or later on your machine with whisper.cpp. Without either, the ZIP keeps the audio.

### 2. The real page, not a video

The recording is a DOM replay (rrweb): real elements, real styles, real text. At any moment you can see which elements were on the page and which weren't, what changed after a click, and how it looked. It still plays like a video: play, pause, scrub, change the speed.

- Proof: scrub the replay, pause, and the page is still a page (an element outlined with its tag and classes); or the page splitting into its layers. `blook dom` and `blook screenshot` at a time T.
- Facts: CSS and CSS-in-JS rules, scrolls and inputs are recorded; canvas at 2 fps when turned on. No screenshots or video are stored: the page is rebuilt.
- Don't say: "pixel-perfect", "inspect with DevTools" (not shown in the viewer).

### 3. Everything under the page, on one clock

Console logs and errors, every HTTP request with its request and response bodies (API responses are kept), WebSocket connections with every frame, clicks, inputs, scrolls, navigations and tabs opened from the recorded tab. All on one clock, so cause and effect line up: this click, this request, this 404, this console error, this sentence.

- Proof: the four lanes (voice, page, network, console) and a playhead stopping where they line up: click 0:12.9, `GET /todos/sync-missing → 404` and `Sync failed: 404` at 0:13.0. The Network tab with a response body; the WebSockets tab with frames.

### 4. One small, local ZIP

On Stop you get one ZIP: JSON files and the audio. It stays on your computer: no account, no upload, no tracking. Attach it to a bug ticket, send it in chat, drop it in a repo. A teammate opens it in the extension's Replay page or the web viewer, which also uploads nothing. An option masks typed text and page text.

- Proof: the file list (`session.json`, `timeline.json`, `rrweb.json`, `network.json`, `websockets.json`, `console.json`, `transcript.json`, `audio/`); the ZIP landing in a ticket.
- Don't say: a size in MB, "tiny", or "x times smaller than a video" (no measured number yet). "Small" is fine because there's no video in it.
- A ticket can look like a generic issue tracker. Don't show the Jira logo or UI.

### 5. Made for AI agents

An agent reads the ZIP with the `blook` skill (jq over plain JSON) and the `blook` CLI, which replays the page and answers what the page looked like, its DOM, and what the mouse was over at any moment. The agent reads only what it needs, not hours of video frames.

- Proof: a terminal running `blook pointer` / `blook screenshot` / `blook dom` at `00:18.5`, and the agent naming the failing request.
- Don't say: "fixes bugs automatically", "100% reproducible", or any time saved.

## Who it's for, and what they do with it

| Who | The job | What they get from the ZIP |
| --- | --- | --- |
| A developer with an AI agent | Report a bug | The agent reads what you said, what you clicked, which request failed and what the console printed at that moment |
| QA and testers | File a bug anyone can replay | The ticket holds the whole session, not a description and a screenshot |
| A developer writing E2E tests | Turn a narrated flow into a test | The steps, the elements used, and the responses to assert on |
| A backend developer | Write backend tests from real frontend traffic | Every API call and WebSocket frame the frontend made, with bodies, in order |
| Anyone joining a codebase | See how a frontend talks to its API | The same requests and frames, next to the clicks that caused them |

The first is the headline. The rest show that it's one tool for many jobs: a montage beat, not a film each.

## The Chrome Web Store intro

A YouTube link on the store listing, 16:9, the first moving thing a visitor sees. They already know it's a Chrome extension; they want to know what it does and whether it's for them.

- Length: about 45 to 50 s. Frame 0 is the thumbnail: the idea in words, with the recording dot.
- One thing on screen at a time: a short title alone, then one shot. Calm, eased motion.
- The red recording dot is a blinking recording light, not a carrier that flies between beats.
- Music and sound effects support it, but the words on screen still carry it.

The beats, as built in `films/store-intro` (its `SPEC.md` has the timings):

1. **Intro.** "Record your browser while you talk", then the side panel: Start recording, and the card turns live.
2. **Record.** The camera pulls back to a Chrome window: TodoMVC with Blook docked beside it. The spoken line grows as a subtitle under the window, the cursor ticks a todo, then Stop recording and download from "Recordings (1)". The ZIP flies out.
3. **One ZIP.** "One ZIP holds it all": it unzips into six tiles (your voice, the page, every click, network, WebSockets, console).
4. **Replay.** "Full replay. Not a video.": a viewer window, the ticked row outlined, its class flipping as the playhead scrubs.
5. **Timeline.** "Everything on one timeline": the click, the 404 and the console error line up at 0:13.0, with a callout, "The bug, caught".
6. **End card.** The logo, "Full browser replay, with audio transcription", free and open source.

# Blook marketing films: shared brief

Every film is a HyperFrames project in `films/<film>/`. Rendered files go to `out/<film>.mp4`. Commands are in `README.md`. Read this brief before building, and take every claim from it or from the sources it names.

## The product, in its own words

Blook is a Chrome extension that records what happens in your browser while you talk, so a person or a coding agent can replay it later.

- Tagline on the site: **"Record your browser while you talk."**
- Promo tile line: **"Narrated browser recordings for coding agents"**
- Press Record in the side panel, use your web app, and narrate: walk through a flow, point with the mouse, describe a bug. Press Stop and get one ZIP file.
- A recording holds: a DOM replay of the page (mouse moves, clicks, scrolls, typing), HTTP requests and responses, WebSocket messages, console logs and errors, and your voice transcribed word by word. All on **one shared clock**.
- **There is no video.** The replay rebuilds the page at any moment, so recordings stay small and an agent asks for a screenshot only when it needs one.
- Two readers: a person opens the ZIP in the Replay page (replay, timeline, transcript, network, WebSockets, console in sync), for example from a Jira ticket. A coding agent reads it with the `blook` skill (jq over JSON) and the `blook` CLI (`blook screenshot`, `blook pointer`, `blook dom` at any time T).
- Typical uses: report a bug to an AI coding agent; let an agent write an end-to-end test from a narrated flow; attach a recording to a bug ticket.
- Local first: records only the tab you start it on (and tabs opened from it), only between Record and Stop. Recordings stay on your computer. No account, no analytics, no tracking. Transcription is optional (your own OpenRouter key, or locally later with whisper.cpp). An option masks typed text and page text.
- Free and open source, Chrome only: https://github.com/cyrillbrito/blook. Website: https://cyrillbrito.github.io/blook/
- Install: `curl -fsSL https://raw.githubusercontent.com/cyrillbrito/blook/main/install.sh | sh`

Sources to quote from: `../../README.md`, `../../packages/site/src/pages/index.astro`, `../../store/listing.md`, `../../skills/blook/SKILL.md`, `../../docs/bundle-format.md`. Do not invent numbers (sizes, speed-ups, user counts). Do not name or mock competitors.

## The canonical example (use it, it's real)

The site and store screenshots use one recording of the public TodoMVC demo (`demo.playwright.dev/todomvc`). Its real timeline lines:

```
0:11.8  speech          I tick "Write the release notes" and it should save.
0:12.9  click           Click input[type=checkbox] .toggle
0:13.0  request-failed  GET /todos/sync-missing → 404 (153 ms)
0:13.0  error           console.error: Sync failed: 404 from /todos/sync-missing
0:14.6  speech          It looks done, but after a reload it is gone again.
```

Todo items in that recording: "Ask the agent to fix the sync error", "Write the release notes", "Record a bug report", "Send the ZIP to the agent". Footer: "2 items left", "All / Active / Completed", "Clear completed".

Agent commands (real, from the site):

```
blook pointer    blook-2026-11-03_21-12-51.zip 00:18.5   # what the mouse was over
blook screenshot blook-2026-11-03_21-12-51.zip 00:18.5   # the page at that moment, as a PNG
blook dom        blook-2026-11-03_21-12-51.zip 00:18.5
blook transcribe blook-2026-11-03_21-12-51.zip
```

Bundle files: `session.json`, `timeline.json`, `rrweb.json`, `network.json`, `websockets.json`, `console.json`, `transcript.json`, `audio/`. Every event has `t`, the milliseconds since Record.

Another real (small, synthetic test) bundle is `../cli/test/fixtures/blook-fixture.zip`, if you need more real JSON.

## Real UI

Never invent product UI. Sources, in `shared/` (symlinks to the real files; link them from a film's `assets/`):

- `screenshot-1-timeline.png` (1280×800): the Replay page. Header "Blook", "React • TodoMVC", "1 errors", "1 failed requests", "Download bundle". Tabs "Timeline 18 / Transcript 0 / Network 7 / WebSockets 0 / Console ✖ 3", a "Follow" toggle, filter chips, timeline rows with type pills, a JSON detail pane, a scrubber with "Play", "0:08.6 / 0:17.2" and a legend "error / failed request / click / navigation / speech".
- `screenshot-2-network.png`, `screenshot-3-console.png`: Network and Console tabs.
- `screenshot-4-sidepanel.png`: the side panel next to TodoMVC: "Blook", "Open bundle…", "● Recording 0:17", "Mic off", "Stop recording", toggles "Microphone / Mask inputs and text / Canvas (2 fps)", "Recordings (1)".
- `replay.png`, `sidepanel-settings.png`: more of the same.
- The live code, to confirm labels and styles: `../../packages/viewer/src/` (panels.tsx, ui.tsx, Viewer.tsx) and `../../packages/extension/entrypoints/sidepanel/`.

You may use a screenshot as a plate, and you may rebuild the one piece a beat uses in HTML (timeline rows, the Record/Stop card, a type pill) at 1.6–2× size, with its real labels, colours and fonts. Ignore the "sidepanel says Mic off / no transcript" detail of the screenshots when the story needs narration: the Transcript tab and speech rows are real features (speech rows are light blue pills, `bg-blue-100 text-blue-800`).

## Brand

- Logo: `shared/icon.svg` (a slate app window with an eye; the iris is vermilion). Wordmark: "Blook" in Inter 700/900, slate-900. Never redraw the logo; use the SVG.
- Neutrals are Tailwind slate (never gray): ink `#0f172a` (slate-900), muted `#64748b` (slate-500), lines `#e2e8f0` (slate-200), surfaces white / `#f8fafc` / `#f1f5f9`. Action colour is slate-700 `#334155`.
- Vermilion `#f2542d` (strong `#cc3f1d`, soft `#fff3f0`) is only for the eye and recording: the record dot, the "Recording" state, the payoff. Ration it.
- Playhead / "now": amber-500 `#f59e0b`, soft `#fffbeb`.
- Errors: red-600 `#dc2626`, rows `bg-red-100 text-red-800`. Clicks: sky (`bg-sky-100 text-sky-800`). Speech: blue (`bg-blue-100 text-blue-800`).
- Type: Inter for UI and titles, JetBrains Mono for code, timestamps and the timeline.
- The product is light: white and slate. Films should feel like it, not like a dark neon tech promo.

## Rules for every film

- Follow the `hyperframes` skill (`.agents/skills/hyperframes/SKILL.md`) and its references for the film's type. A new film: write `STORYLINES.md` (three), pick one, write `SPEC.md`, build, `bun run lint films/<film>`, `bun run snapshot films/<film> --review`, fix P0/P1, `bun run render <film>`, and write `REVIEW.md`. A change to a film: read its `SPEC.md` and `REVIEW.md` first, and update them with it.
- Use the pinned CLI through the `bun run` scripts or `bunx hyperframes`, never `npx hyperframes@latest`.
- Sound: use a free track whose licence allows commercial use (Pixabay is the easiest: no credit needed), and the `media-use` skill's bundled effects. Keep the file in the film's `assets/`, list it with its licence in a `CREDITS.md`, and keep the mix near -16 LUFS. Do not synthesise music.

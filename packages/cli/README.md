# blook

The replay CLI. It looks at an exported Blook bundle at any time `t`: a screenshot, the DOM, or what the mouse was over. It replays `rrweb.json` with `@rrweb/replay` in headless Chromium (Playwright). `blook transcribe` makes or re-runs the bundle's transcript from its audio.

## Run and build

```sh
cd packages/cli                  # after `bun install` at the repo root
bun src/cli.ts info <bundle>     # or node src/cli.ts (Node 23.6+), no build step
bun run test                     # bun test: every command against test/fixtures/blook-fixture.zip (transcribe: a mock OpenRouter; whisper only with whisper-cli and ~/Blook/models/ggml-base.en.bin)
bun run fixture                  # rebuild that fixture from test/make-fixture.ts
bun run build                    # dist/blook: one binary with the Bun runtime, Playwright, the replay assets and the skill
bun run build --target=bun-linux-x64 --outfile dist/blook-linux-x64   # cross-compile
```

The binary has no browser. It uses Playwright's cached `chromium-headless-shell` when its revision matches, else the installed Google Chrome. `blook install-browser` downloads the matching headless shell (honours `PLAYWRIGHT_BROWSERS_PATH`).

## Commands

`blook --help` and `blook <command> --help` are the reference: options, output shapes, examples and exit codes. The design rules are in [docs/cli-design.md](../../docs/cli-design.md); the code is one file per command in `src/commands/`.

`<bundle>` is an exported `.zip`, its unzipped folder, or the folder it was unzipped into. `<t>` is ms since session start (`18036`), seconds (`18.5s`) or `[hh:]mm:ss[.mmm]` (`00:18.5`): the clock of every bundle file. A bare decimal (`3.2`) is refused as ambiguous.

```sh
blook info       <bundle>                                   # duration, tabs, snapshot range, viewport, clicks with targets; no browser
blook pointer    <bundle> <t>
blook dom        <bundle> <t> [--selector css] [--raw]
blook screenshot <bundle> <t> [--out f.png|dir/] [--no-cursor]
blook transcribe <bundle> [--method openrouter|whisper] [--model m] [--force] [--out f.zip|dir]
blook extension [--path] [--no-open]                        # how to load ~/Blook/extension
blook skill install [--copy] [flags] | path | print         # the agent skill
blook install-browser [--force]                             # download Chrome headless shell
blook update                                                # re-run install.sh: latest CLI, extension, skill
```

Replay options: `--tab <id>` (default: the first tab in `session.json`), `--offline` (block http(s), for a dead asset server), `--wait <ms>` (max wait for images and fonts after a seek, default 3000). Global: `-q, --quiet`.

Output is JSON on stdout, except `dom --raw` (HTML) and the setup commands (a path or a guide). Warnings go in a `warnings` array, or to stderr for plain output. Errors go to stderr as `error: <what>` plus a next step, with exit codes 2 usage, 3 not found or invalid, 4 time outside the recording, 5 no browser, 6 network, 7 no speech-to-text, 1 anything else. Times after the end of the recording are errors; times before the first snapshot or after the last event replay the nearest state with a warning.

- `info`: `{ id, durationMs, duration, url, tabs[] }`; each tab has `clicks` with the `target` from `timeline.json`.
- `screenshot`: `{ path, tab, t, replayedT, time, url, viewport, mouse, warnings }`. The PNG is at the recorded viewport size, with a red ring and arrow at the mouse. Default path: a temp file named after session, tab and time.
- `dom`: `{ tab, t, replayedT, time, url, viewport, warnings, html }`. Typed form values are copied into `value`, `checked` and `selected` attributes, and hovered elements carry a `:hover` class. `--selector` returns an array of `outerHTML`s.
- `pointer`: `mouse` (last mouse move, touch, drag or click at or before `t`, with `ageMs` and the rrweb `nodeId`), the `element` under it (through open shadow roots and same-origin iframes), its `ancestry` up to `<body>`, the `selection` (highlighted text at `t` and its element, or `null`), and `nearbyInteractions` within ±1 s. Each element has `tag`, `rrwebId`, `id`, `classes`, `text`, key attributes, `rect` and a CSS-like `path`.
- `transcribe`: `{ path, skipped, status, note?, method, model, segments, words, chunks, errors?, elapsedMs, source }`. Transcribes every audio chunk and rewrites `transcript.json`, the timeline's `speech` entries and `session.json` (`.transcript`, `.counts`, `.files`), in place (a zip through a temp file and a rename) or to `--out`. It skips a bundle whose transcript is already `ok` unless `--force`, and leaves the bundle alone if every chunk fails. The mapping to session ms and the output are the extension's (`@blook/core/transcript`).
  - `--method openrouter` (the default with `OPENROUTER_API_KEY`): the extension's request and model. `BLOOK_OPENROUTER_URL` points it at another endpoint (tests).
  - `--method whisper` (the default without a key, when `whisper-cli` is on PATH): whisper.cpp, local. Install with `brew install whisper-cpp` (macOS, Linuxbrew) or build it; `BLOOK_WHISPER_CLI` overrides the path. The model (`base.en` by default: 148 MB, English, about 2 s for 30 s of audio on an M1; `small.en` is 488 MB and barely better here; use a multilingual one such as `small` for other languages) downloads once to `~/Blook/models` (`BLOOK_MODELS_DIR`). WebM/Opus chunks are decoded to 16 kHz WAV in the same headless Chromium as the replay, so there's no ffmpeg dependency. Word starts are whisper.cpp's DTW token times (`-dtw`), which follow the voice more closely than its default token offsets.
  - Neither available: exit 7, naming both.
- `skill install` runs `npx skills add cyrillbrito/blook --skill blook -g`, which asks which agents to link it into; extra flags go to it (`-a claude-code -y`). With `--copy`, without npx, or without a terminal and flags, it writes the embedded skill to `~/.agents/skills/blook/`.
- `extension` opens `chrome://extensions` only on macOS at a terminal.

`src/index.ts` exports `loadBundle`, `parseTime`, `mouseAt`, `ReplayEngine` and `TabReplay` for use as a library.

## Limits

- Canvas shows only with the Canvas setting (`session.json` `.settings.canvas`), at 2 fps: the last frame at or before `t`. Video is always blank. Cross-origin iframes are empty.
- Images and fonts load from the original server. When it's gone they show as broken; `--offline` skips the wait.
- Mouse positions are rrweb samples (about every 50 ms), not interpolated.

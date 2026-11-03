# blook

The replay CLI. It looks at an exported Blook bundle at any time `t`: a screenshot, the DOM, or what the mouse was over. It replays `rrweb.json` with `@rrweb/replay` in headless Chromium (Playwright), and reads only `session.json` and `rrweb.json`.

## Run and build

```sh
cd cli
bun install
bun src/cli.ts info <bundle>     # or node src/cli.ts (Node 23.6+), no build step
bun run compile                  # type-check
bun run build:bin                # dist/blook: one binary with the Bun runtime, Playwright and the replay assets
bun run build:bin --target=bun-linux-x64 --outfile dist/blook-linux-x64   # cross-compile
```

The binary has no browser. It uses Playwright's cached `chromium-headless-shell` when its revision matches, else the installed Google Chrome. `blook install-browser` downloads the matching headless shell (honours `PLAYWRIGHT_BROWSERS_PATH`).

## Commands

`<bundle>` is an exported `.zip` or its unzipped folder. `<t>` is ms since session start (`18036`), seconds (`18.5s`) or `mm:ss[.mmm]` (`00:18.5`): the clock of every bundle file.

```sh
blook info       <bundle>                                   # tabs, snapshot range, viewport, clicks; no browser
blook screenshot <bundle> <t> [--out f.png] [--no-cursor]    # prints the PNG path
blook dom        <bundle> <t> [--selector css] [--raw]
blook pointer    <bundle> <t>
blook install-browser [--force]                             # download Chrome headless shell
blook skill install [--copy] [flags]                        # the agent skill
blook skill path | print                                    # --copy target | SKILL.md
blook extension [--path] [--no-open]                        # how to load ~/Blook/extension; macOS opens chrome://extensions
blook update                                                # re-run install.sh: latest CLI, extension, skill
blook --version
```

Replay options: `--tab <id>` (default: the first tab in `session.json`), `--offline` (block http(s), for a dead asset server), `--wait <ms>` (max wait for images and fonts after a seek, default 3000).

Output is JSON on stdout, except `screenshot` (the file path) and `dom --raw` (HTML). Warnings go in a `warnings` array, or to stderr for plain output. Errors go to stderr with exit code 1.

- `screenshot`: PNG at the recorded viewport size, with a red ring and arrow at the mouse. Default path: a temp file named after session, tab and time.
- `dom`: `{ t, replayedT, time, url, viewport, warnings, html }`. Typed form values are copied into `value`, `checked` and `selected` attributes, and hovered elements carry a `:hover` class. `--selector` returns an array of `outerHTML`s.
- `pointer`: `mouse` (last mouse move, touch, drag or click at or before `t`, with `ageMs` and the rrweb `nodeId`), the `element` under it (through open shadow roots and same-origin iframes), its `ancestry` up to `<body>`, and `nearbyInteractions` within ±1 s. Each element has `tag`, `rrwebId`, `id`, `classes`, `text`, key attributes, `rect` and a CSS-like `path`.
- `skill install` runs `npx skills add cyrillbrito/blook --skill blook -g`, which asks which agents to link it into; extra flags go to it (`-a claude-code -y`). With `--copy`, or without npx, it writes the embedded skill to `~/.agents/skills/blook/`.

`src/index.ts` exports `loadBundle`, `parseTime`, `mouseAt`, `ReplayEngine` and `TabReplay` for use as a library.

## Limits

- `t` before the first full snapshot shows the first snapshot; `t` after the last event shows the final state. Both add a warning, and `replayedT` says what was shown.
- Canvas shows only with the Canvas setting (`session.json` `.settings.canvas`), at 2 fps: the last frame at or before `t`. Video is always blank. Cross-origin iframes are empty.
- Images and fonts load from the original server. When it's gone they show as broken; `--offline` skips the wait.
- Mouse positions are rrweb samples (about every 50 ms), not interpolated.

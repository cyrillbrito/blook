# blook

Look at an exported Blook bundle at any time `t`: a screenshot, the DOM, or what the mouse was over. It replays `rrweb/<tab>.json` with `@rrweb/replay` in headless Chromium (Playwright). It reads only `session.json` and `rrweb/<tab>.json`.

## Setup

```sh
cd cli
bun install
node src/cli.ts install-browser   # optional: falls back to installed Google Chrome
```

Node 23.6+ runs the TypeScript directly (`node src/cli.ts`); no build step. Bun works too (`bun src/cli.ts`), with the same output.

### Single binary (Bun)

```sh
bun run build:bin                                   # dist/blook, ~75 MB (~32 MB gzipped), Bun runtime included
bun run build:bin --target=bun-linux-x64 --outfile dist/blook-linux-x64   # cross-compile
```

The binary embeds Playwright and the rrweb replay assets, but not a browser. It uses Playwright's cached `chromium-headless-shell` if its revision matches the bundled Playwright, else the installed Google Chrome. Without Chrome, `blook install-browser` downloads the matching headless shell (~100 MB) into Playwright's cache (`PLAYWRIGHT_BROWSERS_PATH` is honoured). `chromium-bidi` is left out (only Firefox/BiDi needs it).

## Commands

`<bundle>` is an exported folder or `.zip`. `<t>` is ms since session start (`18036`), seconds (`18.5s`) or `mm:ss[.mmm]` (`00:18.5`), the same clock as `timeline` and every other bundle file.

```sh
node src/cli.ts info       <bundle>                 # tabs, snapshot range, viewport, clicks (no browser, fast)
node src/cli.ts screenshot <bundle> <t> [--out f.png] [--no-cursor]   # prints the PNG path
node src/cli.ts dom        <bundle> <t> [--selector css] [--raw]
node src/cli.ts pointer    <bundle> <t>
node src/cli.ts skill install [--copy] [flags]   # the agent skill, via `npx skills add cyrillbrito/blook`
node src/cli.ts skill path | print               # --copy target (~/.agents/skills/blook) | SKILL.md
```

`skill install` runs `npx skills add cyrillbrito/blook --skill blook -g` ([Vercel's skills CLI](https://github.com/vercel-labs/skills)), which asks which agents to link it into; extra flags go to it, e.g. `-a claude-code -y`. With `--copy`, or without npx, it writes the skill files embedded in the binary to `~/.agents/skills/blook/`.

Common options: `--tab <id>` (default: first tab in `session.json`), `--offline` (block all http(s) requests, for a dead asset server), `--wait <ms>` (max wait for images and fonts after seeking, default 3000).

Output is JSON on stdout (pipe to `jq`), except `screenshot` (the file path) and `dom --raw` (plain HTML). Warnings go in a `warnings` array, or to stderr for plain output. Errors go to stderr with exit code 1.

- `screenshot`: PNG at the recorded viewport size at `t`, with a red ring and arrow at the mouse position. Default path is a temp file named after session, tab and time.
- `dom`: `{ t, replayedT, time, url, viewport, warnings, html }`. Form values typed at `t` are copied into `value` / `checked` / `selected` attributes. Elements rrweb shows as hovered carry a `:hover` class. `--selector` returns an array of `outerHTML`s.
- `pointer`: `mouse` (last mouse move, touch, drag or click at or before `t`, with `ageMs` and the rrweb `nodeId` it targeted), `element` under that point via `elementFromPoint` in the replay (descends into open shadow roots and same-origin iframes), its `ancestry` up to `<body>`, and `nearbyInteractions` within ±1 s. Each element has `tag`, `rrwebId`, `id`, `classes`, `text`, key attributes (role, aria-*, name, type, href, data-testid, ...), `rect` and a CSS-ish `path`.

Examples:

```sh
B=~/Downloads/blook-2026-11-03_18-55-47.zip
node src/cli.ts info $B | jq '.tabs[0].clicks'
# A small format-2 sample (CSS-in-JS, adopted stylesheet, canvas): /tmp/blook-samples/blook-2026-11-03_19-16-02.zip
node src/cli.ts pointer $B 00:18.036 | jq '{mouse, el: .element.path, text: .element.text}'
node src/cli.ts dom $B 19000 --selector 'button[class*=LegendLabel]' | jq '.html | length'
open "$(node src/cli.ts screenshot $B 00:18.8)"
```

## Library / MCP

`src/index.ts` exports `loadBundle`, `parseTime`, `mouseAt`, `ReplayEngine` and `TabReplay`. There's no MCP server yet. One would keep one `ReplayEngine` and one `TabReplay` per bundle and tab, and call `screenshot(t)`, `dom(t)` and `pointer(t)` repeatedly; seeking an open replay is fast (the CLI pays about 1.5 s per call to start Chromium).

## Known limits

- `t` before the first full snapshot replays the first snapshot; `t` after the last event shows the final state. Both add a warning, and `replayedT` says what was shown.
- Canvas (2D and WebGL) shows only when the bundle was recorded with the Canvas setting (`session.json` `.settings.canvas`). Frames are 2 fps, so `t` shows the last frame at or before it. The CLI draws that frame itself, because rrweb decodes frames asynchronously while seeking and can leave an older one on screen. Without the setting, canvas charts (Grafana, uPlot) are empty. Video is always blank.
- Runtime CSS (`insertRule`, CSS-in-JS, adopted stylesheets) replays when the recorder ran in the page's main world, which it does since bundle format 2. Older bundles look unstyled in places, and `pointer` can hit a different element than the one clicked. Compare `mouse.nodeId` with `element.rrwebId`.
- Images and fonts load from the original server. If it's gone they show as broken; nothing fails. `--offline` skips the wait.
- Mouse positions are rrweb's (sampled every ~50 ms); the position is the last sample, not interpolated.
- Cross-origin iframes are not recorded, so they are empty.

# blook

The replay CLI. It looks at an exported Blook bundle at any time `t`: a screenshot, the DOM, or what the mouse was over. It replays `rrweb.json` with `@rrweb/replay` in headless Chromium (Playwright). `blook transcribe` makes or re-runs the bundle's transcript from its audio.

## Run and build

```sh
cd packages/cli                  # after `bun install` at the repo root
bun src/cli.ts info <bundle>     # or node src/cli.ts (Node 23.6+), no build step
bun run test                     # every command against test/fixtures/blook-fixture.zip
bun run fixture                  # rebuild that fixture from test/make-fixture.ts
bun run build                    # dist/blook: one binary with the Bun runtime, Playwright, the replay assets and the skill
bun run build --target=bun-linux-x64 --outfile dist/blook-linux-x64   # cross-compile
```

The transcribe tests use a mock OpenRouter. The whisper test runs only with `whisper-cli` and `~/Blook/models/ggml-base.en.bin` present.

The binary has no browser. It uses Playwright's cached `chromium-headless-shell` when its revision matches, else the installed Google Chrome. `blook install-browser` downloads the matching headless shell (honours `PLAYWRIGHT_BROWSERS_PATH`).

## Commands

`blook --help` and `blook <command> --help` are the reference: every command, option, output shape, example and exit code. The design rules are in [docs/cli-design.md](../../docs/cli-design.md), and each command is one file in `src/commands/`.

Behavior the help doesn't spell out:

- Times after the end of the recording are errors (exit 4). Times before the first snapshot or after the last event replay the nearest state, with a warning.
- `screenshot` draws a red ring and arrow at the mouse.
- `dom` copies typed form values into `value`, `checked` and `selected` attributes, and gives hovered elements a `:hover` class.
- `pointer` finds the element under the mouse through open shadow roots and same-origin iframes. `mouse` is the last mouse move, touch, drag or click at or before `t`. Each element has `tag`, `rrwebId`, `id`, `classes`, `text`, key attributes, `rect` and a CSS-like `path`.
- `transcribe` writes a zip in place through a temp file and a rename. The mapping to session ms is the extension's (`@blook/core/transcript`).
- `transcribe --method whisper` runs whisper.cpp locally (`brew install whisper-cpp`, or `BLOOK_WHISPER_CLI` for the path). The default model, `base.en`, is 148 MB, English only, and takes about 2 s for 30 s of audio on an M1. `small.en` (488 MB) is barely better here. For other languages use a multilingual model such as `small`. Models download once to `~/Blook/models` (`BLOOK_MODELS_DIR`). Headless Chromium decodes the WebM/Opus chunks to 16 kHz WAV, so there is no ffmpeg dependency. Word starts come from whisper.cpp's DTW token times (`-dtw`), which follow the voice more closely than its default token offsets.
- `BLOOK_OPENROUTER_URL` points `--method openrouter` at another endpoint, for tests.
- `skill install` runs `npx skills add cyrillbrito/blook --skill blook -g`, which asks which agents to link the skill into. Extra flags go to it (`-a claude-code -y`). With `--copy`, without npx, or without a terminal and flags, it writes the embedded skill to `~/.agents/skills/blook/`.
- `extension` opens `chrome://extensions` only on macOS at a terminal.

## Limits

- Canvas shows only with the Canvas setting (`session.json` `.settings.canvas`), at 2 fps: the last frame at or before `t`. Video is always blank. Cross-origin iframes are empty.
- Images and fonts load from the original server. When it's gone they show as broken, and `--offline` skips the wait.
- Mouse positions are rrweb samples (about every 50 ms), not interpolated.

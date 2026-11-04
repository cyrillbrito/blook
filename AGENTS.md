# Blook

Blook is a Chrome extension for personal use. I press Record in my web app and talk while I use it: walk a flow, point with the mouse, describe bugs. On Stop it exports one local bundle (a ZIP) with everything that happened in the browser.

## Two sides

**Recording.** The extension captures, on one shared clock:

- a full DOM replay (rrweb), with mouse, clicks, scrolls and inputs
- HTTP requests and responses, and WebSocket frames
- console logs and errors
- my voice, transcribed with word-level timestamps

**Reviewing.** Two kinds of readers open the bundle:

- A person, for example a developer opening a Jira ticket with the ZIP attached. They open it from the extension's side panel ("Open bundle…") in the Replay page and see the replay, timeline, transcript, network, WebSockets and console in sync.
- A coding agent. It uses the `blook` skill: jq over the JSON files, and the replay CLI for a screenshot, the DOM or the element under the mouse at any time T.

The bundle has no screenshots or video. The replay rebuilds the page at any time, so it is the source of truth.

Typical uses: report bugs to an agent, and let an agent write E2E tests from a narrated flow.

## Scope

- Personal tool, Chrome only, local first. No accounts, no hosting, no telemetry.
- Fewer options than Jam or Proofline Session Recorder. Build only what the uses above need.
- Not a goal for now: stable test selectors, cookies or storage state, multi-user sharing.

## Stack

- [WXT](https://wxt.dev) (MV3), React and Tailwind
- [rrweb](https://github.com/rrweb-io/rrweb) for DOM recording and replay
- `chrome.debugger` (Chrome DevTools Protocol) for network, WebSocket and console
- Transcription: OpenRouter speech-to-text (extension and CLI), or local whisper.cpp (CLI). The audio stays in the bundle, so a transcript can always be re-run.
- Bun as package manager and for the CLI binary; Playwright in the CLI

## Commands

```sh
bun install
bun run dev            # extension in dev mode, load .output/chrome-mv3-dev unpacked
bun run build          # .output/chrome-mv3
bun run compile        # type-check
bun run test           # bun test ./test/: capture rules, bundle export and timeline, no browser
```

The replay CLI lives in `cli/`, with its own `bun install`:

```sh
cd cli
bun src/cli.ts pointer <bundle.zip> 00:18.5   # also: info, screenshot, dom, transcribe, install-browser
bun run test                                  # tests, with a small synthetic bundle
bun run build:bin                             # single binary: dist/blook
```

Details in [cli/README.md](cli/README.md).

## Where things are

- `entrypoints/`: extension pages and scripts (side panel, background, recorder, offscreen mic, Replay page)
- `lib/`: capture, export, transcription, IndexedDB. `lib/types.ts` and `lib/messages.ts` are the contracts.
- `components/viewer/`: the viewer, used by the extension's Replay page; `components/ui/`: shared UI primitives
- `cli/`: the replay CLI
- `skills/blook/`: the agent skill
- `install.sh`, `.github/workflows/release.yml`: the one-line installer and the release build

## Docs

- [docs/](docs/README.md): architecture, the bundle format, and references
- Technical detail lives next to the code: short comments, and READMEs like [cli/README.md](cli/README.md). Keep docs short, current and free of history.
- The bundle format version is `BUNDLE_FORMAT_VERSION` in `lib/export/bundle.ts`.

## Keep every part in sync

The extension, the bundle, the viewer, the CLI, the skill and the docs describe one product. A change in one part is done only when the others still match it:

- **Extension or bundle change** (capture, export, a field, a file): update [docs/bundle-format.md](docs/bundle-format.md), the viewer, the CLI (`cli/src/bundle.ts` and its test fixture), and the skill's files table and recipes.
- **CLI change** (a command, option, output shape or exit code): update `--help`, [cli/README.md](cli/README.md), the tests, and the skill's CLI section.
- **Skill change**: run its commands and jq recipes against a real bundle.
- **Any change**: update the docs it touches (README.md for users, AGENTS.md and docs/ for developers).

Before calling it done, validate across parts: `bun run compile`, `bun run test` and `bun run build` at the root; `bun run test` in `cli/`; record a short session with the built extension and check it in the Replay page, with `blook info`/`pointer`, and with the skill recipes that touch what changed.

## Prior art

`~/Repos/session-recorder-chrome-extension` is a fork of Proofline Session Recorder (AGPL-3.0). Read it for ideas. Don't copy code from it without considering the license. Cloned references are in `references/` (git-ignored, never edit).

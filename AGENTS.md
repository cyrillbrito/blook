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

A Bun workspaces monorepo: every package is in `packages/`, with one `bun install` and one `bun.lock` at the root.

```sh
bun install
bun run dev            # extension in dev mode, load packages/extension/.output/chrome-mv3-dev unpacked
bun run build          # every package's build: the extension (.output/chrome-mv3), the CLI binary (dist/blook), the site (dist/)
bun run zip            # packages/extension/.output/blook-chrome.zip
bun run typecheck      # bun check (TypeScript 7) on every package's tsconfig.json
bun run test           # bun test in every package: format logic, capture, CLI against a synthetic bundle
bun run lint           # oxlint, one root config (.oxlintrc.json)
bun run format         # oxfmt, one root config (.oxfmtrc.json); format:check in CI. Markdown is not formatted.
```

`bun check` is Bun's built-in type checker, so no package needs TypeScript to check. The root `typescript` devDependency is only for editors: keep it on the version `bun -p process.versions.typescript` prints.

One package: `bun run --filter @blook/cli test`, or run its script from its folder. The CLI from source:

```sh
cd packages/cli
bun src/cli.ts pointer <bundle.zip> 00:18.5   # also: info, screenshot, dom, transcribe, install-browser
bun run build                                 # single binary: dist/blook
```

Details in [packages/cli/README.md](packages/cli/README.md).

## Where things are

Packages share TypeScript source through `package.json` `exports` (`@blook/core/bundle`, `@blook/ui`), with no build step. Shared dependency versions are in the root `package.json` catalog (`"react": "catalog:"`); packages link each other with `workspace:*`.

- `packages/core` (`@blook/core`): the bundle format and logic shared by more than one package. Types of the recorded data (`types.ts`), the bundle builder and `BUNDLE_FORMAT_VERSION` (`bundle.ts`), `timeline.ts`, `transcript.ts` and `vad.ts`, the OpenRouter request, the body policy, display formatting. Pure: no browser-extension APIs.
- `packages/extension` (`@blook/extension`): the WXT extension. `entrypoints/` (side panel, background, recorder, offscreen mic, Replay page), `lib/` (capture, IndexedDB, messages, settings, export and transcription glue). `lib/messages.ts` is the contract between extension contexts.
- `packages/viewer` (`@blook/viewer`): the React viewer and its zip/folder loader. No `chrome.*`: hosts pass the initial loader and download handler as props. Hosts add `@import "@blook/viewer/styles.css"` to their Tailwind stylesheet.
- `packages/ui` (`@blook/ui`): UI primitives, icons, the logo (`src/icon.svg`) and the Tailwind theme (`@blook/ui/theme.css`).
- `packages/cli` (`@blook/cli`): the replay CLI; `src/assets.ts` holds the files the binary embeds.
- `packages/site` (`@blook/site`): the Astro website on GitHub Pages (https://cyrillbrito.github.io/blook/): the landing page and `/viewer`, which hosts `@blook/viewer`. `bun run dev` in its folder; `.github/workflows/site.yml` deploys it on push to main.
- `skills/blook/`: the agent skill (at the root, where the skills CLI finds it)
- `install.sh`, `.github/workflows/release.yml`: the one-line installer and the release build

A new package: a folder in `packages/` with a `package.json` (`"name": "@blook/<name>"`, `"private": true`, `exports` to its source) and a `tsconfig.json` that extends `../../tsconfig.base.json`; add it to the root `typecheck` script.

## Docs

- [docs/](docs/README.md): architecture, the bundle format, and references
- Technical detail lives next to the code: short comments, and READMEs like [packages/cli/README.md](packages/cli/README.md). Keep docs short, current and free of history.
- The bundle format version is `BUNDLE_FORMAT_VERSION` in `packages/core/src/bundle.ts`.

## Keep every part in sync

The extension, the bundle, the viewer, the CLI, the skill and the docs describe one product. A change in one part is done only when the others still match it:

- **Bundle change** (capture, export, a field, a file; mostly `packages/core`): update [docs/bundle-format.md](docs/bundle-format.md), the viewer, the CLI (`packages/cli/src/bundle.ts` and its test fixture), and the skill's files table and recipes.
- **CLI change** (a command, option, output shape or exit code): update `--help`, [packages/cli/README.md](packages/cli/README.md), the tests, and the skill's CLI section.
- **Viewer or UI change**: check every host still works (the extension's Replay page and side panel, and the site's `/viewer`).
- **Skill change**: run its commands and jq recipes against a real bundle.
- **Any change**: update the docs it touches (README.md for users, AGENTS.md and docs/ for developers).

Before calling it done, validate across parts: `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test` and `bun run build` at the root; record a short session with the built extension and check it in the Replay page, with `blook info`/`pointer`, and with the skill recipes that touch what changed.

## Prior art

`~/Repos/session-recorder-chrome-extension` is a fork of Proofline Session Recorder (AGPL-3.0). Read it for ideas. Don't copy code from it without considering the license. Cloned references are in `references/` (git-ignored, never edit).

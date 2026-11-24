# Blook

Blook is a Chrome extension for personal use. I press Record in my web app and talk while I use it: walk a flow, point with the mouse, describe bugs. On Stop it exports one local bundle (a ZIP) with everything that happened in the browser.

## Two sides

**Recording.** The extension captures, on one shared clock:

- a full DOM replay (rrweb), with mouse, clicks, scrolls and inputs
- HTTP requests and responses, and WebSocket frames
- console logs and errors
- my voice, transcribed with word-level timestamps

**Reviewing.** Two kinds of readers open the bundle:

- A person, for example a developer opening a Jira ticket with the ZIP attached. They open it from the extension's menu ("Open bundle…") in the Replay page and see the replay, timeline, transcript, network, WebSockets and console in sync.
- A coding agent. It uses the `blook` skill: jq over the JSON files, and the replay CLI for a screenshot, the DOM or the element under the mouse at any time T.

The bundle has no screenshots or video. The replay rebuilds the page at any time, so it is the source of truth.

Typical uses: report bugs to an agent, and let an agent write E2E tests from a narrated flow.

## Scope

- Personal tool, Chrome only, local first. No accounts, no hosting, no telemetry.
- Fewer options than Jam or Proofline Session Recorder. Build only what the uses above need.
- Not goals: stable test selectors, cookies or storage state, multi-user sharing.

## Stack

- [WXT](https://wxt.dev) (MV3), React and Tailwind
- [rrweb](https://github.com/rrweb-io/rrweb) for DOM recording and replay
- `chrome.debugger` (Chrome DevTools Protocol) for network, WebSocket and console
- Transcription: OpenRouter speech-to-text (extension and CLI), or local whisper.cpp (CLI)
- Bun as package manager and for the CLI binary; Playwright in the CLI

## Commands

A Bun workspaces monorepo: every package is in `packages/`, with one `bun install` and one `bun.lock` at the root. The packages are described in [docs/architecture.md](docs/architecture.md).

```sh
bun install
bun run dev            # extension in dev mode, load packages/extension/.output/chrome-mv3-dev unpacked
bun run build          # the extension (.output/chrome-mv3), the CLI binary (dist/blook), the site (dist/)
bun run zip            # packages/extension/.output/blook-chrome.zip
bun run typecheck      # each package's typecheck script: bun check (TypeScript 7) on its tsconfig.json
bun run test           # bun test in core, extension and cli
bun run lint           # oxlint, one root config (.oxlintrc.json)
bun run format         # oxfmt, one root config (.oxfmtrc.json); format:check in CI. Markdown is not formatted.
```

One package: `bun run --filter @blook/cli test`, or run its script from its folder. The CLI from source: `cd packages/cli && bun src/cli.ts info <bundle.zip>` ([packages/cli/README.md](packages/cli/README.md)).

`bunfig.toml` sets a one-day `minimumReleaseAge`: `bun install` and `bun update` skip package versions published less than a day ago.

`bun check` is Bun's built-in type checker, so no package needs TypeScript to check. The root `typescript` devDependency is only for editors: keep it on the version `bun -p process.versions.typescript` prints.

Packages share TypeScript source through `package.json` `exports` (`@blook/core/bundle`, `@blook/ui`), with no build step. Shared dependency versions are in the root `package.json` catalog (`"react": "catalog:"`), and packages link each other with `workspace:*`. A new package is a folder in `packages/` with a `package.json` (`"name": "@blook/<name>"`, `"private": true`, `exports` to its source), a `tsconfig.json` that extends `../../tsconfig.base.json`, and a `"typecheck": "bun check"` script.

The product has one version, in the root `package.json`. The extension manifest and `blook --version` read it, and packages have none. The manual release workflow (`.github/workflows/release.yml`, input `bump`: patch, minor or major) bumps it, tags, and publishes the extension ZIP and the CLI binaries on GitHub. The ZIP then goes to the Chrome Web Store by hand ([packages/store/README.md](packages/store/README.md)): the store is the only place users get the extension. Release notes are a short changelog, never install steps: pass the optional `notes` input (one sentence, then 2 to 6 user-visible bullets), or it lists the commit subjects since the last tag.

## Docs

Open a doc when your task touches what it covers:

- [docs/architecture.md](docs/architecture.md): the packages, how the recorder's parts and the viewer fit together, and the key decisions. The starting point in an unfamiliar area.
- [docs/bundle-format.md](docs/bundle-format.md): the exact bundle layout and fields, for any change to capture, export or what reads a bundle.
- [docs/cli-design.md](docs/cli-design.md): the rules every `blook` command, output and exit code follows.
- [docs/references.md](docs/references.md): similar tools cloned in `references/`, useful when designing a feature or when rrweb, CDP or the mic misbehave.
- [packages/cli/README.md](packages/cli/README.md): running and building the replay CLI, replay behavior and `transcribe`.
- [packages/viewer/README.md](packages/viewer/README.md) and [packages/ui/README.md](packages/ui/README.md): hosting the viewer, and the UI tokens, primitives and rules (colour, focus, keyboard) to build any screen with.
- [skills/blook/SKILL.md](skills/blook/SKILL.md): how an agent reads a bundle; it follows every bundle and CLI change.
- [packages/videos/README.md](packages/videos/README.md): the marketing films (HyperFrames), which need a pass when the UI they show changes.
- [packages/store/README.md](packages/store/README.md): the Chrome Web Store listing, privacy answers and images, and how to release an update.
- [README.md](README.md): install and use, for users, so it changes with any user-visible flow, label or setting.

Docs are for someone new to the area: what a part is, how it works with the others, and what is easy to get wrong, with the files to open next. They describe the current state, short and plain, and leave history to git. `docs/` stays high level, and detail lives next to the code as short comments. Each topic has one doc: link to it instead of copying. The contracts stay exact: `docs/bundle-format.md`, `packages/core/src/types.ts` (stored rows and settings), `packages/extension/lib/messages.ts` (messages between extension contexts). Update the docs in the same change as the code. A stale doc is a bug. After renaming a heading or moving a doc, grep for the old name, since other docs and skills link to it.

Not ours to edit: the vendored skills in `.agents/skills/` (they update from their source, see `skills-lock.json`), and the film plans in `packages/videos/films/*/` (`STORYLINES.md`, `SPEC.md`, `REVIEW.md`), which are history.

## Review checks

The extension, the bundle, the viewer, the CLI, the site, the skill and the docs describe one product. Implement every change across all of them in one go: a change is done only when every package, the skill and the docs match it. No half-done features, no compatibility shims, no old names left behind:

- **Bundle change** (capture, export, a field, a file; mostly `packages/core`): update [docs/bundle-format.md](docs/bundle-format.md) (its version is `BUNDLE_FORMAT_VERSION` in `packages/core/src/bundle.ts`), the viewer, the CLI (`packages/cli/src/bundle.ts` and its test fixture), and the skill's files table and recipes.
- **CLI change** (a command, option, output shape or exit code): update `--help`, [packages/cli/README.md](packages/cli/README.md), the tests, and the skill's CLI section.
- **Viewer or UI change**: check every host still works (the extension's Replay page, popup and Recordings page, and the site's `/viewer`).
- **Skill change**: run its commands and jq recipes against a real bundle.
- **Any change**: update the docs it touches (README.md for users, AGENTS.md and docs/ for developers).

Before calling it done, validate across parts: `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test` and `bun run build` at the root; record a short session with the built extension and check it in the Replay page, with `blook info`/`pointer`, and with the skill recipes that touch what changed.

## Prior art

Similar tools are listed in [docs/references.md](docs/references.md) and cloned in `references/` (git-ignored, never edit). Read them for ideas; don't copy code from the AGPL ones.

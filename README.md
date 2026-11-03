# Blook

A look inside the browser. Blook is a Chrome extension: press Record in your web app and talk while you use it. Walk a flow, point with the mouse, describe bugs. On Stop it exports one local ZIP with everything that happened:

- a full DOM replay (rrweb), with mouse, clicks, scrolls and inputs
- HTTP requests and responses, and WebSocket frames
- console logs and errors
- your voice, transcribed with word-level timestamps (OpenRouter, your own key)

People open the ZIP in the viewer. Coding agents read it with the `blook` skill and the `blook` CLI, which replays the page at any time for a screenshot, the DOM, or the element under the mouse. Typical uses: report a bug to an agent, or have an agent write an E2E test from a narrated flow.

Personal tool, Chrome only, local first: no accounts, no hosting, no telemetry.

## Install

From the [latest release](https://github.com/cyrillbrito/blook/releases/latest):

1. **Extension.** Download `blook-<version>-chrome.zip` and unzip it. Open `chrome://extensions`, turn on Developer mode, and click **Load unpacked** on the folder. (It's not on the Chrome Web Store.)
2. **CLI.** Download `blook-<os>-<arch>`, `chmod +x` it, and put it on your PATH as `blook`. On macOS, run `xattr -d com.apple.quarantine blook` first.
3. **Browser for the CLI.** Only without Google Chrome installed: `blook install-browser`.
4. **Agent skill.** `blook skill install` runs `npx skills add cyrillbrito/blook`. Without Node, `blook skill install --copy` writes it to `~/.agents/skills/blook/`.

`viewer.html` from the release opens a bundle in any browser, without the extension.

## Develop

```sh
bun install
bun run dev            # load .output/chrome-mv3-dev unpacked
bun run build          # .output/chrome-mv3
bun run build:viewer   # dist/viewer.html
cd cli && bun install && bun run build:bin   # cli/dist/blook
```

Releases: run the `release` workflow (Actions tab, or `gh workflow run release.yml -f bump=patch`). It bumps the version, tags, builds, and publishes the assets.

## Docs

- [docs/](docs/README.md): architecture, the bundle format, research
- [cli/README.md](cli/README.md): the replay CLI
- [skills/blook/SKILL.md](skills/blook/SKILL.md): the agent skill

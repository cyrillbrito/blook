# Blook

Blook is a Chrome extension that records what happens in your browser while you talk, so a person or a coding agent can replay it later.

![The Replay page: the page replay on the left, the timeline on the right](docs/images/replay.png)

## What it captures

- The page itself, as a DOM replay, with mouse moves, clicks, scrolls and typing
- HTTP requests and responses, and WebSocket messages
- Console logs and errors
- Your voice, transcribed word by word

Everything sits on one shared clock. There is no video: the replay rebuilds the page at any moment.

A recording is one local ZIP file. Nothing is uploaded, and there are no accounts.

## Install

Blook isn't on the Chrome Web Store, so you load it by hand.

1. Download `blook-<version>-chrome.zip` from the [latest release](https://github.com/cyrillbrito/blook/releases/latest) and unzip it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the unzipped folder.
5. Pin Blook from the puzzle icon in the toolbar.

![Blook loaded on chrome://extensions with Developer mode on](docs/images/extensions-page.png)

6. Click the Blook icon to open the side panel.
7. Optional: to get your voice transcribed, click the gear icon and paste an [OpenRouter API key](https://openrouter.ai/keys). Without a key, Blook still records everything else.

![The settings in the side panel, with the OpenRouter API key field](docs/images/sidepanel-settings.png)

## For coding agents

An agent reads a recording's ZIP with the `blook` command-line tool and the `blook` skill.

1. Download the binary for your machine from the [latest release](https://github.com/cyrillbrito/blook/releases/latest): `blook-darwin-arm64`, `blook-darwin-x64` or `blook-linux-x64`.
2. Rename it to `blook`, run `chmod +x blook`, and put it on your `PATH`. On macOS, also run `xattr -d com.apple.quarantine blook`.
3. If Google Chrome isn't installed, run `blook install-browser`.
4. Run `blook skill install` to add the skill to your agents.

Then give your agent a recording's ZIP.

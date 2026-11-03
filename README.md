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

On macOS or Linux (x64), run:

```sh
curl -fsSL https://raw.githubusercontent.com/cyrillbrito/blook/main/install.sh | sh
```

It installs the `blook` command-line tool to `~/.local/bin`, unpacks the extension to `~/.blook/extension`, and offers to add the `blook` skill to your coding agents. Run it again, or `blook update`, to update.

Blook isn't on the Chrome Web Store, so you load the extension by hand, once:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick `~/.blook/extension` (on macOS, press Cmd+Shift+G in the picker and paste the path).
4. Pin Blook from the puzzle icon in the toolbar.

After an update, click the reload icon on Blook's card in `chrome://extensions`. Prefer manual downloads? Everything is on the [releases page](https://github.com/cyrillbrito/blook/releases/latest).

![Blook loaded on chrome://extensions with Developer mode on](docs/images/extensions-page.png)

5. Click the Blook icon to open the side panel.
6. Optional: to get your voice transcribed, click the gear icon and paste an [OpenRouter API key](https://openrouter.ai/keys). Without a key, Blook still records everything else.

![The settings in the side panel, with the OpenRouter API key field](docs/images/sidepanel-settings.png)

## For coding agents

An agent reads a recording's ZIP with the `blook` command-line tool and the `blook` skill, which the install command above sets up. If Google Chrome isn't installed, run `blook install-browser` once.

Then give your agent a recording's ZIP.

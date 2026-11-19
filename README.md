# Blook

Blook is a Chrome extension that records what happens in your browser while you talk, so a person or a coding agent can replay it later.

Website, and a viewer that opens a recording in your browser: https://cyrillbrito.github.io/blook/

<a href="https://chromewebstore.google.com/detail/njijkneplfdknfbmbokldfpbdhgpppbi"><img src="packages/store/images/chrome-web-store-badge.png" alt="Available in the Chrome Web Store" height="48"></a>

![The Replay page: the page replay on the left, the timeline on the right](docs/images/replay.png)

## What it captures

- The page itself, with your mouse, clicks, scrolls and typing
- The network requests and the console
- Your voice, transcribed word by word

Everything lines up in time, and a recording is one ZIP file on your computer. Nothing is uploaded, and there are no accounts.

## Install

Add Blook from the [Chrome Web Store](https://chromewebstore.google.com/detail/njijkneplfdknfbmbokldfpbdhgpppbi), pin it in the toolbar, and click it to open the side panel.

## Record

1. On the page you want to record, press **Start recording** in the side panel.
2. Use the page and talk. Point at things with the mouse.
3. Press **Stop recording**, then download the ZIP from the side panel.

The first time, Chrome asks for the microphone. Pick **Allow while visiting the site**, so it only asks once.

## Voice transcription (optional)

To get your voice transcribed, click the gear icon in the side panel and paste an [OpenRouter API key](https://openrouter.ai/keys). Without one, the recording still keeps your voice, and it can be transcribed later.

![The settings in the side panel, with the OpenRouter API key field](docs/images/sidepanel-settings.png)

## Open a recording

Click **Open bundle…** in the side panel, or drop the ZIP on the [viewer on the website](https://cyrillbrito.github.io/blook/viewer/).

## For coding agents

To let your coding agent read recordings, run this once on macOS or Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/cyrillbrito/blook/main/install.sh | sh
```

Then give your agent a recording's ZIP.

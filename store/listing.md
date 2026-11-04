# Store listing (draft)

Paste these into the Developer Dashboard, **Store listing** tab.

## Title

Comes from `manifest.name`: **Blook**.

## Summary (manifest `description`, max 132 characters)

Current, 72 characters:

> Record a narrated browser session into a local bundle for coding agents

Alternative, 118 characters:

> Record your browser while you talk: DOM replay, network, console and voice in one local ZIP for developers and AI agents.

## Category

Developer Tools. Language: English.

## Detailed description

```text
Blook records what happens in your browser while you talk, so a developer or a coding agent can replay it later.

Press Record in the side panel, use your web app, and narrate: walk through a flow, point with the mouse, describe a bug. Press Stop and download one ZIP file with everything that happened.

WHAT A RECORDING HOLDS
• A DOM replay of the page (rrweb), with mouse moves, clicks, scrolls and typing
• HTTP requests and responses, and WebSocket messages
• Console logs and errors
• Your voice, transcribed word by word (optional)

Everything sits on one shared clock. There is no video: the replay rebuilds the page at any moment, so recordings stay small.

REVIEW A RECORDING
• Open the ZIP in Blook's Replay page: the replay, timeline, transcript, network, WebSockets and console stay in sync.
• Give it to a coding agent: the open-source blook command-line tool and agent skill read the ZIP, take a screenshot of the page at any moment, and show what was under the mouse.

Typical uses: attach a recording to a bug ticket, hand a bug report to an AI coding agent, or let an agent write an end-to-end test from a narrated flow.

PRIVATE BY DESIGN
• Blook only records the tab you start it on and tabs opened from it, and only between Record and Stop.
• Recordings are stored on your computer and leave it only when you download the ZIP.
• No account, no analytics, no tracking.
• Voice transcription is optional: you paste your own OpenRouter API key, and only then is your recorded audio sent to OpenRouter to be transcribed.
• An option masks typed text and page text in the replay.

WHY IT ASKS FOR THESE PERMISSIONS
• Debugger: reads the recorded tab's network requests, WebSocket messages and console, the same data Chrome DevTools shows. Chrome shows a "Blook started debugging this browser" bar while you record.
• Access to all sites: so you can record any web app you choose, including your own local or staging sites.
• Microphone (asked the first time you turn it on): records your narration.

Open source: https://github.com/cyrillbrito/blook
```

## Graphic assets (in `store/images/`)

| Asset | File | Required |
| --- | --- | --- |
| Store icon 128×128 | `store-icon-128.png` (96 px artwork, 16 px transparent padding; same as `packages/extension/public/icon/128.png`) | yes |
| Screenshots 1280×800 | `screenshot-1-timeline.png`, `screenshot-2-network.png`, `screenshot-3-console.png`, `screenshot-4-sidepanel.png` | at least 1 |
| Small promo tile 440×280 | `promo-small-440x280.png` | no, but listings without it rank lower |
| Marquee 1400×560 | none | no |

The screenshots come from a real recording of the public TodoMVC demo (`demo.playwright.dev`), so no private URLs or keys. They show no transcript, since that needs a key and a voice; a retake with narration would show the Transcript tab too.

## Distribution

Visibility: **Unlisted**. Free, all regions.

## Other fields

- Official URL / Homepage URL: `https://github.com/cyrillbrito/blook`
- Support URL: `https://github.com/cyrillbrito/blook/issues`
- Mature content: no

# References

Tools that do part of what Blook does, and what to look at in each. The open-source ones are cloned (shallow, git-ignored) in `references/`; refresh with `git -C references/<name> pull`.

| Tool | License | Cloned | Look at |
|---|---|---|---|
| [rrweb](https://www.rrweb.com) | MIT | `references/rrweb` | `packages/web-extension` (its own recorder extension), `rrvideo` (headless replay), the record and replay options |
| Proofline Session Recorder | AGPL-3.0 | `references/proofline-session-recorder` | Debugger attach and detach, network assembly, the offscreen mic and its permission page. AGPL: ideas only, no code |
| [OpenReplay](https://openreplay.com) tracker and Spot | AGPL-3.0 | `references/openreplay` | Spot (`spot/`): another WXT extension with `chrome.debugger` network. Tracker modules (`tracker/tracker/src/main/modules`): DOM edge cases to check when a replay looks wrong |
| [Crikket](https://crikket.io) | AGPL-3.0 | `references/crikket` | Network capture by patching `fetch` and XHR in the page, without the debugger banner |
| [PostHog](https://github.com/PostHog/posthog-js), [Sentry](https://github.com/getsentry/sentry-javascript) replay | MIT | no | rrweb forks. Network masking defaults; Sentry's "replay buffer" of the last minutes |
| [Jam](https://jam.dev) | closed | no | The product closest to Blook: instant replay, WebSocket inspector, an MCP server and [agent skills](https://github.com/jamdotdev/skills) that shaped `skills/blook` |
| [Playwright trace viewer](https://playwright.dev/docs/trace-viewer) | Apache-2.0 | no | A trace ZIP an agent can read; its CLI's "list, then drill into one id" pattern |
| [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Apache-2.0 | no | CDP from an MCP server |

Transcription: [OpenRouter STT](https://openrouter.ai/docs/guides/overview/multimodal/stt) (`POST /api/v1/audio/transcriptions`, `verbose_json` with word timestamps; Whisper supports it, `gpt-4o-transcribe` rejects it). Local options: [Speaches](https://github.com/speaches-ai/speaches) and the [whisper.cpp server](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server).

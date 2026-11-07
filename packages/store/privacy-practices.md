# Privacy practices tab (draft)

Answers for the Developer Dashboard, **Privacy practices** tab. Reviewers read these; the store shows the data-use part to users.

## Single purpose

> Blook records a browser session that the user starts and stops, for bug reports and test writing: a DOM replay of the recorded tab with mouse, clicks and typing, its network requests, WebSocket messages and console logs, and optionally the user's spoken narration. It saves the recording locally and exports it as one ZIP file that a developer or a coding agent can replay.

## Permission justifications

One field per permission in the manifest.

| Permission | Justification |
| --- | --- |
| `debugger` | Blook attaches the Chrome DevTools Protocol to the tab the user chose to record (and tabs opened from it, such as an OAuth popup), only between Record and Stop, to capture its network requests and responses (Network domain), WebSocket frames, and console messages and exceptions (Runtime/Log domains). These cannot be read with any other extension API: webRequest gives no response bodies, WebSocket frames or console output. Chrome shows its "started debugging" bar the whole time, and Blook detaches at Stop. |
| `scripting` | At Record, Blook registers its own bundled rrweb recorder script (`content-scripts/recorder-main.js` and `recorder.js`) for the recorded tab so it runs at `document_start` in every frame and after every navigation, and injects the same files once into the already open page. They are unregistered at Stop. No remote or user-supplied code is injected. |
| `sidePanel` | The side panel is the whole UI: Record and Stop, settings, and the list of recordings to download or open. |
| `offscreen` | Microphone narration is recorded with MediaRecorder in an offscreen document (reason `USER_MEDIA`), because an MV3 service worker cannot use getUserMedia. It is created at Record when the user turned the mic on, and closed at Stop. |
| `storage` | `storage.local` keeps the user's settings (mic, masking, canvas, OpenRouter API key). `storage.session` keeps the state of the running recording so it survives a service worker restart. |
| `unlimitedStorage` | Recordings (DOM events, network bodies, audio chunks) are written to IndexedDB while recording, and a long session with network bodies can exceed the default quota. Data stays on the device until the user deletes it. |
| `downloads` | Exports a recording as one ZIP file to the user's Downloads folder when the user clicks Download. |

Host permission `<all_urls>`:

> The user can record any site they work on, including localhost, staging and internal apps, which a fixed list cannot cover. The host permission lets Blook run its recorder script in the recorded tab and its iframes, at document_start and after cross-origin navigations, and read the tab's URL and title (so Blook needs no `tabs` permission). Nothing runs on any page until the user presses Record, and then only in the recorded tab and tabs opened from it. activeTab is not enough: it is lost on navigation, and a recording must follow the user across pages and origins.

## Remote code

**No, I am not using remote code.** All JavaScript is bundled in the package. Blook makes one kind of outgoing request, to `https://openrouter.ai/api/v1/audio/transcriptions`, and only when the user saved an OpenRouter API key. It sends audio and gets back text (JSON), which is never executed.

## Data usage

What to tick under "What user data do you plan to collect from users now or in the future?". The store counts data handled only on the device as collected too, so tick what a recording can contain:

| Category | Tick | Why |
| --- | --- | --- |
| Personally identifiable information | yes | Page content, form inputs and network bodies of the recorded tab can contain names, emails and so on. |
| Health information | no | |
| Financial and payment information | no | Not targeted. (Tick it if you want to be strict: a recorded page could show it.) |
| Authentication information | yes | Network capture keeps request headers, which can include cookies and Authorization tokens. Password fields are masked in the replay. |
| Personal communications | yes | The user's voice narration, and messages visible on a recorded page. |
| Location | no | |
| Web history | yes | URLs of the recorded tab and its navigations. |
| User activity | yes | Mouse moves, clicks, scrolls and keystrokes in the recorded tab. |
| Website content | yes | The page DOM, network responses, WebSocket frames and console output. |

Then certify all three statements:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Sending audio to OpenRouter is allowed under the Limited Use policy: it is the user-facing feature the user turned on, with their own key.

## Privacy policy URL

`https://github.com/cyrillbrito/blook/blob/main/PRIVACY.md` (needs `PRIVACY.md` pushed to `main` first).

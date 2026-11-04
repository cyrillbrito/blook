# Blook privacy policy

Last updated: 3 November 2026

Blook is a Chrome extension that records a browser session you start, so you or a coding agent can replay it later. It is open source: <https://github.com/cyrillbrito/blook>.

## What Blook records

Only while you are recording, and only in the tab you started it on and tabs opened from it:

- The page content (DOM), with your mouse moves, clicks, scrolls and typing. Password fields are always masked. An option masks all typed text and page text.
- HTTP requests and responses, including headers and bodies, and WebSocket messages. Headers can contain cookies and access tokens of the site you record.
- Console logs and errors.
- The page URLs and titles.
- Your voice, if you turn on the microphone.

Blook records nothing when you are not recording.

## Where the data goes

- Recordings are stored in the extension's local storage (IndexedDB) on your computer. You can delete them in the side panel at any time. Removing the extension deletes them.
- A recording leaves your computer only when you click Download: it is saved as a ZIP file in your Downloads folder. What you do with that file is up to you.
- **Transcription (optional).** If you paste an OpenRouter API key in the settings, Blook sends your recorded audio to OpenRouter (<https://openrouter.ai>) over HTTPS, with your key, to turn it into text. OpenRouter's privacy policy covers that request: <https://openrouter.ai/privacy>. Without a key, no audio leaves your computer.
- Your settings, including the API key, are stored in Chrome's extension storage on your computer.

## What Blook does not do

- No accounts, no analytics, no telemetry, no ads.
- The developer receives no data from Blook. Nothing is sent to any server other than OpenRouter, as described above.
- Blook does not sell, share or transfer your data, and does not use it for anything other than recording and replaying your sessions.

## Contact

Questions or problems: open an issue at <https://github.com/cyrillbrito/blook/issues>.

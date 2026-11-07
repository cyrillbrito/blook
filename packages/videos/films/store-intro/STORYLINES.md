# store-intro: storylines

Built: A. After the first cut the person chose to cut it to four beats (talk, the real page, one clock, one ZIP an agent reads), each a title alone and then one shot; see SPEC.md.

The Chrome Web Store intro: 16:9, 35–45 s, silent, frame 0 is the thumbnail. The visitor knows it is a Chrome extension; they want to know what it does and whether it is for them. Every take covers the five pillars in `MESSAGING.md` and ends on the "many jobs" beat and the mark.

Ideas sketched first (device × form): follow the red dot (one object across apps × object-to-object chain); the ticket that replays (result first × endless zoom); one Replay page that rebuilds (feature as the hook × one frame that rebuilds); before and after (wall-of-text ticket vs one ZIP × split screen to one); the page splits into layers (object is the explanation × flight through one world). Kept the three that differ most.

## A. Follow the red dot (recommended: a stranger follows one thing from the first frame to the logo)

Device: one object across apps. Form: object-to-object chain. The vermilion "● Recording" dot from the side panel is the carrier: it drops into the Replay page and becomes the playhead, rides the playhead across the lanes and marks 0:13.0 where the click, the 404 and the console error line up, becomes the ZIP's badge, rides the ZIP into an agent's terminal, ends as the full stop of "One recording." and finally becomes the eye of the logo. The big macOS cursor does the clicks inside each beat; the dot carries between them.

- First 2 s: TodoMVC and the Blook side panel, "● Recording 0:11", the title "Talk, don't type" top left; the narration "I tick "Write the release notes" and it should save." writes itself word by word under the list while the cursor heads for the toggle.
- Beats: talk + tick (the 404 flashes by) → Stop, the dot drops into the Replay page's scrubber → Play, Pause, scrub: "Not a video. The real page", `li.completed` outlined as you scrub → the page shrinks aside, lanes rise, playhead stops at 0:13.0: "Everything on one clock" → everything collapses into the dot, the dot becomes the ZIP's badge, file list: "One small ZIP" → cursor drags the ZIP into an agent's terminal, `blook pointer … 00:12.9`: "Any agent can read it" → "One recording●" with the jobs rolling (bug reports, QA tickets, E2E tests, backend tests), one artifact each → the full stop flies into the logo's eye, "Blook", tagline.
- Look: the product's light world: slate-100 ground, white windows, Inter and JetBrains Mono; vermilion only on the dot; amber only for "now".
- Sound: silent (no music source here); soft UI clicks on the four clicks and a light bed when one is set up.

## B. The ticket that replays

Device: the result first. Form: an endless zoom. Opens on a generic bug ticket with a ZIP attached and no steps written; the camera dives into the attachment, which opens into the Replay page; dives into the ticked checkbox, which opens into its DOM; dives into the 404 marker, which opens into the lanes; dives into the terminal prompt; pulls all the way back out to the ticket, now with the agent's answer as a comment.

- First 2 s: a ticket "Ticked todo is back after a reload", description empty except a ZIP chip, the cursor clicking the chip.
- Beats: ticket → zoom into the replay → zoom into the element → zoom into the clock → zoom into the agent → pull back to the ticket → jobs → end card.
- Look: same light product world, deeper shadows to sell the zoom layers.
- Sound: silent; whooshes on each dive when sound is available.
- Why not: it starts after the recording, so "talk, don't type" is told in flashback and frame 0 shows a ticket, not the extension in use.

## C. One Replay page that rebuilds

Device: the feature as the hook. Form: one frame that rebuilds. The film never leaves the Replay page: it starts as the side panel recording, the panel unfolds into the Replay page, its panes swap and rearrange (page, transcript, lanes, network body, the file list as a sidebar, the CLI as a docked terminal) and finally fold into the logo.

- First 2 s: the Replay page already playing TodoMVC with the transcript filling in beside it.
- Beats: transcript → replay → lanes → files → CLI → jobs as four tabs → logo.
- Look: product UI at 1.5×, one stage, no world changes.
- Sound: silent; one soft tick per rearrangement.
- Why not: one frame reads as a tutorial of the viewer, the ZIP and the agent feel like panes of an app rather than things that leave your computer.

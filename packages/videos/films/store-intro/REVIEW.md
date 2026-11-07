# store-intro: review

Delivered: `../../out/store-intro.mp4`, 1920x1080, 30 fps, 47.9 s, with music and sound effects.

## Second version: one thing at a time

The first cut (42 s, six beats) put the title, a quiet line, the URL bar, the side panel, the narration and a 404 flash in the same frame. The person found it far too busy and picked: four beats, each a title alone and then one shot.

- Beats: talk (the list, the spoken line, the tick) → the real page (outlined row and its tag flipping as the playhead scrubs) → one clock (four lanes lining up at 0:13.0) → one ZIP an agent reads (one command, one answer) → logo.
- Cut: the side panel, the URL bar, the TodoMVC header and footer, the 404 flash in beat 1, the file list, "stays on your computer, no account", and the many-jobs montage (bug reports, QA, E2E, backend tests). The Skills setup notes on the side panel's "Recordings (1)" and the ZIP hold no longer apply, since both parts are gone.
- The red dot still carries the film. It is the bullet of every title at (190, 540), the "● Recording" light in beat 1, the playhead in beat 2, the head of the lanes' playhead in beat 3, the ZIP's badge in beat 4 and the logo's iris at the end.

## Tenth version: calmer music, timed effects, a smooth voice pill

The music bed is compressed and less dynamic (loudness range 11 → 7 LU), its Stop → ZIP muffle is gentler, and it sits under the effects; the mix is -16 LUFS, peak -1.1 dBFS. Every effect starts early by its file's own lead-in (the error tone has 0.6 s of silence, the pop 0.12 s), so each sound lands on its frame. The logo's sparkle became the library's soft chime. The unzip had a whoosh plus six overlapping pops 0.16 s apart, which sounded like a stutter; it is now one whoosh as the tiles burst out. The voice pill no longer jumps: each word opens its own width at a steady 650 px/s, so the pill grows smoothly with no DOM measuring.

## Ninth version: synthwave, sound effects, a clearer voice

"Distor" didn't fit. The music is now a synthwave track ("Background Music" by JonasBlakewood, Pixabay licence), started 3.93 s in so its drop hits on the Start recording click; muffled from Stop until the ZIP lands on its next phrase. Sound effects from the media-use library mark every click, the listed recording, the ZIP's flight and landing (bass hit), each tile, the bug and the logo. 

Picture: the hold after Start recording is shorter and the pull-back faster (1.2 s); the voice subtitle is bigger, with a red mic that pulses and live level bars; Stop sends a ripple; the ZIP lands with a bounce and a red ring; the timeline ends on a callout, "The bug, caught".

## Eighth version: "Distor"

The person picked "Distor" by Loksii from Pixabay (a lo-fi beat, about 100 BPM; Pixabay Content License, free for commercial use, no credit). The Soundrider track was dropped: Jamendo has removed its page. The music now follows the story: muffled (low-pass) until Start recording, clear while recording, muffled again from Stop until the ZIP lands, and a tape-stop slowdown on the end card. The mix is about -14 LUFS.

## Seventh version: music, "Full replay"

Music: "Inspiring Corporate" by Soundrider/Dope from Jamendo (found through Openverse), CC BY 3.0, so free for commercial use with a credit. Put this in the YouTube description: "Music: Inspiring Corporate by Soundrider/Dope (jamendo.com/track/1670484), CC BY 3.0." It builds quietly until 16 s and opens up as the ZIP scene starts; the mix is -13.7 LUFS integrated. The replay title is now "Full replay. / Not a video."

## Sixth version: a touch faster, new end line

Every scene now plays 1.1x (one `SPEED` constant per composition wraps its timeline), so the relative pacing the person liked stays. The end card says "Full browser replay, with audio transcription" instead of "Narrated browser recordings for coding agents".

## Fifth version: the order of events

The person found the talk shot unclear (it didn't read as a third-party site, and the narration bubble looked like part of it) and a gap after it: nothing stopped the recording, and the replay came out of nowhere. Now the camera pulls back from the intro's live card to a Chrome window with TodoMVC on the left and Blook docked on the right; the words are a dark subtitle outside the window; the cursor ticks, then stops the recording and downloads it from "Recordings (1)", and the ZIP flies out of the button. The ZIP beat follows (what's inside), then "Open it. Not a video: the real page" in a viewer window titled with the ZIP's name, then the clock. Holds were trimmed a little (60.5 → 53.4 s).

Kept warnings: the side panel text inside the whole-browser shot is under the 28 px phone floor (it is context; the camera moves in to 1.7x before anything in it matters), and `line_unread` on the ZIP name and the live card's host, which carry on across scene cuts.

## Fourth version: slower, and the ZIP as data

The person found it too fast, the travelling dot overused, and the agent terminal (command, JSON, answer) unclear. Every entrance now eases in over 0.8-1 s and every shot holds until it reads; there is no length cap. The red dot only blinks as a recording light (intro title, live card, talk shot). The agent terminal is gone: the site's six "what a recording holds" tiles appear one at a time, gather into the site's ZIP and it zips shut, with "Replay it, or give it to a coding agent". The clock beat ends on a slow 1.2x push-in on 0:13.0, which fixes its phone legibility.

## Third version: the intro

The person missed the overall idea before the first selling point. The film now opens on "● Record your browser while you talk" alone (the site's tagline, and frame 0), then the real side panel: the cursor clicks "Start recording" and the card turns live, which is where the red dot comes from. The talk beat lost its title, since the intro already says it. The end card line is now the promo tile's "Narrated browser recordings for coding agents", so the tagline is not said twice. Frame 0 is the idea in words, so a custom YouTube thumbnail is optional.

## Facts on screen

- Real: the side panel's "Start recording", "Records this tab:" and live card labels (`entrypoints/sidepanel/App.tsx`), the TodoMVC items, the spoken line, the click at 0:12.9, `GET /todos/sync-missing → 404` and `Sync failed: 404` at 0:13.0, the bundle name, and the six kinds of data and their icons from the site's "What a recording holds".
- Film annotations: the amber outline and its tag.
- No size, speed, "100%", "pixel-perfect" or DevTools claims.

## Checked

- `npx hyperframes check --json`: ok, no errors. Warnings kept: contrast on the terminal's grey `$` and bar text, which are secondary.
- Snapshots of every beat, then the render decoded every 0.5 s (121 frames): every frame has one subject. Between beats there is only a short dip to the ground.
- Not checked: sound (none), a person watching at full speed.

## Weakest shot

The replay window (26-36 s). The list sits top-left in a big window with empty space under it, and the only change is an orange HTML tag, which means little to someone who doesn't read HTML. With more time: fill the window like the real Replay page (timeline on the right), or show the row rebuilding instead of the tag.

# store-intro: SPEC (storyline A, "Follow the red dot", cut to four beats)

Fifth version. The story now follows what really happens: start recording, use a third-party site in a browser while you talk, stop, download the ZIP, see what is inside, open it as a replay, read the timeline. Motion is calm and eased (entrances 0.8-1 s power3.out, exits 0.6 s power2.in). The red dot only blinks as a recording light. intro → record → zip hand off on the same pixels (the live card, then the ZIP); the other seams dip to the ground.

GOAL:    a Chrome Web Store visitor gets, in one take, what Blook records (the real page, everything under it, your voice), that it leaves as one local ZIP an agent can read, and that it serves their job; they remember "the red dot recorded everything".
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps
MUSIC:   "Background Music" by JonasBlakewood (synthwave, Pixabay Content License), started 3.93 s in so its drop lands on Start recording (4.0 s); muffled from Stop until the ZIP lands on its next phrase (13.86 s); fades out over 2 s. SFX from the media-use library (Pixabay licence) on every click, the listed recording, the ZIP flight and landing, one whoosh as the tiles burst out, the bug and a soft chime on the logo, each started early by its file's lead-in. Mix -16 LUFS. See assets/bgm/CREDITS.md and index.html.
TIME:    47.85 s x 30 = 1436 frames. Every scene plays 1.1x (SPEED in each composition); the shot times below are the authored 1x times. Silent (no music source here), no beat grid.

LOOK:    the product's light world. Ground slate-100 #f1f5f9 (flat, no grain, no vignette); surfaces white / #f8fafc; lines #e2e8f0.
         Ink slate-900 #0f172a, muted slate-500 #64748b, action slate-700 #334155.
         Vermilion #f2542d ONLY on the carrier dot (and the logo's iris it becomes). Amber #f59e0b / #fffbeb only for "now" and "this one":
         the playhead, the 0:13.0 band, the element outlines. Errors red-600 #dc2626 / rows #fee2e2 #991b1b. Speech #dbeafe #1e40af. Click #e0f2fe #075985.
         Titles: Inter 900, 76-96 px, tracking -0.035em, ink, one line or two, never centred over UI. Quiet lines Inter 400 34-36 px slate-500.
         Mono: JetBrains Mono 26-30 px (timeline, terminal, code). Narration Inter 600 38 px in a speech-blue bubble.
         Medium: real product UI rebuilt from the screenshots and source at 1.5-1.8x; windows radius 14-18, shadow 0 20 60 rgba(15,23,42,.10).

OBJECTS: the TodoMVC list (three rows, about 2x: "Ask the agent to fix the sync error", "Write the release notes", "Send the ZIP to the agent");
         the narration as one blue speech bubble; a scrubber with the amber playhead; an amber outline with its tag on the ticked row;
         four lanes (Voice, Page, Network, Console) with one real event each; an agent's terminal with the ZIP chip, one `blook pointer` command and one answer;
         the macOS arrow cursor (only in beat 1); the carrier dot; the Blook logo SVG.
RULE:    one thing on screen at a time. Titles are centred, Inter 800 112 px, alone. Shots have no title. The dot only blinks; it never flies.
MOTION:  arrivals expo.out / power4.out 0.4-0.6 s; camera and morphs power2.inOut 0.5-0.8 s; exits power3.in 0.15-0.3 s (40-50% of the entrance).
         Cursor moves power3.inOut 0.6-0.8 s; a click is a 2-frame press to scale 0.88 and the UI answers on that frame. No click rings.
         The dot travels on power2.inOut 0.5-0.7 s, never fades: every scene seam hands it over at the same pixel.
         Words: blur 6-8 px → 0 in 0.13-0.15 s, 0.067-0.09 s apart, no translate. Narration words appear 0.13 s apart.

SHOTS:
 0. intro 0-6.8. f0: "● Record your browser / while you talk", the dot blinking. The side panel at 2x; the cursor clicks Start recording
    (4.4); the card turns live, its light blinking, its timer at 0:02. Holds: the next scene starts on the same pixels.
 1. record 6.8-17.8. The camera pulls back from the live card: it is Blook's side panel docked in a Chrome window, next to TodoMVC
    (URL bar demo.playwright.dev/todomvc, "todos"). Your words grow as a big dark subtitle under the window, outside the page, with a pulsing red mic and live level bars. The cursor ticks
    "Write the release notes". The camera moves in on the panel (1.7x); Stop recording (a ripple from the button); the panel shows Start recording and
    "Recordings (1)" with the download button; download; the ZIP flies out of the button to the centre, lands with a bounce and a red ring, and its file name appears.
 2. zip 17.8-25.7. "One ZIP holds it all" under the ZIP. It unzips and six tiles from the site come out of it one at a time
    (Your voice, The page, Every click, Network, WebSockets, Console).
 3. page 25.7-35.8. "Full replay. / Not a video.". A viewer window ("Blook Replay" + the ZIP's name): the ticked row outlined,
    its tag flipping `<li class="completed">` ↔ `<li>` as the playhead scrubs over 0:12.9.
 4. clock 35.8-47.4. "Everything on one timeline". Four lanes; the playhead sweeps to 0:13.0, the amber band, a 1.2x push-in on the events.
 5. end 47.4-53.4. Logo, "Blook", "Full browser replay, with audio transcription", "Free and open source · github.com/cyrillbrito/blook".

BANNED:  more than one idea in a frame; a title next to product UI; side panels, URL bars and labels the beat does not need; dark ground; glow, particles, gradients, glass; cream paper + serif; corner labels, HUD, frame borders; three cards in a row; the logo docked in a
         corner; everything fading and sliding up; a title over a dimmed screenshot; text moving while read; click rings; bouncing UI; pulsing dots;
         size or time-saved numbers, "100%", "pixel-perfect", "DevTools"; Jira's name, logo or look; invented product UI.

QA:      f0 the idea, dot on; 6.8 seamless live card hand-off; 11 full subtitle + tick; 13.7 Stop at 1.7x; 15.6 Recordings (1) + download;
         17.8 seamless ZIP hand-off; 24 six tiles; 31 replay window with the tag; 45 push-in on 0:13.0; 52 end card.

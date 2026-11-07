# Videos

Marketing films for Blook: the README, the website, the Chrome Web Store and social posts. Each film is a [HyperFrames](https://hyperframes.heygen.com) project: HTML, CSS and a paused GSAP timeline that the `hyperframes` CLI seeks frame by frame in headless Chrome and encodes to MP4 with ffmpeg. No React and no build step.

## Layout

- `MESSAGING.md`: the selling points, the audiences, what a film may claim, and the beats of the store intro.
- `BRIEF.md`: the product facts, the real TodoMVC example, the brand and the rules every film follows. Read it before building or changing a film.
- `films/<film>/`: one HyperFrames project per film. `index.html` mounts one scene per file in `compositions/`. `STORYLINES.md` holds the three angles considered, `SPEC.md` the one built, and `REVIEW.md` what was checked and what is weak.
- `shared/`: symlinks to the real logo (`packages/ui/src/icon.svg`) and screenshots (`store/images/`, `docs/images/`). A film's `assets/` links to these, so a new logo or screenshot reaches every film on the next render.
- `out/`: renders, git-ignored. Copy a render to where it is used (for example `docs/images/`) and commit it there.

| Film | Format | For |
| --- | --- | --- |
| `store-intro` | 16:9, 48 s, music and sound effects | The Chrome Web Store intro: start recording, talk over a real site, stop, the ZIP and what it holds, the replay, the timeline |

## Commands

Run them from this folder. The CLI version is pinned in `package.json`, so a film renders the same later.

```sh
bun run preview films/store-intro     # live preview to scrub and edit (Studio), on port 3002
bun run lint films/store-intro        # lint, runtime, layout and contrast checks
bun run snapshot films/store-intro --at 1,5,9   # PNG frames to look at
bun run render store-intro            # out/store-intro.mp4
bun run render store-intro --gif      # also out/store-intro.gif, 960 px wide
```

A new film: `bunx hyperframes init films/<name> --skip-skills --skill=hyperframes`, then delete the `AGENTS.md`, `CLAUDE.md` and `package.json` it writes (this README and the root skills replace them) and link the assets it needs from `shared/`.

Agents use the `hyperframes`, `hyperframes-cli`, `hyperframes-registry` and `media-use` skills in `.agents/skills/`.

## Limits

- Music and sound effects are files in a film's `assets/` (free Pixabay tracks, and the `media-use` skill's bundled effects), each listed with its licence in a `CREDITS.md` next to it.
- Product UI in the films is rebuilt in HTML from the real screenshots and labels. When the UI changes, the films need a pass, not only a re-render.
- `films/` is not formatted by oxfmt, because HyperFrames Studio rewrites the scripts in those files.

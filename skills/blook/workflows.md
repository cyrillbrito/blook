# Workflows

`B` is the unzipped bundle. "The chain" is in SKILL.md; the jq is in [recipes.md](recipes.md).

## Bug triage: "what was broken and why"

1. Read the narration and the timeline. Mark every moment the user names a problem ("broken", "wrong", "doesn't", "should", "error", "slow", "nothing happens"). One session often holds several: handle each.
2. For each moment, read the ±5 s window. Widen it backwards when the words came after the action.
3. Look for:
   - `request-failed` entries: read the response body.
   - A `request` with status 200 but the wrong data: read its body.
   - `error` entries: read the `stack` in `console.json`.
   - Missing reactions: a click followed by no request, no DOM change, or the same click again.
4. A failed request with no console error can mean the app swallows errors: read the console window unfiltered.
5. Confirm the element with `pointer` at the click or the pointing word, and what the page showed with `dom --selector` at about T+500.
6. With the repo open, search for the endpoint path, the error text or the component on screen, and name the file and line you suspect.
7. Diagnose without changing code unless the user asked for a fix. A fix changes the cause; a retry or a swallowed error isn't one. Verify a fix by replaying the recorded steps or with a test, and say which.

Report each issue like this:

```
## [00:09] Save does nothing
Said: "I type my email, click save, and nothing happens here." [00:09.3–00:10.6]
Pointer: button#save "Save" [00:09.648]
Evidence:
- [00:09.650] POST /api/profile → 501 (id 75559.10)
- [00:09.661] Uncaught TypeError: Cannot read properties of undefined (reading 'message') at :21:50
Cause: the 501 body isn't JSON, `r.json()` falls back to undefined, then `d.message` throws.
Not checked: why the server rejects POST.
Next: check `r.ok` before reading the body, and show the error.
```

## Walkthrough to task list: "do what I said"

1. Read every segment. "Also", "another thing" and "and then" mean more asks follow; a walkthrough often holds 5 to 15. Filler over silence ("thank you") is transcription noise.
2. For each ask, note an id (T1, T2…), its `t`, the verbatim quote, a type (bug, visual, behavior, feature) and the `pointer` target at its "this" or "here".
3. Post the list first:

   ```
   T2 · [00:04.3] · bug
   Said: "The list shows, but this detail thing is broken."
   Pointer: button#load "Load orders" [00:04.744]
   Evidence: GET /api/orders/missing → 404 [00:03.344]
   Plan: …
   ```

4. Ask about any ask with two readings, and start on the rest. End with a count: "9 asks: 7 done, 1 deferred, 1 needs an answer". Every ask not done says why.

## Narrated flow to E2E test

1. **Decide what the test asserts.** "Cover this flow": what the recording shows, passing today. "Regression test for this bug": what should have happened, failing until the fix lands. Write the expected result in one sentence; if it's unclear, ask.
2. **Rebuild the steps** from the `navigation`, `click` and `input` timeline entries, in order. `target` gives the tag, accessible name and id; `pointer` at each click adds role, aria attributes, `data-testid` and ancestry. The narration tells intended steps from fumbles.
3. **Take assertions from the network** and the screen: each step's request (method, path, status) and the response data that appears next. Assert the visible outcome; wait on a response only to synchronize.
4. **Ground labels and routes in today's code**, not the recording. Find the component that renders each screen, and list every difference.
5. **Use the project's runner, fixtures and sign-in.** Only when there are none, use Playwright in the project's language, and say so.
6. **Locate elements as a person sees them:** role and name, label, placeholder, text. Never generated class names (`css-1f8mf9c`) or positions. Retrying assertions, no fixed sleeps.
7. **Run it.** A flow test passes twice in a row. A bug test fails on the assertion that encodes the bug, not on a timeout or setup. If the bug doesn't reproduce, say what differs: data, account or environment.
8. **Hand off** the numbered steps, the test path and the command that runs it, the run output, and the differences from the code. At the top of the test, a comment with the bundle id and the time of each step.

Test data in bodies (ids, names, emails) shows what the flow used. Don't hard-code it unless the test setup creates it.

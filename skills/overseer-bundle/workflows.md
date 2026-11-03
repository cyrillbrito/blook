# Workflows

Recipes are in [recipes.md](recipes.md). `B` is the unzipped bundle.

## Bug triage: "what was broken and why"

1. Read the timeline and speech. Mark every moment the user names a problem ("broken", "wrong", "doesn't", "should", "error", "slow", "nothing happens"). One narrated session often holds several issues: handle each one.
2. For each moment, read the timeline window of about ±5 s around it. Widen it when the action came earlier than the words, which is common: people often speak after they act.
3. Look for:
   - `request-failed` entries. Read the response body.
   - A `request` with status 200 but the wrong data. Read its body.
   - `error` entries. Read the `stack` in `console.json`.
   - Missing reactions: a click followed by no request, no change in the DOM, or the same click again.
4. If the network failed but there's no console error, the app may be swallowing errors. Read the console window unfiltered, `console` entries included.
5. Run `pointer` at the click or at the pointing word to confirm the element. Run `dom --selector` at about `t + 500` to see what the page showed after it.
6. With the repo open, search for the endpoint path, the error text or the component on screen, and name the file and line you suspect.
7. Diagnose without changing code unless the user asked for a fix. A fix changes the cause. A retry or a swallowed error is not a fix. Verify the fix by replaying the recorded steps or with a test, and say which.

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

1. Read every speech segment. "Also", "another thing" and "and then" mean more asks follow. A walkthrough often holds 5 to 15 asks, so don't stop at the first bug. Filler over silence ("thank you") is transcription noise.
2. For each ask, write down:
   - an id (T1, T2…)
   - its `t`
   - the verbatim quote
   - a type: bug, visual, behavior or feature
   - the `pointer` target at its "this" or "here"
3. Post the list first:

   ```
   T2 · [00:04.3] · bug
   Said: "The list shows, but this detail thing is broken."
   Pointer: button#load "Load orders" [00:04.744]
   Evidence: GET /api/orders/missing → 404 [00:03.344]
   Plan: …
   ```

4. Ask about any ask with two readings, and start on the rest. End with a count: "9 asks: 7 done, 1 deferred, 1 needs an answer". Every ask that isn't done says why.

## Narrated flow to E2E test

1. **Decide what the test asserts.**
   - "Cover this flow": the test asserts what the recording shows, and it passes today.
   - "Regression test for this bug": it asserts what should have happened, and it fails until the fix lands.
   - Write the expected result in one sentence. If the recording and the user leave it unclear, ask.
2. **Rebuild the steps** from the `navigation`, `click` and `input` timeline entries, in order. Their `target` gives the tag, accessible name and id. `pointer` at the click time adds the role, aria attributes, `data-testid` and ancestry. Use the narration to tell intended steps from fumbles.
3. **Pick assertions and waits from the network.** Each step's request (method, path, status) and the response data that appears on screen next. Assert the visible outcome. Wait on a response only to synchronize.
4. **Ground every label and route in today's code**, not in the recording. Find the component that renders the screen, and list every difference between the recording and the code.
5. **Use the project's runner, fixtures and sign-in setup.** Only when there are none, use Playwright in the project's language, and say so.
6. **Locate elements by what a person sees:** role and name, label, placeholder, text. Never by generated class names from the recording (`css-1f8mf9c`) or by position. Use retrying assertions, and no fixed sleeps.
7. **Run it.**
   - A flow test passes twice in a row.
   - A bug test fails on the assertion that encodes the bug, not on a timeout or a setup error.
   - If the bug doesn't reproduce, say what differs from the recording: data, account or environment.
8. **Hand off:**
   - the numbered steps
   - the test path and the command that runs it
   - the run output
   - the differences between the recording and the code
   - at the top of the test, a comment with the bundle id and the time of each step

Test data seen in bodies (ids, names, emails) shows what the flow used. Don't hard-code it unless the test setup creates it.

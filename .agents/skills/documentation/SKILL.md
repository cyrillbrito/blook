---
name: documentation
description: Write, update, or clean up a project's documentation in AGENTS.md, docs/, and code comments. Use after building or changing a feature, or when asked to document, restructure, or review docs or comments.
---

# Documentation

A project documents itself in three layers. Each fact has exactly one home, in the layer that fits it.

| Layer | Reader | Holds |
|---|---|---|
| `AGENTS.md` | Every agent session, whatever the task | A short intro, stack, commands, rules agents get wrong, and an index of `docs/` |
| `docs/` | Agents and human developers | What each feature is for, what the user sees, what happens, and why it works this way |
| Code comments | Whoever edits that line | The why the code can't show: a workaround, a library or platform constraint, a choice that looks wrong but isn't |

The code itself is the technical truth. Skills are a fourth place but not project docs: they hold processes and style guides that apply across projects. If a text describes the product, it goes in `docs/`. If it describes how to work, it goes in a skill or a rule in `AGENTS.md`.

## Rules for every layer

- Describe the current state only. No history, no changelog, no plans.
- Never justify the change you just made. Explaining why the design is this way is fine. Explaining why you changed it is not.
- Banned framing: "now", "new", "previously", "no longer", "instead of the old", "we changed", "updated to", "moved from", "for now", "will", "planned", "TODO later".
- Abstractions that exist in the code may be described ("any provider that implements `send` works"). Features that don't exist yet may not.
- Point first: the first sentence says what the thing is.
- Condense hard. Plain words, full sentences, one idea per sentence. Cut what the reader gets faster from the code: function names, constants, file walkthroughs.
- Say it once. When two places say the same thing, keep the better home and link to it.

## The pass

Do all three layers in one pass, in this order.

1. Read the `unslop` skill: `references/core-contract.md`, `references/taboo-phrases.md`, and the `crisp` preset. All three layers follow it. If it is not installed, tell the user to run `npx skills add theclaymethod/unslop -g` and follow the rules here meanwhile.
2. Read the change (the diff or the feature's code) and every doc that touches the same area, including `AGENTS.md`. Read whole files, not just the paragraph you expect to edit. Describe the change as what the user sees and does differently, not as which files changed.
3. Search for the old facts. For every name, label, setting, value, or behavior the change renamed or removed, search all docs, `AGENTS.md`, and comments for the old version. Stale facts usually sit in docs the diff never touched.
4. List the facts. For each fact in the affected docs and comments, note where it lives and where it belongs. Look for facts that appear twice, facts in the wrong layer, facts that are stale against the code, and sections that drifted into the wrong file.
5. Restructure. Move, merge, split, rename, and delete as the list demands. This is expected work, not a risk to avoid: the user wants the docs reorganized when that serves the reader, not edited in place. Do not preserve a structure just because it is there.
6. Rewrite what remains, condensed, under the rules above.
7. Fix links and the `docs/` index in `AGENTS.md`. Search for links to every file or heading you moved or renamed.
8. Check every claim against the code. Delete what you can't confirm.
9. Search what you wrote for the banned framing words above, and fix every hit.

Condensing in place is the usual failure. If the pass only shortened sentences, go back to step 4.

For a new doc or a large restructure, ask a fresh agent with no context to read it and say what the feature does and why. Fix what it gets wrong or has to guess.

### When to move text

- One home per fact. A fact used by two features goes in the doc of the concept both rely on, and the feature docs link to it.
- Group by what the reader comes for, a feature or a concept, never by when it was written.
- Split a doc that covers two features, or takes more than two minutes to read.
- Merge docs that are always read together, or a doc too small to stand alone.
- Condense before you split. Splitting a bloated doc gives several bloated docs.
- Technical detail in `docs/` moves to the code, or goes if the code already says it.
- Intent in a comment moves to `docs/`, and the comment links there if the code would mislead without it.
- Plans, brainstorms, and comparisons move to `docs/explorations/` (or the project's equivalent). When an exploration gets built, its feature doc takes over and the exploration is deleted.

## AGENTS.md

It loads into every session: coding, frontend, database, docs. Every line must earn that.

- Keep it to about 100 lines. When it grows, move content to `docs/` and leave a link.
- Keep: a few lines on what the project is, the stack, the commands to run and test, rules that agents break without being told, and the index of `docs/` with one line per doc.
- Leave out: overviews of the code structure that the agent can find itself, anything only one kind of task needs, anything already in `docs/`, and rules a linter, formatter, or type checker already enforces.
- Add a gotcha from the current work only if a future agent on an unrelated task would trip on it.
- Knowledge that nearly every task needs belongs here or in a doc it indexes, not in a skill, because agents often skip skills.

## docs/

The user manual of what exists today, readable by a human who never opened the code.

- One doc per feature or area: what it is for, what the user sees, what happens, and why it works this way.
- Record a decision only when it is hard to reverse, would surprise a reader, and came from a real trade-off. Write it as one or two sentences in the feature's doc. Everything else needs no "why".
- A doc reads in a minute or two. Link one or two main files at most, and never walk through code.
- Name a number only when it shapes behavior.
- Docs link to each other instead of repeating each other.
- A feature borrowed from other apps, posts, or studies ends with a Sources section.
- Every doc appears in the index in `AGENTS.md`.

## Code comments

Comments are rare and say why, never what. For each one, ask whether a competent reader could get it from the code. If yes, delete it. If no, keep it as one short line.

- Write one when the code alone would mislead: a workaround, a constraint from a library or platform, an invariant, a choice that looks wrong but isn't.
- A comment that restates the code goes. So does one that narrates history ("was X, now Y"), explains the edit, or names a ticket or plan instead of the reason.
- A comment that contradicts the code is worse than none. Fix it or delete it.
- Curate, don't strip. Deleting a comment that carries a real why hurts the next reader, so flag where one is missing too.
- Keep lint and type pragmas, license headers, and doc comments on public APIs.
- Editing comments never changes code. If a comment can only be right after a code change, flag it instead.
- Rarely, a comment links to the doc behind a feature, when the intent explains code that otherwise looks odd.

## Reporting back

Say what moved and what was deleted in a few lines, so the user can check the structure. Don't list every edited sentence.

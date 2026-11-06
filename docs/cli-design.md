# CLI design

The `blook` CLI's main users are coding agents that learn it from `blook --help` alone. These are the rules it follows. An agent that can't find a flag in the help guesses one, so the help answers first.

- **Help is the documentation.** Top-level help says what a bundle is and the typical flow (`info` → pick a time → `pointer`/`dom`/`screenshot`). Every command, argument and option has a one-line description; every command's help shows its output shape and 1–3 real examples.
- **stdout is data, stderr is everything else.** Bundle commands print JSON (`dom --raw` prints HTML). Progress, warnings meant for people and errors go to stderr. `--quiet` silences the notes, never the errors. No color unless the stream is a TTY and `NO_COLOR` is unset.
- **Warnings travel with the data.** When the CLI shows something other than what was asked (a time before the first snapshot, no element matched), the JSON has a `warnings` array and `replayedT` says what was shown.
- **Errors say what went wrong and what to do next**, in two lines: `error: <what>` and a runnable next step. Usage errors also print the command's help, and Commander suggests the closest command or option.
- **Exit codes are stable, one per class of error.** `packages/cli/src/errors.ts` defines them and `blook --help` lists them. Add codes, never reuse one.
- **Ask, don't guess.** An input with two readings fails with both spelled out (`3.2` → "use 3.2s for seconds, or 3200 for ms"). Inputs with one obvious reading are accepted (a folder holding one unzipped bundle).
- **Never block on a prompt.** Without a terminal, `skill install` copies the skill instead of asking, and `extension` doesn't open Chrome.
- **Output shapes are a contract.** Field names change only with the skill and the docs, in the same change.
- **Tests run the CLI as an agent would**: as a subprocess against a small synthetic bundle, checking stdout, stderr and the exit code.

## Sources

[clig.dev](https://clig.dev), and the agent-CLI guides at [InfoQ](https://www.infoq.com/articles/ai-agent-cli/), [aclig.dev](https://aclig.dev/invariants/) and [cli.style](https://cli.style/).

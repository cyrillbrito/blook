#!/usr/bin/env node
// blook: look at a Blook bundle at time t. Each command lives in commands/.
import { Command, CommanderError } from 'commander';
import { CliError, EXIT, EXIT_CODES_HELP } from './errors.ts';
import { setQuiet, useColor } from './output.ts';
import { TIME_FORMATS } from './bundle.ts';
import { registerInfo } from './commands/info.ts';
import { registerReplay } from './commands/replay.ts';
import { registerSetup } from './commands/setup.ts';
import { registerExtension } from './commands/extension.ts';
import { registerSkill } from './commands/skill.ts';
import { registerTranscribe } from './commands/transcribe.ts';
import pkg from '../../../package.json' with { type: 'json' };

// `... | head` closes stdout early: exit quietly instead of crashing.
process.stdout.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EPIPE') process.exit(0);
  throw e;
});

const program = new Command('blook')
  .description(
    'Blook bundles: narrated browser recordings (blook-*.zip or folder) with DOM replay, network, voice.\n' +
      'Flow: `blook info <bundle>` → pick a time (a click, timeline.json) → `blook pointer|dom|screenshot`.',
  )
  .version(pkg.version, '-v, --version', 'print the version')
  .option('-q, --quiet', 'no progress or warnings on stderr (errors still print)')
  .helpOption('-h, --help', 'show help for a command')
  .helpCommand('help [command]', 'show help for a command')
  // Inherited by every command registered below.
  .showHelpAfterError()
  .configureHelp({ helpWidth: 100 })
  .exitOverride()
  .configureOutput({ getOutHasColors: () => useColor(process.stdout), getErrHasColors: () => useColor(process.stderr) })
  .hook('preAction', (cmd) => setQuiet(!!cmd.opts().quiet));

registerInfo(program);
registerReplay(program);
registerTranscribe(program);
registerExtension(program);
registerSkill(program);
registerSetup(program);

program.addHelpText(
  'after',
  `
Times (<t>): ${TIME_FORMATS}.\nAll bundle files share this clock.
Output: JSON on stdout (screenshot: JSON with the PNG path); progress, warnings and errors on stderr.

${EXIT_CODES_HELP}

Examples:
  blook info blook-2026-11-03_21-12-51.zip              # duration, tabs, clicks
  blook pointer blook-2026-11-03_21-12-51.zip 00:06.2   # what the mouse was on
  blook dom blook-2026-11-03_21-12-51.zip 6193 --selector 'dialog'
  blook screenshot blook-2026-11-03_21-12-51.zip 6.7s   # look at it
  blook transcribe blook-2026-11-03_21-12-51.zip        # no transcript yet: make one from audio/
Run \`blook <command> --help\` for its options and output. \`blook skill print\` has the full guide
for reading a bundle (timeline.json, network, console, transcript).`,
);

try {
  await program.parseAsync();
} catch (e) {
  process.exitCode = exitCodeFor(e);
}

function exitCodeFor(e: unknown): number {
  // Commander already printed the message (and the command's help) for its own errors.
  if (e instanceof CommanderError) return e.exitCode === 0 ? EXIT.ok : EXIT.usage;
  if (e instanceof CliError) {
    process.stderr.write(`error: ${e.message}\n${e.hint ? e.hint + '\n' : ''}`);
    return e.exitCode;
  }
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`error: ${msg}\n`);
  if (process.env.BLOOK_DEBUG && e instanceof Error) process.stderr.write(e.stack + '\n');
  return EXIT.error;
}

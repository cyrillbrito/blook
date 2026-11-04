// `blook extension`: where the unpacked Chrome extension lives, and how to load it.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import { printLine, useColor } from '../output.ts';
import { CliError, EXIT } from '../errors.ts';

// Visible and stable on purpose: easy to pick in Chrome's file dialog, and the same path keeps
// the extension's ID and settings across updates. install.sh writes the same folder.
export const extensionDir = () => join(homedir(), 'Blook', 'extension');

function extension(opts: { path?: boolean; open: boolean }) {
  const dir = extensionDir();
  if (opts.path) return printLine(dir);
  if (!existsSync(join(dir, 'manifest.json'))) {
    throw new CliError(`No extension in ${dir}.`, EXIT.notFound, 'Run `blook update` (or the install script) to download it.');
  }

  // Only open Chrome for a person at a terminal, never for a script or an agent.
  const openedChrome =
    opts.open &&
    process.stdout.isTTY &&
    process.platform === 'darwin' &&
    spawnSync('open', ['-a', 'Google Chrome', 'chrome://extensions'], { stdio: 'ignore' }).status === 0;

  const color = useColor(process.stdout);
  const s = (code: string) => (text: string) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
  const [bold, dim, cyan] = [s('1'), s('2'), s('1;36')];
  const home = homedir();
  const short = dir.startsWith(home + '/') ? '~' + dir.slice(home.length) : dir;

  process.stdout.write(`${bold('Next: load the extension in Chrome')}
  1. Open chrome://extensions${openedChrome ? dim('  (opened)') : ''}
  2. Turn on Developer mode, top right
  3. Click Load unpacked and pick ${cyan(short)}
  4. Pin Blook from the puzzle icon in the toolbar
${dim("Already loaded? After an update, just click Blook's reload icon there.")}
`);
}

export function registerExtension(program: Command) {
  program
    .command('extension')
    .description('show how to load the Chrome extension from ~/Blook/extension')
    .option('--path', 'print only the extension folder')
    .option('--no-open', "don't open chrome://extensions (it opens only on macOS, at a terminal)")
    .addHelpText(
      'after',
      `
Examples:
  blook extension          # the steps to load it in Chrome
  blook extension --path   # ~/Blook/extension, expanded`,
    )
    .action(extension);
}

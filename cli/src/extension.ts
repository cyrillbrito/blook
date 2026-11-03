// `blook extension`: where the unpacked Chrome extension lives, and how to load it.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Visible and stable on purpose: easy to pick in Chrome's file dialog, and the same path keeps
// the extension's ID and settings across updates. install.sh writes the same folder.
export const extensionDir = () => join(homedir(), 'Blook', 'extension');

export function extensionCommand(opts: { pathOnly?: boolean; open?: boolean }) {
  const dir = extensionDir();
  if (opts.pathOnly) return void process.stdout.write(dir + '\n');
  if (!existsSync(join(dir, 'manifest.json'))) {
    process.stderr.write(`No extension in ${dir}. Run \`blook update\` (or the install script) to get it.\n`);
    process.exit(1);
  }

  const openedChrome =
    opts.open !== false &&
    process.platform === 'darwin' &&
    spawnSync('open', ['-a', 'Google Chrome', 'chrome://extensions'], { stdio: 'ignore' }).status === 0;

  const color = process.stdout.isTTY && !process.env.NO_COLOR;
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

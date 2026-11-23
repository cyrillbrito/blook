// `blook extension`: where to get the Chrome extension (the Chrome Web Store) and how to start.
import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import { printLine, useColor } from '../output.ts';

export const STORE_URL = 'https://chromewebstore.google.com/detail/njijkneplfdknfbmbokldfpbdhgpppbi';

function extension(opts: { url?: boolean; open: boolean }) {
  if (opts.url) return printLine(STORE_URL);

  // Only open Chrome for a person at a terminal, never for a script or an agent.
  const openedChrome =
    opts.open &&
    process.stdout.isTTY &&
    process.platform === 'darwin' &&
    spawnSync('open', ['-a', 'Google Chrome', STORE_URL], { stdio: 'ignore' }).status === 0;

  const color = useColor(process.stdout);
  const s = (code: string) => (text: string) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
  const [bold, dim, cyan] = [s('1'), s('2'), s('1;36')];

  process.stdout.write(`${bold('Next: add the extension to Chrome')}
  1. Open ${cyan(STORE_URL)}${openedChrome ? dim('  (opened)') : ''}
  2. Click Add to Chrome
  3. Pin Blook from the puzzle icon in the toolbar, and click it to start recording
${dim('Chrome keeps it up to date.')}
`);
}

export function registerExtension(program: Command) {
  program
    .command('extension')
    .description('show how to add the Chrome extension from the Chrome Web Store')
    .option('--url', 'print only the Chrome Web Store URL')
    .option('--no-open', "don't open the store page (it opens only on macOS, at a terminal)")
    .addHelpText(
      'after',
      `
Examples:
  blook extension         # the steps to add it to Chrome
  blook extension --url   # the Chrome Web Store URL`,
    )
    .action(extension);
}

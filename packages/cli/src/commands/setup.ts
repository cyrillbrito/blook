// `blook install-browser` and `blook update`.
import { basename, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import { installBrowser } from '../browser.ts';
import { note, printLine } from '../output.ts';
import { CliError, EXIT } from '../errors.ts';

const INSTALL_URL = 'https://raw.githubusercontent.com/cyrillbrito/blook/main/install.sh';

export function registerSetup(program: Command) {
  program
    .command('install-browser')
    .description('download the Chrome headless shell the replay uses (~100 MB); not needed with Google Chrome installed')
    .option('--force', 'download again even if it is installed')
    .addHelpText(
      'after',
      `
Prints the browser's executable path. Honours PLAYWRIGHT_BROWSERS_PATH.

Example:
  blook install-browser`,
    )
    .action(async (opts: { force?: boolean }) => {
      const shell = await installBrowser({ force: opts.force, log: note });
      printLine(shell.executable);
    });

  program
    .command('update')
    .description('re-run the install script: latest CLI, extension and skill')
    .addHelpText(
      'after',
      `
Env: BLOOK_INSTALL_DIR, BLOOK_NO_EXTENSION=1, BLOOK_NO_SKILL=1 (see install.sh).

Example:
  blook update`,
    )
    .action(() => {
      // The compiled binary updates itself where it lives; under Node/Bun the script's default applies.
      const env = { ...process.env };
      if (basename(process.execPath) === 'blook') env.BLOOK_INSTALL_DIR ??= dirname(process.execPath);
      const res = spawnSync('sh', ['-c', `curl -fsSL ${INSTALL_URL} | sh`], { stdio: 'inherit', env });
      if (res.status !== 0) {
        throw new CliError(
          `The install script failed (exit ${res.status ?? 'signal'}).`,
          EXIT.network,
          `Check the network, then run \`blook update\` again, or run \`curl -fsSL ${INSTALL_URL} | sh\`.`,
        );
      }
    });
}

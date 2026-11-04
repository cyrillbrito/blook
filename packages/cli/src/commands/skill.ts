// `blook skill install|path|print`: put the agent skill (skills/blook/) where agents find it.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';
import { note, printLine } from '../output.ts';
import { CliError, EXIT } from '../errors.ts';

const REPO = 'cyrillbrito/blook';
const FILES = ['SKILL.md', 'recipes.md', 'rrweb.md', 'workflows.md'] as const;

/** The skill files: embedded in the compiled binary (Bun text imports), read from the repo under Node. */
async function skillFiles(): Promise<Record<string, string>> {
  if (process.versions.bun) {
    const mods = await Promise.all([
      import('../../../skills/blook/SKILL.md', { with: { type: 'text' } }),
      import('../../../skills/blook/recipes.md', { with: { type: 'text' } }),
      import('../../../skills/blook/rrweb.md', { with: { type: 'text' } }),
      import('../../../skills/blook/workflows.md', { with: { type: 'text' } }),
    ]);
    return Object.fromEntries(FILES.map((f, i) => [f, mods[i].default]));
  }
  const dir = new URL('../../../skills/blook/', import.meta.url);
  return Object.fromEntries(FILES.map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]));
}

const copyDir = () => join(homedir(), '.agents', 'skills', 'blook');

async function copyInstall() {
  const dir = copyDir();
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(await skillFiles())) writeFileSync(join(dir, name), text);
  note(`Installed the blook skill to ${dir}`);
  printLine(dir);
}

async function install(args: string[], copy: boolean) {
  if (!copy && !args.length && !process.stdin.isTTY) {
    // The skills CLI asks which agents to link into; with no terminal it can't ask.
    note('No terminal for the skills CLI to ask which agents to use, so copying the skill instead. To pick agents, pass flags such as `-a claude-code -y`.');
    copy = true;
  }
  if (!copy) {
    // Vercel's skills CLI links the skill into the agents you pick. Extra args go to it, e.g. `-a claude-code -y`.
    const cmd = ['skills', 'add', REPO, '--skill', 'blook', '-g', ...args];
    note(`$ npx ${cmd.join(' ')}`);
    const res = spawnSync('npx', ['-y', ...cmd], { stdio: 'inherit', shell: process.platform === 'win32' });
    if (res.error == null && res.status === 0) return;
    if (res.error == null) {
      // npx ran and failed: it already printed why.
      throw new CliError(`npx skills add failed (exit ${res.status}).`, EXIT.error, 'Run `blook skill install --copy` to copy the embedded skill to ~/.agents/skills/blook/ instead.');
    }
    note('npx not found; copying the embedded skill instead.');
  }
  await copyInstall();
}

export function registerSkill(program: Command) {
  const skill = program
    .command('skill')
    .description('install the blook agent skill, or print it')
    .addHelpText('after', `
Examples:
  blook skill print                      # SKILL.md, the guide for agents reading bundles
  blook skill install -a claude-code -y  # link it into Claude Code via \`npx skills add\`
  blook skill install --copy             # write it to ~/.agents/skills/blook/`);

  skill
    .command('install')
    .description('install the skill with `npx skills add` (asks which agents), or copy it with --copy')
    .argument('[flags...]', 'extra flags for `npx skills add`, e.g. -a claude-code -y')
    .option('--copy', 'write the embedded skill to ~/.agents/skills/blook/ instead (also used without npx or a terminal)')
    .allowUnknownOption()
    .addHelpText('after', `
Examples:
  blook skill install                    # pick agents interactively
  blook skill install -a claude-code -y
  blook skill install --copy`)
    .action(async (flags: string[], opts: { copy?: boolean }) => {
      const copy = !!opts.copy || flags.includes('--copy');
      await install(flags.filter((f) => f !== '--copy'), copy);
    });

  skill
    .command('path')
    .description('print the folder `skill install --copy` writes to')
    .action(() => printLine(copyDir()));

  skill
    .command('print')
    .description('print SKILL.md to stdout')
    .action(async () => printLine((await skillFiles())['SKILL.md']));
}

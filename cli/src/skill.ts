// `blook skill install|path|print`: put the agent skill (skills/blook/) where agents find it.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const REPO = 'cyrillbrito/blook';
const FILES = ['SKILL.md', 'recipes.md', 'rrweb.md', 'workflows.md'] as const;

/** The skill files: embedded in the compiled binary (Bun text imports), read from the repo under Node. */
async function skillFiles(): Promise<Record<string, string>> {
  if (process.versions.bun) {
    const mods = await Promise.all([
      import('../../skills/blook/SKILL.md', { with: { type: 'text' } }),
      import('../../skills/blook/recipes.md', { with: { type: 'text' } }),
      import('../../skills/blook/rrweb.md', { with: { type: 'text' } }),
      import('../../skills/blook/workflows.md', { with: { type: 'text' } }),
    ]);
    return Object.fromEntries(FILES.map((f, i) => [f, mods[i].default]));
  }
  const dir = new URL('../../skills/blook/', import.meta.url);
  return Object.fromEntries(FILES.map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]));
}

const copyDir = () => join(homedir(), '.agents', 'skills', 'blook');

async function copyInstall() {
  const dir = copyDir();
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(await skillFiles())) writeFileSync(join(dir, name), text);
  process.stdout.write(`Installed the blook skill to ${dir}\n`);
}

export async function skillCommand(sub: string | undefined, args: string[], copy: boolean) {
  if (sub === 'path') return void process.stdout.write(copyDir() + '\n');
  if (sub === 'print') return void process.stdout.write((await skillFiles())['SKILL.md']);
  if (sub !== 'install') throw new Error('Usage: blook skill install [--copy] [skills-cli flags] | path | print');

  if (!copy) {
    // Vercel's skills CLI links the skill into the agents you pick. Extra args go to it, e.g. `-a claude-code -y`.
    const cmd = ['skills', 'add', REPO, '--skill', 'blook', '-g', ...args];
    process.stderr.write(`$ npx ${cmd.join(' ')}\n`);
    const res = spawnSync('npx', ['-y', ...cmd], { stdio: 'inherit', shell: process.platform === 'win32' });
    if (res.error == null && res.status === 0) return;
    if (res.error == null) process.exit(res.status ?? 1); // npx ran and failed: show its error, don't hide it.
    process.stderr.write('npx not found; copying the embedded skill instead.\n');
  }
  await copyInstall();
}

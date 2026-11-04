// Files the CLI reads as text: the rrweb replayer (its UMD build, injected into the replay page)
// and CSS, Playwright's browsers.json, and the agent skill. When running from source they are read
// from disk, found through this package's dependencies. build.ts swaps this module for one with the
// contents inlined, so the compiled binary carries them and runs from anywhere.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_FILES = ['SKILL.md', 'recipes.md', 'rrweb.md', 'workflows.md'] as const;

/** Absolute paths of every embedded file. Neither the UMD build nor browsers.json is in its package's exports. */
export function assetPaths() {
  const require = createRequire(import.meta.url);
  const skillDir = fileURLToPath(new URL('../../../skills/blook/', import.meta.url));
  return {
    replayJs: join(dirname(require.resolve('@rrweb/replay')), '../umd/replay.min.js'),
    replayCss: require.resolve('@rrweb/replay/dist/style.css'),
    browsersJson: join(dirname(require.resolve('playwright-core/package.json')), 'browsers.json'),
    skill: Object.fromEntries(SKILL_FILES.map((f) => [f, join(skillDir, f)])) as Record<(typeof SKILL_FILES)[number], string>,
  };
}

/** The contents, keyed like assetPaths(). */
export function readAssets() {
  const p = assetPaths();
  const read = (path: string) => readFileSync(path, 'utf8');
  return {
    replayJs: read(p.replayJs),
    replayCss: read(p.replayCss),
    browsersJson: read(p.browsersJson),
    skill: Object.fromEntries(Object.entries(p.skill).map(([f, path]) => [f, read(path)])) as Record<(typeof SKILL_FILES)[number], string>,
  };
}

let cache: ReturnType<typeof readAssets> | undefined;
export const assets = (): ReturnType<typeof readAssets> => (cache ??= readAssets());

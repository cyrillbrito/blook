// End-to-end tests: run the CLI as an agent would and check stdout, stderr and the exit code.
// Fixture: test/fixtures/blook-fixture.zip (see make-fixture.ts).
import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';
import { ReplayEngine } from '../src/replay.ts';
import { parseTime } from '../src/bundle.ts';
import { FIXTURE } from './make-fixture.ts';

const CLI = join(import.meta.dir, '../src/cli.ts');
const ZIP = join(import.meta.dir, 'fixtures/blook-fixture.zip');
const tmp = mkdtempSync(join(tmpdir(), 'blook-test-'));

function run(...args: string[]) {
  const p = Bun.spawnSync(['bun', CLI, ...args], { stdin: 'ignore', env: { ...process.env, NO_COLOR: '1' } });
  const stdout = p.stdout.toString();
  return { code: p.exitCode, stdout, stderr: p.stderr.toString(), json: () => JSON.parse(stdout) };
}

// Replay commands need Chromium: Playwright's headless shell or Google Chrome.
const hasBrowser = await ReplayEngine.launch().then((e) => e.close().then(() => true), () => false);
if (!hasBrowser) console.warn('No browser found: skipping screenshot, dom and pointer tests. Run `blook install-browser` or install Google Chrome.');
const withBrowser = test.skipIf(!hasBrowser);

let folder: string;
beforeAll(() => {
  // The same bundle unzipped, to test folder input.
  for (const [name, data] of Object.entries(unzipSync(readFileSync(ZIP)))) {
    const p = join(tmp, name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, data);
  }
  folder = join(tmp, `blook-${FIXTURE.id}`);
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('help', () => {
  test('top level explains bundles, the flow, exit codes and examples', () => {
    const r = run('--help');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Blook bundles:');
    expect(r.stdout).toContain('Flow: `blook info <bundle>`');
    expect(r.stdout).toContain('Exit codes:');
    expect(r.stdout).toContain('Examples:\n  blook info ');
  });
  for (const cmd of ['info', 'pointer', 'dom', 'screenshot', 'extension', 'skill', 'install-browser', 'update']) {
    test(`${cmd} --help has examples`, () => {
      const r = run(cmd, '--help');
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/Examples?:\n  blook /);
    });
  }
  test('--version', () => {
    const r = run('--version');
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('info', () => {
  test('zip', () => {
    const r = run('info', ZIP);
    expect(r.code).toBe(0);
    const info = r.json();
    expect(info).toMatchObject({ id: FIXTURE.id, durationMs: 5000, duration: '00:05.000' });
    expect(info.tabs).toHaveLength(1);
    expect(info.tabs[0]).toMatchObject({ tab: String(FIXTURE.tabId), firstSnapshotAt: 20, viewport: FIXTURE.viewport });
    expect(info.tabs[0].clicks).toEqual([{ time: '00:02.000', t: 2000, type: 'Click', nodeId: 10, x: 160, y: 120, target: 'button "Save" #save' }]);
  });
  test('folder, and the folder it was unzipped into, give the same result', () => {
    const zip = run('info', ZIP).json();
    expect(run('info', folder).json()).toEqual(zip);
    expect(run('info', tmp).json()).toEqual(zip);
  });
});

describe('errors and exit codes', () => {
  test('missing argument: usage on stderr, exit 2', () => {
    const r = run('pointer', ZIP);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain("missing required argument 't'");
    expect(r.stderr).toContain('Usage: blook pointer');
  });
  test('no command: help on stderr, exit 2', () => {
    const r = run();
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Usage: blook');
  });
  test('unknown command suggests the right one', () => {
    const r = run('infoo', ZIP);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Did you mean info?');
  });
  test('bad time format: exit 2 with the formats', () => {
    const r = run('dom', ZIP, 'soon');
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('(00:18.5)');
  });
  test('time after the end: exit 4 with the range', () => {
    const r = run('pointer', ZIP, '99:00');
    expect(r.code).toBe(4);
    expect(r.stderr).toContain('Time 99:00 is after the end of the recording (00:05.000).');
    expect(r.stderr).toContain('Use a time between 00:00 and 00:05.000');
  });
  test('bundle not found: exit 3', () => {
    const r = run('info', join(tmp, 'nope.zip'));
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('Bundle not found');
    expect(r.stderr).toContain('Pass a blook-*.zip');
  });
  test('not a zip: exit 3', () => {
    const bad = join(tmp, 'bad.zip');
    writeFileSync(bad, 'not a zip');
    const r = run('info', bad);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('is not a zip file');
  });
  test('folder without session.json: exit 3', () => {
    const r = run('info', join(import.meta.dir, 'fixtures'));
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('no session.json');
  });
  test('unknown tab: exit 2 with the tab list', () => {
    const r = run('pointer', ZIP, '2000', '--tab', '7');
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(`one of: ${FIXTURE.tabId}`);
  });
  test('bad --wait: exit 2', () => {
    expect(run('pointer', ZIP, '2000', '--wait', 'long').code).toBe(2);
  });
});

describe('time formats', () => {
  test.each([
    ['2000', 2000],
    ['2000ms', 2000],
    ['12.3s', 12300],
    ['2s', 2000],
    ['00:02', 2000],
    ['00:18.5', 18500],
    ['01:02.345', 62345],
    ['1:00:00', 3600000],
  ])('%s → %d ms', (s, ms) => expect(parseTime(s)).toBe(ms));
  test.each(['', 'abc', '-5', '1:2:3:4', '12.3m'])('rejects %p', (s) => expect(() => parseTime(s)).toThrow('Bad time'));
  test('a bare decimal is ambiguous: exit 2, suggests s and ms', () => {
    const r = run('pointer', ZIP, '2.5');
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('use 2.5s for seconds, or 2500 for ms.');
  });
});

describe('replay', () => {
  withBrowser('pointer at the click finds #save', () => {
    const r = run('pointer', ZIP, '00:02.000');
    expect(r.code).toBe(0);
    const p = r.json();
    expect(p.mouse).toMatchObject({ x: 160, y: 120, at: 2000, source: 'click', nodeId: 10 });
    expect(p.element).toMatchObject({ tag: 'button', id: 'save', text: 'Save', path: 'button#save', rect: { x: 100, y: 100, width: 120, height: 40 } });
    expect(p.ancestry.map((a: any) => a.tag)).toEqual(['body']);
    expect(p.nearbyInteractions.map((i: any) => i.type)).toEqual(['Focus', 'MouseDown', 'Click']);
  });
  withBrowser('dom has the typed value and the mutation', () => {
    const r = run('dom', ZIP, '2.5s');
    expect(r.code).toBe(0);
    const d = r.json();
    expect(d).toMatchObject({ t: 2500, replayedT: 2500, time: '00:02.500', viewport: FIXTURE.viewport, warnings: [] });
    expect(d.html).toStartWith('<!DOCTYPE html>');
    expect(d.html).toContain('value="Ada"');
    expect(d.html).toContain('>Saved</p>');
  });
  withBrowser('dom --selector returns matching outerHTMLs, and warns on none', () => {
    expect(run('dom', folder, '2500', '--selector', '#status').json().html).toEqual(['<p id="status" style="position:absolute;left:100px;top:300px">Saved</p>']);
    const before = run('dom', ZIP, '1500', '--selector', '#status').json();
    expect(before.html).toEqual([]);
    expect(before.warnings[0]).toContain('no element matches #status');
  });
  withBrowser('dom --raw prints HTML', () => {
    const r = run('dom', ZIP, '2500', '--raw', '--selector', 'h1');
    expect(r.stdout).toBe('<h1 style="margin:0;padding:20px">Fixture app</h1>\n');
  });
  withBrowser('dom with an invalid selector: exit 2', () => {
    const r = run('dom', ZIP, '2500', '--selector', '##');
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Invalid CSS selector');
  });
  withBrowser('screenshot writes a PNG at the viewport size', () => {
    const out = join(tmp, 'shot.png');
    const r = run('screenshot', ZIP, '00:02.5', '--out', out);
    expect(r.code).toBe(0);
    const s = r.json();
    expect(s).toMatchObject({ path: out, replayedT: 2500, viewport: FIXTURE.viewport, warnings: [] });
    const png = readFileSync(out);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([800, 600]);
  });
  withBrowser('screenshot --out a folder names the file; a non-png path is a usage error', () => {
    const s = run('screenshot', ZIP, '2500', '--out', join(tmp, 'shots') + '/').json();
    expect(s.path).toBe(join(tmp, 'shots', `blook-${FIXTURE.id}-${FIXTURE.tabId}-2500.png`));
    expect(existsSync(s.path)).toBe(true);
    const bad = run('screenshot', ZIP, '2500', '--out', join(tmp, 'shot.jpg'));
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain('--out must be a .png file or a folder');
  });
  withBrowser('time before the first snapshot and after the last event: warnings', () => {
    const early = run('pointer', ZIP, '5').json();
    expect(early.replayedT).toBe(20);
    expect(early.warnings[0]).toContain('before the first DOM snapshot');
    const late = run('pointer', ZIP, '4500').json();
    expect(late.replayedT).toBe(4000);
    expect(late.warnings[0]).toContain('after the last rrweb event');
  });
});

describe('extension and skill', () => {
  test('extension --path', () => {
    const r = run('extension', '--path');
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(join(homedir(), 'Blook', 'extension') + '\n');
  });
  test('skill path', () => {
    expect(run('skill', 'path').stdout).toBe(join(homedir(), '.agents', 'skills', 'blook') + '\n');
  });
  test('skill print', () => {
    const r = run('skill', 'print');
    expect(r.code).toBe(0);
    expect(r.stdout).toStartWith('---\nname: blook\n');
    expect(existsSync(join(import.meta.dir, '../../skills/blook/SKILL.md'))).toBe(true);
  });
  test('skill install without a terminal copies the skill', () => {
    const home = join(tmp, 'home');
    const p = Bun.spawnSync(['bun', CLI, 'skill', 'install'], { stdin: 'ignore', env: { ...process.env, HOME: home } });
    expect(p.exitCode).toBe(0);
    expect(p.stdout.toString()).toBe(join(home, '.agents', 'skills', 'blook') + '\n');
    expect(p.stderr.toString()).toContain('No terminal');
    expect(existsSync(join(home, '.agents', 'skills', 'blook', 'SKILL.md'))).toBe(true);
  });
  test('skill with no subcommand shows its help', () => {
    const r = run('skill');
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Usage: blook skill');
  });
});

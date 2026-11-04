// End-to-end tests: run the CLI as an agent would and check stdout, stderr and the exit code.
// Fixture: test/fixtures/blook-fixture.zip (see make-fixture.ts).
import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { ReplayEngine } from '../src/replay.ts';
import { parseTime } from '../src/bundle.ts';
import { FIXTURE } from './make-fixture.ts';
import { findWhisperCli, modelsDir, whisperToStt, dtwPreset } from '../src/whisper.ts';

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
  for (const cmd of ['info', 'pointer', 'dom', 'screenshot', 'transcribe', 'extension', 'skill', 'install-browser', 'update']) {
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
    expect(p.nearbyInteractions.map((i: any) => i.type)).toEqual(['Focus', 'MouseDown', 'Click', 'MouseDown']);
    expect(p.selection).toBeNull();
  });
  withBrowser('pointer reports the selected text', () => {
    const p = run('pointer', ZIP, '3.5s').json();
    expect(p.selection).toMatchObject({ text: 'Fixture', element: { tag: 'h1', path: 'body > h1' } });
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

describe('transcribe', () => {
  /** Async, so the mock server in this process can answer while the CLI runs. */
  async function runAsync(args: string[], env: Record<string, string | undefined> = {}) {
    const p = Bun.spawn(['bun', CLI, ...args], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', env: { ...process.env, NO_COLOR: '1', OPENROUTER_API_KEY: undefined, ...env } });
    const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    return { code, stdout, stderr, json: () => JSON.parse(stdout) };
  }
  const copy = (name: string) => {
    const p = join(tmp, name);
    writeFileSync(p, readFileSync(ZIP));
    return p;
  };
  const entry = (zip: string, name: string) => JSON.parse(new TextDecoder().decode(unzipSync(readFileSync(zip))[`blook-${FIXTURE.id}/${name}`]!));

  // A fake OpenRouter: verbose_json in seconds from the chunk start, first word in leading silence.
  const requests: { auth: string | null; model: unknown; format: unknown; granularities: unknown[]; file: File }[] = [];
  let reply = () => Response.json({
    text: 'And so my fellow Americans',
    segments: [{ start: 0, end: 2.4, text: ' And so my fellow Americans' }],
    words: [
      { word: 'And', start: 0, end: 0.3 },
      { word: 'so', start: 0.3, end: 0.6 },
      { word: 'my', start: 0.6, end: 0.9 },
      { word: 'fellow', start: 0.9, end: 1.3 },
      { word: 'Americans', start: 1.3, end: 2.4 },
    ],
  });
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const form = await req.formData();
      requests.push({ auth: req.headers.get('authorization'), model: form.get('model'), format: form.get('response_format'), granularities: form.getAll('timestamp_granularities[]'), file: form.get('file') as File });
      return reply();
    },
  });
  afterAll(() => server.stop(true));
  const openrouter = { OPENROUTER_API_KEY: 'test-key', BLOOK_OPENROUTER_URL: `http://localhost:${server.port}/api/v1/audio/transcriptions` };

  test('openrouter: transcript.json, timeline speech and session.json, rewritten in place', async () => {
    const zip = copy('or.zip');
    const r = await runAsync(['transcribe', zip], openrouter);
    expect(r.code).toBe(0);
    const out = r.json();
    expect(out).toMatchObject({ path: zip, skipped: false, status: 'ok', method: 'openrouter', model: 'openai/whisper-large-v3', segments: 1, words: 5, chunks: 1 });
    expect(out.source).toMatchObject({ method: 'openrouter', model: 'openai/whisper-large-v3', by: 'cli' });
    expect(r.stderr).toContain('chunk 1/1 (audio/000.webm, 2.8 s): 5 words');
    // The extension's request.
    expect(requests.at(-1)).toMatchObject({ auth: 'Bearer test-key', model: 'openai/whisper-large-v3', format: 'verbose_json', granularities: ['word', 'segment'] });
    expect(requests.at(-1)!.file.name).toBe('000.webm');
    expect(requests.at(-1)!.file.size).toBe(readFileSync(join(import.meta.dir, 'fixtures/speech.webm')).length);

    const t = entry(zip, 'transcript.json');
    expect(t).toMatchObject({ status: 'ok', segmentCount: 1, wordCount: 5, source: out.source });
    expect(t.segments[0]).toMatchObject({ index: 0, t: 1000, endT: 2980, text: 'And so my fellow Americans' });
    // chunk.t + seconds × 1000; the last word's end in silence moves back to the voiced end (2980).
    expect(t.segments[0].words.map((w: any) => [w.word, w.t, w.endT])).toEqual([['And', 1000, 1300], ['so', 1300, 1600], ['my', 1600, 1900], ['fellow', 1900, 2300], ['Americans', 2300, 2980]]);
    const speech = entry(zip, 'timeline.json').filter((e: any) => e.type === 'speech');
    expect(speech).toEqual([{ t: 1000, type: 'speech', summary: '🗣 "And so my fellow Americans"', text: 'And so my fellow Americans', endT: 2980, ref: { file: 'transcript.json', segment: 0 } }]);
    const s = entry(zip, 'session.json');
    expect(s.transcript).toEqual({ status: 'ok', source: out.source });
    expect(s.counts).toMatchObject({ transcriptSegments: 1, timeline: 9 });
    expect(s.files['transcript.json']).toContain('status "ok"');
    // Everything else is untouched.
    expect(entry(zip, 'network.json')).toEqual(entry(ZIP, 'network.json'));
    expect(unzipSync(readFileSync(zip))[`blook-${FIXTURE.id}/audio/000.webm`]).toEqual(unzipSync(readFileSync(ZIP))[`blook-${FIXTURE.id}/audio/000.webm`]);

    // Already ok: skipped without a request, unless --force.
    const n = requests.length;
    const again = await runAsync(['transcribe', zip], openrouter);
    expect(again.json()).toMatchObject({ skipped: true, status: 'ok' });
    expect(again.stderr).toContain('--force');
    expect(requests.length).toBe(n);
    expect((await runAsync(['transcribe', zip, '--force'], openrouter)).json()).toMatchObject({ skipped: false, status: 'ok' });
    expect(requests.length).toBe(n + 1);
  });

  test('a folder is updated in place; --out writes a new zip and leaves the input alone', async () => {
    const dir = join(tmp, 'folder-in');
    for (const [name, data] of Object.entries(unzipSync(readFileSync(ZIP)))) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), data);
    }
    const r = await runAsync(['transcribe', dir], openrouter);
    expect(r.code).toBe(0);
    const bundleDir = join(dir, `blook-${FIXTURE.id}`);
    expect(r.json().path).toBe(bundleDir);
    expect(JSON.parse(readFileSync(join(bundleDir, 'transcript.json'), 'utf8')).wordCount).toBe(5);

    const src = copy('src.zip');
    const out = join(tmp, 'out.zip');
    const o = await runAsync(['transcribe', src, '--out', out], openrouter);
    expect(o.json().path).toBe(out);
    expect(entry(out, 'transcript.json').status).toBe('ok');
    expect(entry(src, 'transcript.json').status).toBe('skipped');
  });

  test('every chunk failing: exit 6 and the bundle is left as it was', async () => {
    const zip = copy('fail.zip');
    const before = readFileSync(zip);
    reply = () => new Response('{"error":"bad key"}', { status: 401 });
    try {
      const r = await runAsync(['transcribe', zip], openrouter);
      expect(r.code).toBe(6);
      expect(r.stdout).toBe('');
      expect(r.stderr).toContain('error: Transcription failed: OpenRouter 401');
      expect(readFileSync(zip)).toEqual(before);
    } finally {
      reply = () => Response.json({ text: '' });
    }
  });

  test('no key and no whisper-cli: exit 7 naming both', async () => {
    const r = await runAsync(['transcribe', ZIP], { PATH: dirname(process.execPath), BLOOK_WHISPER_CLI: undefined });
    expect(r.code).toBe(7);
    expect(r.stderr).toContain('OPENROUTER_API_KEY is not set and whisper-cli is not installed');
    expect(r.stderr).toContain('brew install whisper-cpp');
  });

  test('a bundle without audio: exit 3', async () => {
    const files = unzipSync(readFileSync(ZIP));
    for (const k of Object.keys(files)) if (k.includes('/audio/')) delete files[k];
    const zip = join(tmp, 'noaudio.zip');
    writeFileSync(zip, zipSync(files));
    const r = await runAsync(['transcribe', zip], openrouter);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('No audio in');
  });

  test('whisper.cpp JSON: words from tokens, DTW starts, special tokens dropped', () => {
    const tok = (text: string, from: number, to: number, t_dtw = -1) => ({ text, offsets: { from, to }, t_dtw });
    const stt = whisperToStt({
      transcription: [{
        offsets: { from: 0, to: 2400 },
        text: ' And so, my fellow',
        tokens: [tok('[_BEG_]', 0, 0), tok(' And', 0, 400, 30), tok(' so', 400, 800, 52), tok(',', 800, 800, 60), tok(' my', 800, 1200, 80), tok(' fel', 1200, 1500, 101), tok('low', 1500, 2400, 115), tok('[_TT_120]', 2400, 2400)],
      }],
    });
    expect(stt.segments).toEqual([{ start: 0.3, end: 2.4, text: 'And so, my fellow' }]); // spans its DTW words
    expect(stt.words).toEqual([
      { word: 'And', start: 0.3, end: 0.52 },
      { word: 'so,', start: 0.52, end: 0.8 },
      { word: 'my', start: 0.8, end: 1.01 },
      { word: 'fellow', start: 1.01, end: 2.4 },
    ]);
    expect([dtwPreset('base.en'), dtwPreset('base.en-q5_1'), dtwPreset('large-v3-turbo'), dtwPreset('custom')]).toEqual(['base.en', 'base.en', 'large.v3.turbo', undefined]);
  });

  // Needs whisper-cli and a downloaded model (tests never download one).
  const model = join(modelsDir(), 'ggml-base.en.bin');
  const canWhisper = !!findWhisperCli() && existsSync(model) && hasBrowser;
  if (!canWhisper) console.warn(`Skipping the whisper.cpp test: needs whisper-cli (brew install whisper-cpp), ${model} (run \`blook transcribe <bundle> --method whisper\` once) and a browser.`);
  test.skipIf(!canWhisper)('whisper: local transcription of the fixture chunk', async () => {
    const zip = copy('whisper.zip');
    const r = await runAsync(['transcribe', zip, '--method', 'whisper']);
    expect(r.code).toBe(0);
    expect(r.json()).toMatchObject({ status: 'ok', method: 'whisper.cpp', model: 'base.en', segments: 1, chunks: 1 });
    const t = entry(zip, 'transcript.json');
    expect(t.source).toMatchObject({ method: 'whisper.cpp', model: 'base.en', by: 'cli' });
    expect(t.segments[0].text).toMatch(/and so,? my fellow americans/i);
    const words = t.segments[0].words;
    expect(words[0].t).toBe(1000); // snapped to the voiced onset
    for (const w of words) expect(w.t).toBeGreaterThanOrEqual(1000), expect(w.endT).toBeLessThanOrEqual(2980);
  }, 60_000);
});

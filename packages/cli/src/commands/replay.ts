// `blook screenshot|dom|pointer <bundle> <t>`: replay the page to t in headless Chromium.
import { dirname, extname, join, resolve } from 'node:path';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { CliError, EXIT } from '../errors.ts';
import { InvalidArgumentError, type Command } from 'commander';
import { loadBundle, parseTime, checkTime, TIME_FORMATS, type Bundle } from '../bundle.ts';
import { ReplayEngine, type TabReplay } from '../replay.ts';
import { printJson, printLine, warn } from '../output.ts';

interface ReplayOpts {
  tab?: string;
  offline?: boolean;
  wait?: number;
}

const timeArg = (v: string) => {
  try {
    parseTime(v);
  } catch (e) {
    throw new InvalidArgumentError(e instanceof CliError && e.hint ? e.hint : `Use ${TIME_FORMATS}.`);
  }
  return v;
};
const msArg = (v: string) => {
  if (!/^\d+$/.test(v)) throw new InvalidArgumentError('Use a whole number of ms, e.g. 1000.');
  return Number(v);
};

/** Load the bundle, check t, then run fn on an open replay and close the browser. */
async function withReplay<T>(bundlePath: string, tArg: string, opts: ReplayOpts, fn: (r: TabReplay, t: number, b: Bundle) => Promise<T>) {
  const bundle = loadBundle(resolve(bundlePath));
  const t = parseTime(tArg);
  checkTime(bundle, t, tArg);
  bundle.resolveTab(opts.tab); // fail on a bad --tab before starting a browser
  const engine = await ReplayEngine.launch({ offline: opts.offline, settleMs: opts.wait });
  try {
    return await fn(await engine.open(bundle, opts.tab), t, bundle);
  } finally {
    await engine.close();
  }
}

/** --out is a .png file, or a folder for the default file name. */
function outPath(out: string, r: TabReplay, t: number): string {
  const p = resolve(out);
  if (out.endsWith('/') || (existsSync(p) && statSync(p).isDirectory())) {
    mkdirSync(p, { recursive: true });
    return join(p, `blook-${r.bundle.session.id ?? 'session'}-${r.tab}-${t}.png`);
  }
  if (extname(p).toLowerCase() !== '.png')
    throw new CliError(
      `--out must be a .png file or a folder, got ${out}.`,
      EXIT.usage,
      'For example --out after-click.png, or --out shots/.',
    );
  mkdirSync(dirname(p), { recursive: true });
  return p;
}

function replayCommand(program: Command, name: string, description: string, examples: string) {
  return program
    .command(name)
    .description(description)
    .argument('<bundle>', 'a blook-*.zip or its unzipped folder')
    .argument('<t>', `time: ${TIME_FORMATS}`, timeArg)
    .option('--tab <id>', 'tab id from `blook info` (default: the first tab)')
    .option('--offline', "block the replay's http(s) requests, for when the app's server is gone")
    .option('--wait <ms>', 'max wait for images and fonts after seeking', msArg, 3000)
    .addHelpText('after', `\n${examples}`);
}

export function registerReplay(program: Command) {
  replayCommand(
    program,
    'pointer',
    'where the mouse was at t, the element under it, selected text, and clicks within 1 s',
    `Output: { tab, t, replayedT, time, url, viewport, warnings, mouse: { x, y, at, ageMs, source, nodeId },
element: { tag, rrwebId, id?, classes?, text?, attributes, rect, path }, ancestry: [element...],
selection: { text, element } | null, nearbyInteractions: [{ t, type, nodeId, x?, y? }] }

Examples:
  blook pointer blook-2026-11-03_21-12-51.zip 00:06.2
  blook pointer blook-2026-11-03_21-12-51.zip 6193 | jq '.element'`,
  ).action((bundle: string, t: string, opts: ReplayOpts) => withReplay(bundle, t, opts, async (r, ms) => printJson(await r.pointer(ms))));

  replayCommand(
    program,
    'dom',
    'the replayed HTML at t, with typed form values filled in (JSON; --raw for plain HTML)',
    `Output: { tab, t, replayedT, time, url, viewport, warnings, html } where html is a string,
or an array of outerHTMLs with --selector.

Examples:
  blook dom blook-2026-11-03_21-12-51.zip 00:06.2 --selector 'button, [role=dialog]'
  blook dom blook-2026-11-03_21-12-51.zip 6.5s --raw > page.html`,
  )
    .option('--selector <css>', 'only the outerHTML of the elements matching this CSS selector')
    .option('--raw', 'print plain HTML instead of JSON (warnings go to stderr)')
    .action((bundle: string, t: string, opts: ReplayOpts & { selector?: string; raw?: boolean }) =>
      withReplay(bundle, t, opts, async (r, ms) => {
        const res = await r.dom(ms, { selector: opts.selector });
        if (!opts.raw) return printJson(res);
        for (const w of res.warnings) warn(w);
        printLine(Array.isArray(res.html) ? res.html.join('\n') : res.html);
      }),
    );

  replayCommand(
    program,
    'screenshot',
    'a PNG of the page at t, at the recorded viewport size, with the mouse marked',
    `Output: { path, tab, t, replayedT, time, url, viewport, mouse, warnings }

Examples:
  blook screenshot blook-2026-11-03_21-12-51.zip 00:06.2
  blook screenshot blook-2026-11-03_21-12-51.zip 6.7s --out after-click.png --no-cursor`,
  )
    .option('--out <file.png>', 'a .png path, or a folder for an auto-named PNG (default: a temp file)')
    .option('--no-cursor', "don't draw the mouse marker")
    .action((bundle: string, t: string, opts: ReplayOpts & { out?: string; cursor: boolean }) =>
      withReplay(bundle, t, opts, async (r, ms) => {
        const { path, ...rest } = await r.screenshot(ms, { out: opts.out && outPath(opts.out, r, ms), cursor: opts.cursor });
        printJson({ path, ...rest });
      }),
    );
}

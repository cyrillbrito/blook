#!/usr/bin/env node
// overseer-replay: look at an Overseer bundle at time t.
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { loadBundle, parseTime, formatTime, pageStateAt, interactionsBetween } from './bundle.ts';
import { ReplayEngine } from './replay.ts';
import { installBrowser } from './browser.ts';

const USAGE = `Usage: overseer-replay <command> <bundle> [t] [options]

Commands:
  info       <bundle>              tabs, duration, snapshot range and clicks (no browser)
  screenshot <bundle> <t>          replay to t, save a PNG with the cursor drawn; prints the path
  dom        <bundle> <t>          serialized HTML of the replayed document at t
  pointer    <bundle> <t>          mouse position at t and the element under it
  install-browser [--force]        download Playwright's Chrome headless shell (~100 MB)
                                   (only needed without Google Chrome installed)

<bundle> is an exported folder or .zip. <t> is ms since session start (12345),
seconds (12.3s) or mm:ss[.mmm] (00:18.5).

Options:
  --tab <id>         tab id (default: first tab in session.json)
  --out <file.png>   screenshot path (default: a temp file)
  --no-cursor        screenshot without the cursor marker
  --selector <css>   dom: only the outerHTML of matching elements (JSON array)
  --raw              dom: print plain HTML instead of JSON
  --offline          block all http(s) requests from the replay (dead asset server)
  --wait <ms>        max wait for images and fonts after seeking (default 3000)
`;

// `... | head` closes stdout early: exit quietly instead of crashing.
process.stdout.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EPIPE') process.exit(0);
  throw e;
});

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      tab: { type: 'string' },
      out: { type: 'string' },
      'no-cursor': { type: 'boolean' },
      selector: { type: 'string' },
      raw: { type: 'boolean' },
      offline: { type: 'boolean' },
      wait: { type: 'string' },
      force: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [cmd, bundlePath, tArg] = positionals;
  if (cmd === 'install-browser') {
    const shell = await installBrowser({ force: values.force, log: (m) => process.stderr.write(m + '\n') });
    process.stdout.write(shell.executable + '\n');
    return;
  }
  if (values.help || !cmd || !bundlePath) {
    process.stdout.write(USAGE);
    process.exit(values.help ? 0 : 1);
  }
  const bundle = loadBundle(resolve(bundlePath));
  const print = (v: unknown) => process.stdout.write(JSON.stringify(v, null, 2) + '\n');

  if (cmd === 'info') {
    const tabs = bundle.tabIds.map((tab) => {
      const ev = bundle.events(tab);
      const st = pageStateAt(ev, Infinity);
      const clicks = interactionsBetween(ev, -Infinity, Infinity)
        .filter((i) => i.type === 'Click' || i.type === 'DblClick' || i.type === 'ContextMenu')
        .map((i) => ({ time: formatTime(i.t), ...i }));
      return {
        tab,
        events: ev.length,
        firstEventAt: ev[0]?.timestamp,
        firstSnapshotAt: st.firstSnapshotAt,
        lastEventAt: ev[ev.length - 1]?.timestamp,
        url: pageStateAt(ev, 0).url ?? st.url,
        viewport: st.viewport,
        clicks,
      };
    });
    print({ id: bundle.session.id, durationMs: bundle.session.durationMs, url: bundle.session.url, tabs });
    return;
  }

  if (!['screenshot', 'dom', 'pointer'].includes(cmd)) throw new Error(`Unknown command "${cmd}"\n\n${USAGE}`);
  if (tArg == null) throw new Error(`${cmd} needs a time <t>`);
  const t = parseTime(tArg);
  const engine = await ReplayEngine.launch({ offline: values.offline, settleMs: values.wait ? Number(values.wait) : undefined });
  try {
    const replay = await engine.open(bundle, values.tab);
    if (cmd === 'screenshot') {
      const res = await replay.screenshot(t, { out: values.out && resolve(values.out), cursor: !values['no-cursor'] });
      for (const w of res.warnings) process.stderr.write(`warning: ${w}\n`);
      process.stdout.write(res.path + '\n');
    } else if (cmd === 'dom') {
      const res = await replay.dom(t, { selector: values.selector });
      if (values.raw) {
        for (const w of res.warnings) process.stderr.write(`warning: ${w}\n`);
        process.stdout.write((Array.isArray(res.html) ? res.html.join('\n') : res.html) + '\n');
      } else print(res);
    } else {
      print(await replay.pointer(t));
    }
  } finally {
    await engine.close();
  }
}

main().catch((e) => {
  process.stderr.write(`error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

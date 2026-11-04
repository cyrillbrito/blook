// `blook info`: what's in the bundle and when, without a browser.
import type { Command } from 'commander';
import { loadBundle, formatTime, pageStateAt, interactionsBetween } from '../bundle.ts';
import { printJson } from '../output.ts';
import { resolve } from 'node:path';

const CLICKS = new Set(['Click', 'DblClick', 'ContextMenu']);

function info(bundlePath: string) {
  const bundle = loadBundle(resolve(bundlePath));
  const tabs = bundle.tabIds.map((tab) => {
    const ev = bundle.events(tab);
    const st = pageStateAt(ev, Infinity);
    // timeline.json describes each click's target ("button \"Save\" #save").
    const targets = new Map(
      bundle.timeline.filter((e) => e.type === 'click' && String(e.tabId) === tab).map((e) => [`${e.t}:${e.nodeId}`, e.target as string]),
    );
    const clicks = interactionsBetween(ev, -Infinity, Infinity)
      .filter((i) => CLICKS.has(i.type))
      .map((i) => {
        const target = targets.get(`${i.t}:${i.nodeId}`);
        return { time: formatTime(i.t), ...i, ...(target ? { target } : {}) };
      });
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
  printJson({
    id: bundle.session.id,
    durationMs: bundle.durationMs,
    duration: formatTime(bundle.durationMs),
    url: bundle.session.url,
    tabs,
  });
}

export function registerInfo(program: Command) {
  program
    .command('info')
    .description('tabs, duration, viewport, DOM snapshot range and clicks with their targets (fast, no browser)')
    .argument('<bundle>', 'a blook-*.zip or its unzipped folder')
    .addHelpText(
      'after',
      `
Output: { id, durationMs, duration, url, tabs: [{ tab, events, firstEventAt, firstSnapshotAt,
lastEventAt, url, viewport, clicks: [{ time, t, type, nodeId, x, y, target? }] }] }

Examples:
  blook info blook-2026-11-03_21-12-51.zip
  blook info blook-2026-11-03_21-12-51.zip | jq '.tabs[0].clicks'
Next: blook pointer <bundle> <t> at a click's t, or at a time from timeline.json.`,
    )
    .action(info);
}

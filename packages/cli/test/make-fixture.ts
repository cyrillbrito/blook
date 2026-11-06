// Writes test/fixtures/blook-fixture.zip: a tiny synthetic bundle (800×600 page, a typed input,
// mouse moves, a click on #save at 2000 that shows "Saved" at 2100, "Fixture" selected at 3000,
// one failed request, a WebSocket with a JSON, a text and a binary frame, one console error,
// and one audio chunk at 1000 that says "And so my fellow Americans" (fixtures/speech.webm, cut
// from whisper.cpp's public-domain jfk.wav), not transcribed yet (status skipped).
// The rows are what the extension stores; core's zipBundle turns them into the bundle, as on Export.
// Run `bun test/make-fixture.ts` after changing it; the zip is committed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { zipBundle } from '@blook/core/bundle';
import type { SessionMeta } from '@blook/core/types';

export const FIXTURE = {
  id: '2026-01-01_12-00-00',
  durationMs: 5000,
  tabId: 101,
  viewport: { width: 800, height: 600 },
  click: { t: 2000, x: 160, y: 120, nodeId: 10 },
  audio: { t: 1000, durationMs: 2800, voiced: [[1000, 2980]] as [number, number][] },
};

let id = 0;
const el = (tagName: string, attributes: Record<string, string> = {}, childNodes: any[] = []) => ({
  type: 2,
  tagName,
  attributes,
  childNodes,
  id: ++id,
});
const text = (textContent: string) => ({ type: 3, textContent, id: ++id });

const doc = { type: 0, id: ++id, childNodes: [] as any[] };
doc.childNodes.push({ type: 1, name: 'html', publicId: '', systemId: '', id: ++id });
const head = el('head', {}, [el('title', {}, [text('Fixture app')])]);
const body = el('body', { style: 'margin:0;font:16px sans-serif' });
const h1Text = text('Fixture app');
const h1 = el('h1', { style: 'margin:0;padding:20px' }, [h1Text]);
const save = el('button', { id: 'save', type: 'button', style: 'position:absolute;left:100px;top:100px;width:120px;height:40px' }, [
  text('Save'),
]);
const input = el('input', { id: 'name', name: 'name', style: 'position:absolute;left:100px;top:200px;width:200px' });
body.childNodes.push(h1, save, input);
doc.childNodes.push(el('html', { lang: 'en' }, [head, body]));
if (save.id !== FIXTURE.click.nodeId) throw new Error(`#save has rrweb id ${save.id}, update FIXTURE.click.nodeId`);

const { width, height } = FIXTURE.viewport;
const status = el('p', { id: 'status', style: 'position:absolute;left:100px;top:300px' });
const move = (t: number, x: number, y: number, nodeId: number) => ({
  type: 3,
  timestamp: t,
  data: { source: 1, positions: [{ x, y, id: nodeId, timeOffset: 0 }] },
});
const events = [
  { type: 4, timestamp: 10, data: { href: 'http://localhost:4791/', width, height } },
  { type: 2, timestamp: 20, data: { node: doc, initialOffset: { left: 0, top: 0 } } },
  move(500, 400, 400, body.id),
  move(1000, 200, 210, input.id),
  { type: 3, timestamp: 1200, data: { source: 2, type: 5, id: input.id } }, // Focus
  { type: 3, timestamp: 1500, data: { source: 5, id: input.id, text: 'Ada', isChecked: false, userTriggered: true } },
  move(1900, FIXTURE.click.x, FIXTURE.click.y, save.id),
  { type: 3, timestamp: 1990, data: { source: 2, type: 1, id: save.id, x: FIXTURE.click.x, y: FIXTURE.click.y } }, // MouseDown
  { type: 3, timestamp: 2000, data: { source: 2, type: 2, id: save.id, x: FIXTURE.click.x, y: FIXTURE.click.y } }, // Click
  {
    type: 3,
    timestamp: 2100,
    // rrweb adds each node on its own, children after their parent.
    data: {
      source: 0,
      texts: [],
      attributes: [],
      removes: [],
      adds: [
        { parentId: body.id, nextId: null, node: status },
        { parentId: status.id, nextId: null, node: text('Saved') },
      ],
    },
  },
  // Drag-select "Fixture" in the heading.
  { type: 3, timestamp: 2800, data: { source: 2, type: 1, id: h1.id, x: 22, y: 40 } }, // MouseDown
  { type: 3, timestamp: 3000, data: { source: 14, ranges: [{ start: h1Text.id, startOffset: 0, end: h1Text.id, endOffset: 7 }] } },
  { type: 3, timestamp: 3050, data: { source: 2, type: 0, id: h1.id, x: 90, y: 40 } }, // MouseUp
  move(4000, 600, 500, body.id),
];

const url = 'http://localhost:4791/';
const tabId = FIXTURE.tabId;
const sessionId = FIXTURE.id;
const startedAt = 1767268800000;
const meta: SessionMeta = {
  id: sessionId,
  startedAt,
  endedAt: startedAt + FIXTURE.durationMs,
  durationMs: FIXTURE.durationMs,
  status: 'stopped',
  url,
  title: 'Fixture app',
  tabs: [{ tabId, t: 0, url }],
  navigations: [{ tabId, t: 0, url }],
  settings: { mask: false, mic: true, canvas: false },
  mic: { state: 'stopped', chunks: 1 },
  firstSnapshotT: 20,
  pageReadyT: 50,
};
const json = { 'content-type': 'application/json' };
const speech = readFileSync(new URL('fixtures/speech.webm', import.meta.url));
const { t: at, durationMs: len, voiced } = FIXTURE.audio;

export async function buildFixture(): Promise<Uint8Array> {
  const { zip } = await zipBundle(
    {
      meta,
      rrweb: events.map((event) => ({ sessionId, tabId, frameId: 0, t: event.timestamp, event: event as any })),
      requests: [
        {
          sessionId,
          requestId: '1.1',
          tabId,
          t: 2010,
          endT: 2040,
          method: 'POST',
          url: `${url}api/save`,
          resourceType: 'Fetch',
          requestHeaders: json,
          requestBody: '{"name":"Ada"}',
          status: 500,
          statusText: 'Internal Server Error',
          responseHeaders: json,
          mimeType: 'application/json',
          responseBody: '{"error":"boom"}',
        },
      ],
      sockets: [{ sessionId, socketId: '1.2', tabId, url: 'ws://localhost:4791/ws', t: 100, closedT: 4500, status: 101 }],
      frames: [
        { sessionId, socketId: '1.2', t: 600, direction: 'sent', opcode: 1, payload: '{"subscribe":"orders"}' },
        { sessionId, socketId: '1.2', t: 650, direction: 'received', opcode: 1, payload: 'ok' },
        { sessionId, socketId: '1.2', t: 2020, direction: 'received', opcode: 2, payload: '3q2+7w==' },
      ],
      console: [{ sessionId, tabId, t: 2050, source: 'console', level: 'error', text: 'save failed' }],
      audio: [
        {
          sessionId,
          index: 0,
          t: at,
          durationMs: len,
          mimeType: 'audio/webm;codecs=opus',
          blob: new Blob([new Uint8Array(speech)], { type: 'audio/webm;codecs=opus' }),
          voiced: voiced.map(([a, b]): [number, number] => [a - at, b - at]),
        },
      ],
    },
    { transcriptStatus: 'skipped', transcriptNote: 'skipped: no OpenRouter API key set' },
  );
  return zip;
}

if (import.meta.main) {
  const zip = await buildFixture();
  mkdirSync(new URL('fixtures/', import.meta.url), { recursive: true });
  writeFileSync(new URL('fixtures/blook-fixture.zip', import.meta.url), zip);
  console.log(`test/fixtures/blook-fixture.zip: ${zip.length} bytes`);
}

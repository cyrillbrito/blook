// Writes test/fixtures/blook-fixture.zip: a tiny synthetic bundle (800×600 page, a typed input,
// mouse moves, a click on #save at 2000 that shows "Saved" at 2100, "Fixture" selected at 3000,
// one failed request, a WebSocket with a JSON, a text and a binary frame, one console error,
// and one audio chunk at 1000 that says "And so my fellow Americans" (fixtures/speech.webm, cut
// from whisper.cpp's public-domain jfk.wav), not transcribed yet (status skipped).
// Run `bun test/make-fixture.ts` after changing it; the zip is committed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';

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

const session = {
  format: 'blook-bundle',
  version: 1,
  id: FIXTURE.id,
  url: 'http://localhost:4791/',
  title: 'Fixture app',
  status: 'stopped',
  startedAt: 1767268800000,
  startedAtIso: '2026-01-01T12:00:00.000Z',
  endedAt: 1767268805000,
  t: 0,
  endT: FIXTURE.durationMs,
  durationMs: FIXTURE.durationMs,
  firstSnapshotT: 20,
  pageReadyT: 50,
  tabs: [{ tabId: FIXTURE.tabId, t: 0, url: 'http://localhost:4791/' }],
  navigations: [{ tabId: FIXTURE.tabId, t: 0, url: 'http://localhost:4791/' }],
  settings: { mask: false, mic: true, canvas: false },
  mic: { state: 'stopped', chunks: 1 },
  transcript: { status: 'skipped', note: 'skipped: no OpenRouter API key set' },
  counts: {
    rrwebEvents: events.length,
    timeline: 8,
    requests: 1,
    failedRequests: 1,
    webSockets: 1,
    webSocketFrames: 3,
    console: 1,
    errors: 1,
    audioChunks: 1,
    transcriptSegments: 0,
  },
  files: {},
};
const tab = FIXTURE.tabId;
const timeline = [
  {
    t: 0,
    type: 'navigation',
    tabId: tab,
    summary: 'Navigate to http://localhost:4791/',
    url: 'http://localhost:4791/',
    ref: { file: 'session.json', navigation: 0 },
  },
  {
    t: 20,
    type: 'snapshot',
    tabId: tab,
    summary: 'DOM snapshot: http://localhost:4791/',
    ref: { file: 'rrweb.json', tabId: tab, event: 1 },
  },
  {
    t: 100,
    type: 'ws-open',
    tabId: tab,
    summary: 'WebSocket open ws://localhost:4791/ws',
    url: 'ws://localhost:4791/ws',
    socketId: '1.2',
    status: 101,
    ref: { file: 'websockets.json', socketId: '1.2' },
  },
  {
    t: 600,
    type: 'ws-frame',
    tabId: tab,
    summary: 'WebSocket sent: {"subscribe":"orders"}',
    socketId: '1.2',
    direction: 'sent',
    count: 1,
    bytes: 25,
    endT: 600,
    preview: '{"subscribe":"orders"}',
    ref: { file: 'websockets.json', socketId: '1.2', frame: 0, frameEnd: 0 },
  },
  {
    t: 1500,
    type: 'input',
    tabId: tab,
    summary: 'Input input #name: "Ada"',
    target: 'input #name',
    nodeId: input.id,
    value: 'Ada',
    endT: 1500,
    ref: { file: 'rrweb.json', tabId: tab, event: 5 },
  },
  {
    t: 2000,
    type: 'click',
    tabId: tab,
    summary: 'Click button "Save" #save',
    target: 'button "Save" #save',
    nodeId: save.id,
    x: FIXTURE.click.x,
    y: FIXTURE.click.y,
    ref: { file: 'rrweb.json', tabId: tab, event: 8 },
  },
  {
    t: 2010,
    type: 'request-failed',
    tabId: tab,
    summary: 'POST /api/save 500',
    method: 'POST',
    url: 'http://localhost:4791/api/save',
    status: 500,
    ref: { file: 'network.json', requestId: '1.1' },
  },
  {
    t: 2050,
    type: 'error',
    tabId: tab,
    summary: 'console.error: save failed',
    level: 'error',
    source: 'console',
    ref: { file: 'console.json', index: 0 },
  },
];
const network = [
  {
    id: '1.1',
    tabId: tab,
    t: 2010,
    endT: 2040,
    durationMs: 30,
    method: 'POST',
    url: 'http://localhost:4791/api/save',
    resourceType: 'Fetch',
    status: 500,
    failed: true,
    requestHeaders: {},
    requestBody: { name: 'Ada' },
    requestBodyEncoding: 'json',
    responseBody: { error: 'boom' },
    responseBodyEncoding: 'json',
  },
];
const socket = {
  id: '1.2',
  requestId: '1.2',
  tabId: tab,
  url: 'ws://localhost:4791/ws',
  t: 100,
  endT: 4500,
  durationMs: 4400,
  status: 101,
  frameCount: 3,
  sentCount: 1,
  receivedCount: 2,
  frames: [
    { index: 0, t: 600, direction: 'sent', opcode: 1, size: 25, payload: { subscribe: 'orders' }, payloadEncoding: 'json' },
    { index: 1, t: 650, direction: 'received', opcode: 1, size: 2, payload: 'ok', payloadEncoding: 'text' },
    { index: 2, t: 2020, direction: 'received', opcode: 2, size: 4, payload: '3q2+7w==', payloadEncoding: 'base64' },
  ],
};
const consoleLog = [{ index: 0, tabId: tab, t: 2050, source: 'console', level: 'error', text: 'save failed' }];

const dir = `blook-${FIXTURE.id}/`;
const files: Record<string, unknown> = {
  'session.json': session,
  'timeline.json': timeline,
  'rrweb.json': { tabs: [{ tabId: tab, url: 'http://localhost:4791/', events }] },
  'network.json': network,
  'websockets.json': [socket],
  'console.json': consoleLog,
  'transcript.json': { status: 'skipped', note: 'skipped: no OpenRouter API key set', segmentCount: 0, wordCount: 0, segments: [] },
};
const speech = readFileSync(new URL('fixtures/speech.webm', import.meta.url));
const { t: at, durationMs: len, voiced } = FIXTURE.audio;
files['audio/chunks.json'] = [
  {
    index: 0,
    t: at,
    endT: at + len,
    durationMs: len,
    voiced,
    mimeType: 'audio/webm;codecs=opus',
    size: speech.length,
    file: 'audio/000.webm',
  },
];
session.files = Object.fromEntries([...Object.keys(files), 'audio/'].map((f) => [f, f]));

if (import.meta.main) {
  const entries = Object.entries(files).map(([name, v]) => [
    dir + name,
    strToU8(JSON.stringify(v, null, name === 'rrweb.json' ? undefined : 2)),
  ]);
  const zip = zipSync(Object.fromEntries([...entries, [dir + 'audio/000.webm', [new Uint8Array(speech), { level: 0 }]]]));
  mkdirSync(new URL('fixtures/', import.meta.url), { recursive: true });
  writeFileSync(new URL('fixtures/blook-fixture.zip', import.meta.url), zip);
  console.log(`test/fixtures/blook-fixture.zip: ${zip.length} bytes`);
}

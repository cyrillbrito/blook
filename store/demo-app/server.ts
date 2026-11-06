// A small team chat with a planted bug, for the store screenshots and the site.
// Run: bun store/demo-app/server.ts  (http://localhost:4317)
// The bug: a message with an emoji fails to save (500), but the UI shows it until the server's copy replaces it.
import page from './index.html' with { type: 'text' };

type Message = { id: number; channel: string; author: string; text: string; at: string };

const people = {
  you: { name: 'Sam Rivera', initials: 'SR', color: '#2f6f5e' },
  ana: { name: 'Anna Costa', initials: 'AC', color: '#b4572e' },
  leo: { name: 'Leo Brandt', initials: 'LB', color: '#4a5fa8' },
  mei: { name: 'Mei Tanaka', initials: 'MT', color: '#8a4f9e' },
};
const channels = [
  { id: 'general', name: 'general', unread: 0 },
  { id: 'launch', name: 'launch', unread: 0 },
  { id: 'design', name: 'design', unread: 3 },
  { id: 'random', name: 'random', unread: 0 },
];

let nextId = 100;
const messages: Message[] = [
  { id: 1, channel: 'launch', author: 'ana', text: 'Release candidate is on staging. Please give it a spin before lunch.', at: '09:12' },
  { id: 2, channel: 'launch', author: 'leo', text: 'Checked billing and the onboarding emails, both fine.', at: '09:31' },
  { id: 3, channel: 'launch', author: 'mei', text: 'New screenshots for the changelog are in the design channel.', at: '09:40' },
  { id: 4, channel: 'launch', author: 'ana', text: 'Great. If nothing comes up we ship at 14:00.', at: '09:44' },
];

const json = (body: unknown, status = 200) => Response.json(body, { status });
const sockets = new Set<Bun.ServerWebSocket<unknown>>();
const push = (msg: object) => sockets.forEach((ws) => ws.send(JSON.stringify(msg)));
const now = () => new Date().toTimeString().slice(0, 5);

const server = Bun.serve({
  port: Number(process.env.PORT ?? 4317),
  async fetch(req, srv) {
    const { pathname } = new URL(req.url);
    if (pathname === '/live') return srv.upgrade(req) ? undefined : new Response('Expected a WebSocket', { status: 400 });
    if (pathname === '/') return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (pathname === '/api/me') return json({ id: 'you', ...people.you, workspace: 'Lumen Studio' });
    if (pathname === '/api/people') return json(people);
    if (pathname === '/api/channels') return json(channels);
    const m = pathname.match(/^\/api\/channels\/([a-z]+)\/messages$/);
    if (!m || !channels.some((c) => c.id === m[1])) return json({ error: 'not_found' }, 404);
    if (req.method === 'GET') return json(messages.filter((x) => x.channel === m[1]));
    if (req.method === 'POST') {
      const { text } = (await req.json()) as { text: string };
      await Bun.sleep(220);
      // The planted bug: the messages table is not utf8mb4, so 4-byte characters (most emoji) fail.
      if (/\p{Extended_Pictographic}/u.test(text)) {
        setTimeout(() => push({ type: 'channel.sync', channel: m[1], messages: messages.filter((x) => x.channel === m[1]) }), 1400);
        return json(
          { error: 'db_write_failed', message: "Incorrect string value: '\\xF0\\x9F\\x9A\\x80' for column 'body' at row 1" },
          500,
        );
      }
      const msg = { id: nextId++, channel: m[1], author: 'you', text, at: now() };
      messages.push(msg);
      push({ type: 'message.created', message: msg });
      return json(msg, 201);
    }
    return json({ error: 'method_not_allowed' }, 405);
  },
  websocket: {
    open(ws) {
      sockets.add(ws);
      ws.send(JSON.stringify({ type: 'presence', online: ['ana', 'leo', 'mei'] }));
    },
    message(_ws, data) {
      // The client says when it posted; a teammate answers a moment later.
      const msg = JSON.parse(String(data));
      if (msg.type !== 'posted' || msg.channel !== 'launch') return;
      setTimeout(() => push({ type: 'typing', channel: 'launch', author: 'ana' }), 600);
      setTimeout(() => {
        const reply = { id: nextId++, channel: 'launch', author: 'ana', text: 'Thanks Sam! Looks good on my side too.', at: now() };
        messages.push(reply);
        push({ type: 'message.created', message: reply });
      }, 2200);
    },
    close(ws) {
      sockets.delete(ws);
    },
  },
});

// Keepalive, like most chat backends.
setInterval(() => push({ type: 'ping', t: Date.now() }), 30000);

console.log(`Demo app on http://localhost:${server.port}`);

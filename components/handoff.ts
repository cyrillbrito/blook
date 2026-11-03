// Hands a bundle file picked in the side panel to the Replay page it opens.
// Extension pages share an origin, so a BroadcastChannel can carry the File itself
// (structured clone), with no copy through storage or the background.
const CHANNEL = 'blook-open-bundle';

type Msg = { type: 'want'; id: string } | { type: 'file'; id: string; file: File };

const pending = new Map<string, File>();
let channel: BroadcastChannel | undefined;

/** Side panel: keeps `file` until the Replay page asks for it. Returns the id to put in `?open=`. */
export function offerFile(file: File): string {
  const id = crypto.randomUUID();
  pending.set(id, file);
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (e: MessageEvent<Msg>) => {
      if (e.data?.type !== 'want') return;
      const f = pending.get(e.data.id);
      if (!f) return;
      pending.delete(e.data.id);
      channel!.postMessage({ type: 'file', id: e.data.id, file: f } satisfies Msg);
    };
  }
  return id;
}

/** Replay page: asks the panel for the file with `id`. Undefined when nobody answers in time. */
export function claimFile(id: string, timeoutMs = 3000): Promise<File | undefined> {
  return new Promise((resolve) => {
    const ch = new BroadcastChannel(CHANNEL);
    const done = (file?: File) => {
      clearTimeout(timer);
      ch.close();
      resolve(file);
    };
    const timer = setTimeout(() => done(), timeoutMs);
    ch.onmessage = (e: MessageEvent<Msg>) => {
      if (e.data?.type === 'file' && e.data.id === id) done(e.data.file);
    };
    ch.postMessage({ type: 'want', id } satisfies Msg);
  });
}

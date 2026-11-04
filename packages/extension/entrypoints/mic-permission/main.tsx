// Visible extension page that asks for the mic once. The offscreen document can't show
// the permission prompt, but after it's granted here it applies to the whole extension origin.
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { sendToBackground } from '@/lib/messages';
import { Button, Card } from '@blook/ui';
import { MicIcon } from '@blook/ui/icons';
import '@/assets/tailwind.css';

type State = { kind: 'asking' | 'idle' | 'granted' | 'error'; text?: string };

function App() {
  const [s, setS] = useState<State>({ kind: 'idle' });
  const asked = useRef(false);

  const ask = async () => {
    setS({ kind: 'asking', text: 'Waiting for your answer in the browser prompt…' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setS({ kind: 'granted', text: 'Microphone allowed. Returning to your recording…' });
      await sendToBackground({ type: 'mic/permission-granted' });
    } catch (err) {
      const e = err as DOMException;
      setS({
        kind: 'error',
        text:
          e?.name === 'NotAllowedError'
            ? 'Microphone blocked. Allow it with the icon in the address bar (or in site settings), then press the button again.'
            : `Could not open the microphone: ${e?.message ?? err}`,
      });
    }
  };

  // Ask right away, once (StrictMode runs effects twice in dev).
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void ask();
  }, []);

  return (
    <main className="flex min-h-screen items-start justify-center bg-surface-muted px-4 pt-24 text-sm text-fg">
      <Card className="w-full max-w-md space-y-4 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-recording-soft text-recording">
            <MicIcon className="h-5 w-5" />
          </span>
          <h1 className="text-lg font-semibold">Allow the microphone</h1>
        </div>
        <p className="text-muted">Blook needs microphone access to record your narration. You only need to allow it once.</p>
        <Button variant="record" disabled={s.kind === 'asking' || s.kind === 'granted'} onClick={() => void ask()}>
          <MicIcon className="h-4 w-4" />
          Allow microphone
        </Button>
        {s.text && <p className={s.kind === 'error' ? 'text-danger' : s.kind === 'granted' ? 'text-ok' : 'text-muted'}>{s.text}</p>}
      </Card>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

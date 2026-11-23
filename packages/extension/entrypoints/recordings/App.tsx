// The Recordings page: every recording, the settings, and Open bundle. Opened from the popup.
import { useRef } from 'react';
import { offerFile } from '@/components/handoff';
import { ApiKeyField, CaptureSwitches, LiveCard, SessionList, useRecorder } from '@/components/recorder-ui';
import { Alert, Button, Card, SectionTitle } from '@blook/ui';
import { BlookIcon, FolderOpenIcon } from '@blook/ui/icons';

export default function App() {
  const { status, sessions, error, stop, refreshSessions } = useRecorder();
  const idle = status.state === 'idle';
  return (
    <div className="min-h-screen bg-surface-muted text-sm text-fg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-6 py-3">
          <BlookIcon className="h-6 w-6" />
          <h1 className="text-base font-semibold">Recordings</h1>
          <OpenBundle />
        </div>
      </header>
      <main className="mx-auto grid max-w-4xl gap-6 px-6 py-6 md:grid-cols-[1fr_16rem]">
        <section className="min-w-0 space-y-3">
          {!idle && <LiveCard status={status} onStop={stop} />}
          {error && <Alert>{error}</Alert>}
          <SessionList sessions={sessions} activeId={!idle ? status.session?.id : undefined} onChanged={refreshSessions} />
        </section>
        <aside className="space-y-3">
          <SectionTitle>Recording</SectionTitle>
          <Card className="p-3">
            <CaptureSwitches locked={!idle} />
          </Card>
          <SectionTitle>Transcription</SectionTitle>
          <Card className="p-3">
            <ApiKeyField />
          </Card>
          <p className="text-xs text-muted">
            Start and stop with the toolbar icon, or with the shortcut set in{' '}
            <span className="font-mono">chrome://extensions/shortcuts</span> (Alt+Shift+R by default).
          </p>
        </aside>
      </main>
    </div>
  );
}

/** Picks a .zip here and hands it to a new Replay page (components/handoff.ts). */
function OpenBundle() {
  const input = useRef<HTMLInputElement>(null);
  const open = (file?: File) => {
    if (!file) return;
    const id = offerFile(file);
    browser.tabs.create({ url: browser.runtime.getURL(`/replay.html?open=${id}`) });
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          open(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        className="ml-auto"
        onClick={() => input.current?.click()}
        title="Open a bundle .zip in the viewer"
      >
        <FolderOpenIcon className="h-3.5 w-3.5" />
        Open bundle…
      </Button>
    </>
  );
}

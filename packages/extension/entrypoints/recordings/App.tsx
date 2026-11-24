// The extension's full page, with two views in one header: Recordings (the list, the default)
// and Settings (#settings). Opened from the popup; the Replay page links back here.
import { useEffect, useState } from 'react';
import { ApiKeyField, CaptureSwitches, LiveCard, openBundlePicker, SessionList, useRecorder } from '@/components/recorder-ui';
import { Alert, Button, Card, SectionTitle, tabClass } from '@blook/ui';
import { BlookIcon } from '@blook/ui/icons';
import FolderOpenIcon from 'lucide-react/icons/folder-open';

type View = 'recordings' | 'settings';
const viewFromHash = (): View => (location.hash === '#settings' ? 'settings' : 'recordings');

export default function App() {
  const [view, setView] = useState(viewFromHash);
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    document.title = view === 'settings' ? 'Blook settings' : 'Blook recordings';
  }, [view]);

  return (
    <div className="min-h-screen bg-canvas text-sm text-fg">
      <header className="border-b border-line-strong">
        <div className="mx-auto flex h-12 max-w-3xl items-stretch gap-4 px-6">
          <span className="flex items-center gap-2 font-semibold">
            <BlookIcon className="h-5 w-5" />
            Blook
          </span>
          <nav className="flex gap-1">
            <Tab href="#" active={view === 'recordings'}>
              Recordings
            </Tab>
            <Tab href="#settings" active={view === 'settings'}>
              Settings
            </Tab>
          </nav>
          {view === 'recordings' && (
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto self-center"
              onClick={openBundlePicker}
              title="Open a bundle .zip or folder in the viewer"
            >
              <FolderOpenIcon className="h-3.5 w-3.5" />
              Open bundle…
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-6">{view === 'settings' ? <Settings /> : <Recordings />}</main>
    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <a href={href} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
      {children}
    </a>
  );
}

function Recordings() {
  const { status, sessions, error, stop, refreshSessions } = useRecorder();
  const idle = status.state === 'idle';
  return (
    <section className="space-y-3">
      {!idle && <LiveCard status={status} onStop={stop} />}
      {error && <Alert>{error}</Alert>}
      <SessionList sessions={sessions} activeId={!idle ? status.session?.id : undefined} onChanged={refreshSessions} openHere />
      <p className="text-xs text-muted">Recordings stay in this browser until you delete them. Download one to share it as a .zip.</p>
    </section>
  );
}

function Settings() {
  const { status } = useRecorder();
  const idle = status.state === 'idle';
  return (
    <div className="max-w-xl space-y-6">
      <section className="space-y-2">
        <SectionTitle>Recording</SectionTitle>
        <Card className="space-y-2 p-4">
          <CaptureSwitches locked={!idle} canvas />
          <p className="text-xs text-muted">
            {idle
              ? 'Canvas is for charts, maps and drawing apps, which replay blank without it. It makes bundles much bigger.'
              : 'Locked while recording: these apply at Record.'}
          </p>
        </Card>
      </section>
      <section className="space-y-2">
        <SectionTitle>Transcription</SectionTitle>
        <Card className="p-4">
          <ApiKeyField />
        </Card>
      </section>
      <section className="space-y-2">
        <SectionTitle>Shortcut</SectionTitle>
        <Card className="flex items-center gap-3 p-4">
          <p className="flex-1 text-xs text-muted">
            Start and stop recording the active tab with <kbd className="font-mono text-fg">Alt+Shift+R</kbd>, or the key you set in Chrome.
          </p>
          <Button size="sm" onClick={() => browser.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
            Change
          </Button>
        </Card>
      </section>
    </div>
  );
}

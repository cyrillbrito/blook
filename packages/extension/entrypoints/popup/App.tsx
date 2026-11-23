// The toolbar popup: Record (or Stop), the capture switches, and the latest recordings.
// It closes once recording starts; the pill on the page (pill.content.ts) takes over.
import { useState } from 'react';
import { shortUrl } from '@blook/core/format';
import { Alert, Button, IconButton, cx } from '@blook/ui';
import { BlookIcon, FolderOpenIcon, GearIcon, RecordIcon } from '@blook/ui/icons';
import {
  CaptureSwitches,
  isRecordable,
  LiveCard,
  openRecordings,
  SessionList,
  useActiveTab,
  useRecorder,
  useSettings,
} from '@/components/recorder-ui';

const RECENT = 3;

export default function App() {
  const { status, sessions, error, record, stop, refreshSessions } = useRecorder();
  const [settings] = useSettings();
  const idle = status.state === 'idle';
  const onRecord = async () => {
    if (await record()) window.close();
  };

  return (
    <main className="flex flex-col gap-3 bg-surface-muted p-3 text-sm text-fg">
      <header className="flex items-center gap-2">
        <BlookIcon className="h-5 w-5" />
        <span className="font-semibold">Blook</span>
        <IconButton label="Settings and all recordings" className="ml-auto" onClick={openRecordings}>
          <GearIcon className="h-3.5 w-3.5" />
        </IconButton>
      </header>

      {idle ? <IdleCard onRecord={onRecord} /> : <LiveCard status={status} onStop={stop} />}
      {error && <Alert>{error}</Alert>}
      {idle && !settings.openRouterApiKey && (
        <button className="cursor-pointer text-left text-xs text-warn hover:underline" onClick={openRecordings}>
          No OpenRouter API key: narration won't be transcribed.
        </button>
      )}

      {sessions.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="text-xs font-semibold">Recent</h2>
          <SessionList sessions={sessions.slice(0, RECENT)} activeId={!idle ? status.session?.id : undefined} onChanged={refreshSessions} />
        </section>
      )}

      <footer className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={openRecordings}>
          All recordings{sessions.length > 0 && ` (${sessions.length})`}
        </Button>
        {/* The Replay page without a bundle is a picker. The popup itself can't hold a file picker: it closes when the dialog takes focus. */}
        <Button variant="ghost" size="sm" onClick={() => browser.tabs.create({ url: browser.runtime.getURL('/replay.html') })}>
          <FolderOpenIcon className="h-3.5 w-3.5" />
          Open bundle…
        </Button>
      </footer>
    </main>
  );
}

function IdleCard({ onRecord }: { onRecord: () => void }) {
  const tab = useActiveTab();
  const blocked = !!tab && !isRecordable(tab.url);
  const [starting, setStarting] = useState(false);
  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-3">
      <Button
        variant="record"
        size="lg"
        className="w-full"
        disabled={blocked || starting}
        onClick={() => {
          setStarting(true);
          onRecord();
        }}
      >
        <RecordIcon className="h-4 w-4" />
        Start recording
      </Button>
      <p className={cx('text-center text-xs text-muted', !blocked && 'truncate')} title={tab?.url}>
        {blocked ? (
          "Chrome doesn't let extensions record this page. Switch to your web app's tab."
        ) : tab?.url ? (
          <>
            Records this tab: <span className="text-fg">{tab.title || shortUrl(tab.url)}</span>
          </>
        ) : (
          'Records the active tab.'
        )}
      </p>
      <CaptureSwitches locked={false} className="border-t border-line pt-3" />
    </div>
  );
}

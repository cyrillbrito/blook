// The toolbar popup: Record (or Stop), the capture switches, and the latest recordings.
// It closes once recording starts; the pill on the page (pill.content.ts) takes over.
import { useState } from 'react';
import { Alert, Button, Card, IconButton, cx } from '@blook/ui';
import { BlookIcon, RecordIcon } from '@blook/ui/icons';
import FolderOpenIcon from 'lucide-react/icons/folder-open';
import SettingsIcon from 'lucide-react/icons/settings';
import { urlHost } from '@blook/core/format';
import { isRecordable } from '@/lib/recordable';
import {
  CaptureSwitches,
  LiveCard,
  openBundlePicker,
  openRecordings,
  openSettings,
  SessionList,
  useActiveTab,
  useRecorder,
} from '@/components/recorder-ui';

const RECENT = 3;

export default function App() {
  const { status, sessions, error, record, stop, refreshSessions } = useRecorder();
  const idle = status.state === 'idle';
  const onRecord = async () => {
    if (await record()) window.close();
  };

  return (
    <main className="flex flex-col gap-3 bg-canvas p-3 text-sm text-fg">
      <header className="flex items-center gap-2">
        <BlookIcon className="h-5 w-5" />
        <span className="font-semibold">Blook</span>
        <IconButton label="Settings" className="ml-auto" onClick={openSettings}>
          <SettingsIcon className="h-3.5 w-3.5" />
        </IconButton>
      </header>

      {idle ? <IdleCard onRecord={onRecord} /> : <LiveCard status={status} onStop={stop} />}
      {error && <Alert>{error}</Alert>}

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
        <Button variant="ghost" size="sm" onClick={openBundlePicker}>
          <FolderOpenIcon className="h-3.5 w-3.5" />
          Open bundle…
        </Button>
      </footer>
    </main>
  );
}

function IdleCard({ onRecord }: { onRecord: () => Promise<void> }) {
  const tab = useActiveTab();
  const blocked = !!tab && !isRecordable(tab.url);
  const [starting, setStarting] = useState(false);
  return (
    <Card className="space-y-3 p-3">
      <Button
        variant="record"
        size="lg"
        className="w-full"
        disabled={blocked || starting}
        onClick={() => {
          setStarting(true);
          // On success the popup closes; on failure Record is enabled again next to the error.
          void onRecord().finally(() => setStarting(false));
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
            Records this tab: {/* The site, not the tab title: titles are often long or noisy. */}
            <span className="text-fg">{urlHost(tab.url)}</span>
          </>
        ) : (
          'Records the active tab.'
        )}
      </p>
      <CaptureSwitches locked={false} className="border-t border-line pt-3" />
    </Card>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteSession, listSessions } from '@/lib/db';
import type { PanelMessage, RecordingStatus } from '@/lib/messages';
import { settingsItem } from '@/lib/settings';
import { DEFAULT_SETTINGS, type MicState, type SessionMeta, type Settings } from '@/lib/types';
import { formatDate, formatDuration, shortUrl, tryBackground } from '@/components/util';
import { offerFile } from '@/components/handoff';
import { Alert, Badge, Button, Card, Field, IconButton, Input, LiveDot, SectionTitle, Switch, cx } from '@/components/ui';
import {
  DownloadIcon,
  FolderOpenIcon,
  GearIcon,
  MicIcon,
  MicOffIcon,
  RecordIcon,
  SpinnerIcon,
  StopIcon,
  TrashIcon,
  BlookIcon,
} from '@/components/ui/icons';

const NO_ANSWER = 'The background worker did not answer.';

export default function App() {
  const [status, setStatus] = useState<RecordingStatus>({ state: 'idle' });
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [error, setError] = useState<string>();

  const refreshSessions = useCallback(async () => {
    // Prefer the background's list; fall back to reading IndexedDB directly.
    const list = (await tryBackground({ type: 'sessions/list' })) ?? (await listSessions().catch(() => []));
    setSessions(list);
  }, []);

  useEffect(() => {
    tryBackground({ type: 'session/status' }).then((s) => s && setStatus(s));
    refreshSessions();
    const onMessage = (message: PanelMessage) => {
      if (message?.type === 'sessions/changed') return void refreshSessions();
      if (message?.type !== 'status/update') return;
      setStatus(message.status);
      if (message.status.state === 'idle') refreshSessions();
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, [refreshSessions]);

  const record = async () => {
    setError(undefined);
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return setError('No active tab to record.');
    setStatus({ state: 'starting' });
    const res = await tryBackground({ type: 'session/start', tabId: tab.id }, 15000);
    if (res) setStatus(res);
    else {
      setStatus({ state: 'idle' });
      setError(NO_ANSWER);
    }
  };

  const stop = async () => {
    setError(undefined);
    setStatus((s) => ({ ...s, state: 'stopping' }));
    const res = await tryBackground({ type: 'session/stop' }, 15000);
    if (res) setStatus(res);
    else setError(NO_ANSWER);
    refreshSessions();
  };

  return (
    <main className="flex min-h-screen flex-col gap-3 bg-surface-muted p-3 text-sm text-fg">
      <Header />
      {status.state === 'idle' ? <IdleCard onRecord={record} /> : <LiveCard status={status} onStop={stop} />}
      {(error || status.error) && <Alert>{error ?? status.error}</Alert>}
      <SettingsCard locked={status.state !== 'idle'} />
      <SessionList sessions={sessions} activeId={status.state !== 'idle' ? status.session?.id : undefined} onChanged={refreshSessions} />
    </main>
  );
}

/** Brand plus "Open bundle…": pick a .zip here, the Replay page opens with it. */
function Header() {
  const input = useRef<HTMLInputElement>(null);
  const open = (file?: File) => {
    if (!file) return;
    const id = offerFile(file);
    browser.tabs.create({ url: browser.runtime.getURL(`/replay.html?open=${id}`) });
  };
  return (
    <header className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 font-semibold">
        <BlookIcon />
        Blook
      </span>
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
      <Button variant="ghost" size="sm" className="ml-auto" onClick={() => input.current?.click()} title="Open a bundle .zip in the viewer">
        <FolderOpenIcon className="h-3.5 w-3.5" />
        Open bundle…
      </Button>
    </header>
  );
}

/** The tab Record would capture: the active tab of this window. */
function useActiveTab() {
  const [tab, setTab] = useState<{ url?: string; title?: string }>();
  useEffect(() => {
    const read = () =>
      browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTab(t ? { url: t.url, title: t.title } : undefined));
    read();
    const onUpdated = (_id: number, info: { url?: string; title?: string; status?: string }) => {
      if (info.url || info.title || info.status) read();
    };
    browser.tabs.onActivated.addListener(read);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.tabs.onActivated.removeListener(read);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);
  return tab;
}

function IdleCard({ onRecord }: { onRecord: () => void }) {
  const tab = useActiveTab();
  return (
    <Card className="space-y-2 p-3">
      <Button variant="record" size="lg" className="w-full" onClick={onRecord}>
        <RecordIcon className="h-4 w-4" />
        Start recording
      </Button>
      <p className="truncate text-center text-xs text-muted" title={tab?.url}>
        {tab?.url ? (
          <>
            Records this tab: <span className="text-fg">{tab.title || shortUrl(tab.url)}</span>
          </>
        ) : (
          'Records the active tab.'
        )}
      </p>
    </Card>
  );
}

const MIC: Record<MicState, { label: string; tone: 'neutral' | 'ok' | 'warn' | 'danger'; on: boolean }> = {
  off: { label: 'Mic off', tone: 'neutral', on: false },
  starting: { label: 'Mic starting…', tone: 'neutral', on: true },
  recording: { label: 'Mic on', tone: 'ok', on: true },
  'needs-permission': { label: 'Mic needs permission', tone: 'warn', on: false },
  failed: { label: 'Mic failed', tone: 'danger', on: false },
  stopped: { label: 'Mic stopped', tone: 'neutral', on: false },
};

/** While starting, recording or stopping: the live state and Stop. */
function LiveCard({ status, onStop }: { status: RecordingStatus; onStop: () => void }) {
  const { state, session, phase } = status;
  const recording = state === 'recording';
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [recording]);

  const elapsed = session ? Math.max(0, now - session.startedAt) : 0;
  const loading = recording && phase === 'loading-page';
  const mic = MIC[status.mic ?? session?.mic?.state ?? 'off'];
  const label = state === 'starting' ? 'Starting…' : state === 'stopping' ? 'Saving…' : loading ? 'Loading page…' : 'Recording';

  return (
    <Card className="space-y-3 border-red-200 p-3 shadow-sm ring-1 ring-red-100">
      <div className="flex items-center gap-2">
        {recording ? <LiveDot /> : <SpinnerIcon className="h-3.5 w-3.5 text-muted" />}
        <span className={cx('text-xs font-semibold tracking-wide uppercase', recording ? 'text-recording-strong' : 'text-muted')}>{label}</span>
        {status.mic || session?.mic ? (
          <span className="ml-auto">
            <Badge tone={mic.tone} title={session?.mic?.error}>
              {mic.on ? <MicIcon className="h-3 w-3" /> : <MicOffIcon className="h-3 w-3" />}
              {mic.label}
            </Badge>
          </span>
        ) : null}
      </div>

      <div className="font-mono text-4xl leading-none font-semibold tabular-nums">{formatDuration(recording ? elapsed : (session?.durationMs ?? elapsed))}</div>

      {session && (
        <div className="min-w-0 space-y-0.5">
          <div className="truncate font-medium" title={session.title}>
            {session.title || shortUrl(session.url)}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="min-w-0 truncate" title={session.url}>
              {shortUrl(session.url)}
            </span>
            {session.tabs.length > 1 && <Badge>{session.tabs.length} tabs</Badge>}
          </div>
          {loading && <p className="pt-1 text-xs text-warn">Waiting for the page: no DOM captured yet.</p>}
        </div>
      )}

      <Button variant="primary" size="lg" className="w-full" disabled={!recording} onClick={onStop}>
        {recording ? <StopIcon className="h-4 w-4" /> : <SpinnerIcon className="h-4 w-4" />}
        {recording ? 'Stop recording' : state === 'starting' ? 'Starting…' : 'Stopping…'}
      </Button>
    </Card>
  );
}

function SettingsCard({ locked }: { locked: boolean }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    settingsItem.getValue().then(setSettings);
    return settingsItem.watch((value) => setSettings(value ?? DEFAULT_SETTINGS));
  }, []);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    settingsItem.setValue(next);
  };

  return (
    <Card className="p-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-1 flex-wrap gap-x-4 gap-y-2 text-xs">
          <Switch label="Microphone" checked={settings.mic} disabled={locked} onChange={(mic) => update({ mic })} />
          <Switch label="Mask inputs and text" checked={settings.mask} disabled={locked} onChange={(mask) => update({ mask })} />
          <Switch label="Canvas (2 fps)" checked={!!settings.canvas} disabled={locked} onChange={(canvas) => update({ canvas })} />
        </div>
        <IconButton label={open ? 'Hide settings' : 'Settings'} onClick={() => setOpen(!open)} className={cx(open && 'bg-surface-sunken text-fg')}>
          <GearIcon className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      {!open && !settings.openRouterApiKey && (
        <button className="mt-2 cursor-pointer text-xs text-warn hover:underline" onClick={() => setOpen(true)}>
          No OpenRouter API key: narration won't be transcribed.
        </button>
      )}
      {open && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <Field label="OpenRouter API key">
            <Input
              type="password"
              className="font-mono"
              placeholder="sk-or-…"
              value={settings.openRouterApiKey}
              onChange={(e) => update({ openRouterApiKey: e.target.value.trim() })}
            />
          </Field>
          <p className="text-xs text-muted">Narration is transcribed with {DEFAULT_SETTINGS.transcriptionModel} on OpenRouter.</p>
        </div>
      )}
    </Card>
  );
}

function SessionList({ sessions, activeId, onChanged }: { sessions: SessionMeta[]; activeId?: string; onChanged: () => void }) {
  return (
    <section className="space-y-1.5">
      <SectionTitle
        actions={
          <Button variant="ghost" size="sm" onClick={onChanged}>
            Refresh
          </Button>
        }
      >
        Recordings {sessions.length > 0 && <span className="font-normal">({sessions.length})</span>}
      </SectionTitle>
      {sessions.length === 0 ? (
        <Card className="px-3 py-6 text-center text-xs text-muted">No recordings yet. Press Start recording and talk while you use the page.</Card>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} active={s.id === activeId} onChanged={onChanged} />
          ))}
        </Card>
      )}
    </section>
  );
}

function SessionRow({ session, active, onChanged }: { session: SessionMeta; active: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<'export' | 'delete'>();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: 'danger' | 'warn' }>();
  // status 'recording' without being the live session means it ended without Stop (browser closed or crashed).
  const live = active;
  const duration = session.durationMs ?? (session.endedAt ? session.endedAt - session.startedAt : undefined);

  // Drop a pending confirm after a few seconds.
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(id);
  }, [confirming]);

  const openReplay = () =>
    browser.tabs.create({ url: browser.runtime.getURL(`/replay.html?session=${encodeURIComponent(session.id)}`) });

  const exportZip = async () => {
    setBusy('export');
    setNote(undefined);
    // Export can include transcription, so allow it a long time.
    const res = await tryBackground({ type: 'session/export', sessionId: session.id }, 10 * 60_000);
    setBusy(undefined);
    if (!res) setNote({ text: NO_ANSWER, tone: 'danger' });
    else if (!res.ok) setNote({ text: res.error ?? 'Download failed.', tone: 'danger' });
    else if (res.error) setNote({ text: res.error, tone: 'warn' });
  };

  const remove = async () => {
    setConfirming(false);
    setBusy('delete');
    const res = await tryBackground({ type: 'session/delete', sessionId: session.id });
    if (!res) await deleteSession(session.id).catch((e) => setNote({ text: String(e), tone: 'danger' }));
    setBusy(undefined);
    onChanged();
  };

  const t = session.transcription;
  return (
    <div className={cx('px-3 py-2', live && 'bg-recording-soft/60')}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium" title={session.url}>
            {session.title || shortUrl(session.url)}
          </div>
          {session.title && (
            <div className="truncate text-xs text-muted" title={session.url}>
              {shortUrl(session.url)}
            </div>
          )}
        </div>
        {confirming ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="danger" size="sm" onClick={remove}>
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button size="sm" onClick={openReplay} disabled={live} title="Open in the viewer">
              Open
            </Button>
            <IconButton label="Download bundle .zip" onClick={exportZip} disabled={!!busy || live}>
              {busy === 'export' ? <SpinnerIcon className="h-3.5 w-3.5" /> : <DownloadIcon className="h-3.5 w-3.5" />}
            </IconButton>
            <IconButton label="Delete" onClick={() => setConfirming(true)} disabled={!!busy || live} className="hover:text-danger">
              <TrashIcon className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <span>{formatDate(session.startedAt)}</span>
        <span>·</span>
        <span className="tabular-nums">{live ? 'recording' : duration != null ? formatDuration(duration) : '—'}</span>
        {live && <Badge tone="recording">recording</Badge>}
        {!live && session.status === 'recording' && <Badge tone="warn">ended without Stop</Badge>}
        {t && t.state !== 'none' && (
          <Badge tone={TRANSCRIPTION_TONE[t.state]} title={t.error}>
            {transcriptionLabel(t)}
          </Badge>
        )}
        {session.tabs.length > 1 && <Badge>{session.tabs.length} tabs</Badge>}
        {busy === 'export' && <span>preparing download…</span>}
      </div>
      {confirming && <div className="mt-1 text-xs text-danger">Delete this recording? This can't be undone.</div>}
      {note && <div className={cx('mt-1 text-xs', note.tone === 'danger' ? 'text-danger' : 'text-warn')}>{note.text}</div>}
    </div>
  );
}

const TRANSCRIPTION_TONE: Record<NonNullable<SessionMeta['transcription']>['state'], 'neutral' | 'accent' | 'ok' | 'warn' | 'danger'> = {
  none: 'neutral',
  'no-key': 'warn',
  pending: 'accent',
  transcribing: 'accent',
  done: 'ok',
  partial: 'warn',
  failed: 'danger',
};

function transcriptionLabel(t: NonNullable<SessionMeta['transcription']>): string {
  switch (t.state) {
    case 'transcribing':
    case 'pending':
      return `transcribing ${t.done}/${t.total}`;
    case 'done':
      return 'transcribed';
    case 'no-key':
      return 'not transcribed: no API key';
    case 'partial':
      return `transcribed ${t.done}/${t.total}`;
    case 'failed':
      return 'transcription failed';
    default:
      return '';
  }
}

import { useCallback, useEffect, useState } from 'react';
import { deleteSession, listSessions } from '@/lib/db';
import type { PanelMessage, RecordingStatus } from '@/lib/messages';
import { settingsItem } from '@/lib/settings';
import { DEFAULT_SETTINGS, type SessionMeta, type Settings } from '@/lib/types';
import { formatDate, formatDuration, shortUrl, tryBackground } from '@/components/util';

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
    <main className="flex min-h-screen flex-col gap-4 bg-white p-3 text-sm text-gray-900">
      <RecordControls status={status} onRecord={record} onStop={stop} />
      {(error || status.error) && (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700">{error ?? status.error}</p>
      )}
      <SettingsPanel locked={status.state !== 'idle'} />
      <SessionList sessions={sessions} onChanged={refreshSessions} />
    </main>
  );
}

function RecordControls(props: { status: RecordingStatus; onRecord: () => void; onStop: () => void }) {
  const { state, session } = props.status;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (state !== 'recording') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [state]);

  const elapsed = session && state === 'recording' ? now - session.startedAt : 0;
  const busy = state === 'starting' || state === 'stopping';
  const recording = state === 'recording';

  return (
    <section className="flex items-center gap-3">
      <button
        className={`w-24 rounded px-3 py-2 font-medium text-white disabled:opacity-60 ${
          recording ? 'bg-gray-800 hover:bg-gray-900' : 'bg-red-600 hover:bg-red-700'
        }`}
        disabled={busy}
        onClick={recording ? props.onStop : props.onRecord}
      >
        {recording ? 'Stop' : busy ? '…' : 'Record'}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {recording && <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />}
          <span className="font-medium">
            {recording && props.status.phase === 'loading-page' ? 'Loading page…' : STATE_LABEL[state]}
          </span>
          {recording && <span className="font-mono tabular-nums text-gray-600">{formatDuration(elapsed)}</span>}
        </div>
        {session && state !== 'idle' && (
          <div className="truncate text-xs text-gray-500" title={session.url}>
            {shortUrl(session.url)}
          </div>
        )}
      </div>
    </section>
  );
}

const STATE_LABEL: Record<RecordingStatus['state'], string> = {
  idle: 'Ready',
  starting: 'Starting…',
  recording: 'Recording',
  stopping: 'Stopping…',
};

function SettingsPanel({ locked }: { locked: boolean }) {
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
    <section className="space-y-2 rounded border border-gray-200 p-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Toggle label="Mask inputs and text" checked={settings.mask} disabled={locked} onChange={(mask) => update({ mask })} />
        <Toggle label="Microphone" checked={settings.mic} disabled={locked} onChange={(mic) => update({ mic })} />
        <Toggle label="Canvas (2 fps)" checked={!!settings.canvas} disabled={locked} onChange={(canvas) => update({ canvas })} />
        <button className="ml-auto text-xs text-gray-500 hover:text-gray-900" onClick={() => setOpen(!open)}>
          {open ? 'Hide settings' : 'Settings'}
          {!open && !settings.openRouterApiKey && <span className="ml-1 text-amber-600">(no API key)</span>}
        </button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-gray-100 pt-2">
          <label className="block">
            <span className="text-xs text-gray-600">OpenRouter API key</span>
            <input
              type="password"
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
              placeholder="sk-or-…"
              value={settings.openRouterApiKey}
              onChange={(e) => update({ openRouterApiKey: e.target.value.trim() })}
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-600">Transcription model (needs word timestamps)</span>
            <input
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
              placeholder={DEFAULT_SETTINGS.transcriptionModel}
              value={settings.transcriptionModel}
              onChange={(e) => update({ transcriptionModel: e.target.value.trim() })}
            />
          </label>
        </div>
      )}
    </section>
  );
}

function Toggle(props: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-center gap-1.5 ${props.disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        className="accent-red-600"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      {props.label}
    </label>
  );
}

function SessionList({ sessions, onChanged }: { sessions: SessionMeta[]; onChanged: () => void }) {
  return (
    <section className="space-y-1">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sessions</h2>
        <button className="text-xs text-gray-500 hover:text-gray-900" onClick={onChanged}>
          Refresh
        </button>
      </div>
      {sessions.length === 0 ? (
        <p className="py-4 text-center text-xs text-gray-400">No recordings yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded border border-gray-200">
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SessionRow({ session, onChanged }: { session: SessionMeta; onChanged: () => void }) {
  const [busy, setBusy] = useState<'export' | 'delete'>();
  const [error, setError] = useState<string>();
  const recording = session.status === 'recording';
  const duration = session.durationMs ?? (session.endedAt ? session.endedAt - session.startedAt : undefined);

  const openReplay = () =>
    browser.tabs.create({ url: browser.runtime.getURL(`/replay.html?session=${encodeURIComponent(session.id)}` ) });

  const exportZip = async () => {
    setBusy('export');
    setError(undefined);
    // Export can include transcription, so allow it a long time.
    const res = await tryBackground({ type: 'session/export', sessionId: session.id }, 10 * 60_000);
    setBusy(undefined);
    if (!res) setError(NO_ANSWER);
    else if (!res.ok) setError(res.error ?? 'Export failed.');
  };

  const remove = async () => {
    if (!confirm(`Delete the recording of ${shortUrl(session.url)}?`)) return;
    setBusy('delete');
    const res = await tryBackground({ type: 'session/delete', sessionId: session.id });
    if (!res) await deleteSession(session.id).catch((e) => setError(String(e)));
    setBusy(undefined);
    onChanged();
  };

  return (
    <li className="space-y-1 px-2 py-1.5">
      <div className="truncate font-medium" title={session.url}>
        {session.title || shortUrl(session.url)}
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>{formatDate(session.startedAt)}</span>
        <span>·</span>
        <span>{recording ? 'recording' : duration != null ? formatDuration(duration) : '—'}</span>
        {session.transcription && session.transcription.state !== 'none' && (
          <>
            <span>·</span>
            <span
              className={session.transcription.state === 'failed' || session.transcription.state === 'partial' ? 'text-red-600' : undefined}
              title={session.transcription.error}
            >
              {transcriptionLabel(session.transcription)}
            </span>
          </>
        )}
        {session.tabs.length > 1 && (
          <>
            <span>·</span>
            <span>{session.tabs.length} tabs</span>
          </>
        )}
        <span className="ml-auto flex gap-2">
          <RowAction onClick={openReplay}>Replay</RowAction>
          <RowAction onClick={exportZip} disabled={!!busy || recording}>
            {busy === 'export' ? 'Exporting…' : 'Export'}
          </RowAction>
          <RowAction onClick={remove} disabled={!!busy || recording} danger>
            Delete
          </RowAction>
        </span>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
    </li>
  );
}

function transcriptionLabel(t: NonNullable<SessionMeta['transcription']>): string {
  switch (t.state) {
    case 'transcribing':
    case 'pending':
      return `transcribing ${t.done}/${t.total}`;
    case 'done':
      return 'transcribed';
    case 'no-key':
      return 'no API key';
    case 'partial':
      return `transcribed ${t.done}/${t.total}`;
    case 'failed':
      return `failed: ${(t.error ?? 'transcription').slice(0, 40)}`;
    default:
      return '';
  }
}

function RowAction(props: { onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      className={`hover:underline disabled:opacity-40 disabled:no-underline ${props.danger ? 'text-red-600' : 'text-blue-700'}`}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

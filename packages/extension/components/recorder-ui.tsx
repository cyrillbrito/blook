// React pieces shared by the toolbar popup and the Recordings page (with its Settings view).
import type { PublicPath } from 'wxt/browser';
import { useCallback, useEffect, useState } from 'react';
import type { BroadcastMessage, RecordingStatus, SessionListItem, TranscriptionStatus } from '@/lib/messages';
import { DEFAULT_SETTINGS, getSettings, updateSettings, watchSettings } from '@/lib/settings';
import { TRANSCRIPTION_MODEL, type Settings } from '@blook/core/types';
import { formatDuration, shortUrl, urlHost } from '@blook/core/format';
import { formatDate, NO_ANSWER, tryBackground } from './util';
import { MIC } from './mic';
import { Badge, Button, Card, Field, IconButton, Input, LiveDot, Switch, cx } from '@blook/ui';
import { StopIcon } from '@blook/ui/icons';
import DownloadIcon from 'lucide-react/icons/download';
import LoaderCircleIcon from 'lucide-react/icons/loader-circle';
import MicIcon from 'lucide-react/icons/mic';
import MicOffIcon from 'lucide-react/icons/mic-off';
import Trash2Icon from 'lucide-react/icons/trash-2';

/** Opens a page of the extension: in this tab with `here` (the Recordings page), else in a new tab (the popup). */
const openPage = (path: string, here?: boolean) => {
  if (here) location.assign(path);
  else browser.tabs.create({ url: browser.runtime.getURL(path as PublicPath) });
};

export const openReplay = (sessionId: string, here?: boolean) => openPage(`/replay.html?session=${encodeURIComponent(sessionId)}`, here);
export const openRecordings = () => openPage('/recordings.html');
export const openSettings = () => openPage('/recordings.html#settings');
/** The Replay page without a session is the bundle picker. The popup can't hold a file picker: it closes when the dialog takes focus. */
export const openBundlePicker = () => openPage('/replay.html', location.pathname === '/recordings.html');

/** The recording status and the stored sessions, kept fresh from the background's broadcasts. */
export function useRecorder() {
  const [status, setStatus] = useState<RecordingStatus>({ state: 'idle' });
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [error, setError] = useState<string>();

  const refreshSessions = useCallback(async () => {
    const list = await tryBackground({ type: 'sessions/list' });
    if (list) setSessions(list);
  }, []);

  useEffect(() => {
    tryBackground({ type: 'session/status' }).then((s) => s && setStatus(s));
    refreshSessions();
    const onMessage = (message: BroadcastMessage) => {
      if (message?.type === 'sessions/changed') return void refreshSessions();
      if (message?.type !== 'status/update') return;
      setStatus(message.status);
      refreshSessions();
    };
    // Other pages can change the list too; reread when this one comes back.
    const onVisible = () => document.visibilityState === 'visible' && refreshSessions();
    browser.runtime.onMessage.addListener(onMessage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      browser.runtime.onMessage.removeListener(onMessage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshSessions]);

  /** Records the active tab of this window. Resolves to true once recording. */
  const record = async () => {
    setError(undefined);
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return void setError('No active tab to record.');
    setStatus({ state: 'starting' });
    const res = await tryBackground({ type: 'session/start', tabId: tab.id }, 15000);
    if (res) setStatus(res);
    else {
      setStatus({ state: 'idle' });
      setError(NO_ANSWER);
    }
    return res?.state === 'recording';
  };

  const stop = async () => {
    setError(undefined);
    setStatus((s) => ({ ...s, state: 'stopping' }));
    const res = await tryBackground({ type: 'session/stop' }, 15000);
    if (res) setStatus(res);
    else setError(NO_ANSWER);
    refreshSessions();
  };

  return { status, sessions, error: error ?? status.error, record, stop, refreshSessions };
}

/** The tab Record would capture: the active tab of this window. */
export function useActiveTab() {
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

/** While starting, recording or stopping: a status line, the page, and Stop. */
export function LiveCard({ status, onStop }: { status: RecordingStatus; onStop: () => void }) {
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
  const mic = session && MIC[session.mic.state];
  const label = state === 'starting' ? 'Starting…' : state === 'stopping' ? 'Saving…' : loading ? 'Loading page…' : 'Recording';

  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-center gap-2">
        {recording ? <LiveDot /> : <LoaderCircleIcon className="h-3.5 w-3.5 text-muted animate-spin" />}
        <span className="font-medium">{label}</span>
        <span className="text-muted tabular-nums">{formatDuration(recording ? elapsed : (session?.durationMs ?? elapsed))}</span>
        {/* Always rendered so the row doesn't shift when the mic state arrives. */}
        <span
          title={session?.mic.error}
          className={cx(
            'ml-auto flex h-4 items-center gap-1 text-xs',
            mic?.tone === 'warn' ? 'text-warn' : mic?.tone === 'danger' ? 'text-danger' : 'text-muted',
          )}
        >
          {mic && (mic.on ? <MicIcon className="h-3.5 w-3.5" /> : <MicOffIcon className="h-3.5 w-3.5" />)}
          {mic?.label}
        </span>
      </div>

      {/* Fixed-height lines so starting → loading → recording doesn't jump. */}
      <div className="min-w-0 space-y-0.5 text-xs leading-4 text-muted">
        <div className="h-4 truncate text-fg" title={session?.title}>
          {session ? session.title || urlHost(session.url) : ''}
        </div>
        <div className="flex h-4 items-center gap-1.5">
          {session && (
            <span className="min-w-0 truncate" title={session.url}>
              {urlHost(session.url)}
            </span>
          )}
          {session && session.tabs.length > 1 && <Badge>{session.tabs.length} tabs</Badge>}
        </div>
      </div>

      <Button size="lg" className="w-full" disabled={!recording} onClick={onStop}>
        {recording ? <StopIcon className="h-3.5 w-3.5" /> : <LoaderCircleIcon className="h-3.5 w-3.5 animate-spin" />}
        {recording ? 'Stop recording' : state === 'starting' ? 'Starting…' : 'Stopping…'}
      </Button>
    </Card>
  );
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    void getSettings().then(setSettings);
    return watchSettings(setSettings);
  }, []);
  const update = (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    void updateSettings(patch);
  };
  return [settings, update] as const;
}

/** Mic, masking and (with `canvas`, outside the popup) canvas. Locked while recording: they apply at Record. */
export function CaptureSwitches({ locked, canvas, className }: { locked: boolean; canvas?: boolean; className?: string }) {
  const [settings, update] = useSettings();
  return (
    <div className={cx('flex flex-col items-start gap-2 text-xs', className)}>
      <Switch label="Microphone" checked={settings.mic} disabled={locked} onChange={(mic) => update({ mic })} />
      <Switch label="Mask inputs and text" checked={settings.mask} disabled={locked} onChange={(mask) => update({ mask })} />
      {canvas && <Switch label="Canvas (2 fps)" checked={settings.canvas} disabled={locked} onChange={(canvas) => update({ canvas })} />}
    </div>
  );
}

export function ApiKeyField() {
  const [settings, update] = useSettings();
  return (
    <div className="space-y-1">
      <Field label="OpenRouter API key">
        <Input
          type="password"
          className="font-mono"
          placeholder="sk-or-…"
          value={settings.openRouterApiKey}
          onChange={(e) => update({ openRouterApiKey: e.target.value.trim() })}
        />
      </Field>
      <p className="text-xs text-muted">
        {settings.openRouterApiKey
          ? `Narration is transcribed with ${TRANSCRIPTION_MODEL} on OpenRouter.`
          : 'Without a key, narration is kept but not transcribed. Add one later and download again.'}
      </p>
    </div>
  );
}

export function SessionList({
  sessions,
  activeId,
  onChanged,
  openHere,
}: {
  sessions: SessionListItem[];
  activeId?: string;
  onChanged: () => void;
  /** Open a recording in this tab instead of a new one. */
  openHere?: boolean;
}) {
  if (sessions.length === 0) {
    return (
      <Card className="px-3 py-6 text-center text-xs text-muted">
        No recordings yet. Press Start recording and talk while you use the page.
      </Card>
    );
  }
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {sessions.map((s) => (
        <SessionRow key={s.id} session={s} active={s.id === activeId} onChanged={onChanged} openHere={openHere} />
      ))}
    </Card>
  );
}

function SessionRow({
  session,
  active,
  onChanged,
  openHere,
}: {
  session: SessionListItem;
  active: boolean;
  onChanged: () => void;
  openHere?: boolean;
}) {
  const [busy, setBusy] = useState<'export' | 'delete'>();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: 'danger' | 'warn' }>();
  const live = active;
  const duration = session.durationMs ?? (session.endedAt ? session.endedAt - session.startedAt : undefined);

  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(id);
  }, [confirming]);

  const exportZip = async () => {
    setBusy('export');
    setNote(undefined);
    // Export can include transcription, so allow it a long time.
    const res = await tryBackground({ type: 'session/export', sessionId: session.id }, 10 * 60_000);
    setBusy(undefined);
    if (!res) setNote({ text: NO_ANSWER, tone: 'danger' });
    else if (!res.ok) setNote({ text: res.error ?? 'Download failed.', tone: 'danger' });
    else if (res.warning) setNote({ text: res.warning, tone: 'warn' });
  };

  const remove = async () => {
    setConfirming(false);
    setBusy('delete');
    const res = await tryBackground({ type: 'session/delete', sessionId: session.id });
    if (!res) setNote({ text: NO_ANSWER, tone: 'danger' });
    setBusy(undefined);
    onChanged();
  };

  const t = session.transcription;
  const tLabel = t ? TRANSCRIPTION[t.state].label(t) : '';
  const tTone = t ? TRANSCRIPTION[t.state].tone : undefined;
  // Row actions stay quiet until hover or keyboard focus; busy or confirming keeps them shown.
  const actionsShown = !!busy || confirming;
  return (
    <div className={cx('group px-3 py-2', live ? 'bg-recording-soft/60' : 'hover:bg-surface-muted')}>
      <div className="flex items-center gap-2">
        <button
          className="min-w-0 flex-1 cursor-pointer truncate rounded-control text-left font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-default disabled:no-underline"
          onClick={() => openReplay(session.id, openHere)}
          disabled={live}
          title={live ? 'Stop the recording to open it' : `Open in the viewer: ${session.url}`}
        >
          {session.title || shortUrl(session.url)}
        </button>
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
          <div
            className={cx(
              'flex shrink-0 items-center gap-0.5 transition-opacity',
              !actionsShown && 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
            )}
          >
            <IconButton label="Download bundle .zip" onClick={exportZip} disabled={!!busy || live}>
              {busy === 'export' ? <LoaderCircleIcon className="h-3.5 w-3.5 animate-spin" /> : <DownloadIcon className="h-3.5 w-3.5" />}
            </IconButton>
            <IconButton label="Delete" onClick={() => setConfirming(true)} disabled={!!busy || live} className="hover:text-danger">
              <Trash2Icon className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
        <span className="max-w-[45%] truncate" title={session.url}>
          {urlHost(session.url)}
        </span>
        <span>·</span>
        <span>{formatDate(session.startedAt)}</span>
        <span>·</span>
        {live ? (
          <span className="text-recording-strong">recording</span>
        ) : (
          <span className="tabular-nums">{duration != null ? formatDuration(duration) : '—'}</span>
        )}
        {session.tabs.length > 1 && <span>· {session.tabs.length} tabs</span>}
        {tLabel && (
          <span
            title={t?.error}
            className={cx(tTone === 'danger' ? 'text-danger' : tTone === 'warn' ? 'text-warn' : tTone === 'accent' && 'text-accent')}
          >
            · {tLabel}
          </span>
        )}
        {busy === 'export' && <span>· preparing download…</span>}
      </div>
      {/* Stored as recording but not the live session: the browser closed or crashed before Stop. */}
      {!live && session.status === 'recording' && <div className="mt-0.5 text-xs text-warn">Ended without Stop.</div>}
      {confirming && <div className="mt-1 text-xs text-danger">Delete this recording? This can't be undone.</div>}
      {note && <div className={cx('mt-1 text-xs', note.tone === 'danger' ? 'text-danger' : 'text-warn')}>{note.text}</div>}
    </div>
  );
}

const TRANSCRIPTION: Record<
  TranscriptionStatus['state'],
  { label: (t: TranscriptionStatus) => string; tone?: 'accent' | 'warn' | 'danger' }
> = {
  none: { label: () => '' },
  'no-key': { label: () => 'not transcribed: no API key', tone: 'warn' },
  pending: { label: (t) => `transcribing ${t.done}/${t.total}`, tone: 'accent' },
  transcribing: { label: (t) => `transcribing ${t.done}/${t.total}`, tone: 'accent' },
  done: { label: () => 'transcribed' },
  partial: { label: (t) => `transcribed ${t.done}/${t.total}`, tone: 'warn' },
  failed: { label: () => 'transcription failed', tone: 'danger' },
};

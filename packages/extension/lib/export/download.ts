// session/export: transcribe if possible, build the ZIP and download it.
import { browser } from 'wxt/browser';
import { getStatus } from '../capture/session';
import type { SessionId, TranscriptRow } from '@blook/core/types';
import { ensureTranscript } from '../transcribe/openrouter';
import { settingsItem } from '../settings';
import type { TranscriptStatus } from '@blook/core/transcript';
import { buildBundle } from './bundle';
import { getBySession } from '../db';

/** Service workers have no URL.createObjectURL, so the download uses a base64 data URL. */
function toDataUrl(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return `data:application/zip;base64,${btoa(bin)}`;
}

export async function exportSession(sessionId: SessionId): Promise<{ ok: boolean; error?: string }> {
  const status = getStatus();
  if (status.state !== 'idle' && status.session?.id === sessionId) {
    return { ok: false, error: 'Stop the recording before exporting it.' };
  }

  let transcript: TranscriptRow | undefined;
  let transcriptNote: string | undefined;
  let transcriptStatus: TranscriptStatus | undefined;
  try {
    transcript = await ensureTranscript(sessionId);
    if (!transcript) {
      if ((await settingsItem.getValue()).openRouterApiKey) {
        transcriptStatus = 'none';
        transcriptNote = 'no audio recorded';
      } else {
        transcriptStatus = (await getBySession('audioChunks', sessionId)).length ? 'skipped' : 'none';
        transcriptNote = transcriptStatus === 'skipped' ? 'skipped: no OpenRouter API key set' : 'no audio recorded';
      }
    }
  } catch (err) {
    transcriptStatus = 'failed';
    transcriptNote = `failed: ${String((err as Error)?.message ?? err)}`;
  }

  try {
    const { folder, zip } = await buildBundle(sessionId, { transcript, transcriptStatus, transcriptNote });
    await browser.downloads.download({
      url: toDataUrl(zip),
      filename: `${folder}.zip`,
      conflictAction: 'uniquify',
    });
    return {
      ok: true,
      error:
        transcriptStatus === 'failed'
          ? `Exported without transcript: ${transcriptNote}`
          : transcript?.errors?.length
            ? `Transcript is partial: ${transcript.errors[0]!.error}`
            : undefined,
    };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message ?? err) };
  }
}

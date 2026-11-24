// session/export: transcribe what's missing, build the ZIP and download it.
import { browser } from 'wxt/browser';
import { getStatus } from '../capture/session';
import type { SessionId } from '@blook/core/types';
import { ensureTranscript } from '../transcribe/openrouter';
import { buildBundle } from './bundle';

/** Service workers have no URL.createObjectURL, so the download is a data URL. */
function toDataUrl(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }));
  });
}

export async function exportSession(sessionId: SessionId): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const status = getStatus();
  if (status.state !== 'idle' && status.session?.id === sessionId) {
    return { ok: false, error: 'Stop the recording before exporting it.' };
  }
  try {
    await ensureTranscript(sessionId);
    const { folder, zip, transcript } = await buildBundle(sessionId);
    await browser.downloads.download({
      url: await toDataUrl(zip),
      filename: `${folder}.zip`,
      conflictAction: 'uniquify',
    });
    return {
      ok: true,
      warning:
        transcript.transcriptStatus === 'failed'
          ? `Exported without transcript: ${transcript.transcriptNote}`
          : transcript.transcript?.errors?.length
            ? `Transcript is partial: ${transcript.transcript.errors[0]!.error}`
            : undefined,
    };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message ?? err) };
  }
}

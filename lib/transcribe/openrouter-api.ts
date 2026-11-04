// The OpenRouter speech-to-text request, shared by the extension and `blook transcribe`:
// POST /api/v1/audio/transcriptions, verbose_json with word and segment timestamps.
import type { SttResult } from './transcript.ts';
import { TRANSCRIPTION_MODEL } from '../types.ts';

export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/audio/transcriptions';

/** Transcribes one audio file. Retries twice on network errors, 429 and 5xx with a growing pause. */
export async function openRouterTranscribe(
  audio: Blob,
  fileName: string,
  opts: { apiKey: string; endpoint?: string; model?: string },
): Promise<SttResult> {
  const form = new FormData();
  form.append('file', new File([audio], fileName, { type: audio.type.split(';')[0] }));
  form.append('model', opts.model ?? TRANSCRIPTION_MODEL);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt));
    let res: Response;
    try {
      res = await fetch(opts.endpoint ?? OPENROUTER_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.apiKey}`, 'X-Title': 'Blook' },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      lastError = new Error(`OpenRouter request failed: ${String((err as Error)?.message ?? err)}`);
      continue;
    }
    if (res.ok) {
      const text = await res.text();
      try {
        return JSON.parse(text) as SttResult;
      } catch {
        throw new Error(`OpenRouter returned non-JSON: ${text.slice(0, 200)}`);
      }
    }
    lastError = new Error(`OpenRouter ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
    if (res.status !== 429 && res.status < 500) break; // auth, bad model, bad audio: retrying won't help
  }
  throw lastError ?? new Error('OpenRouter request failed');
}

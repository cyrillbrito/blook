// Which HTTP bodies a recording keeps. The only place that decides; the extension's lib/capture/cdp.ts asks it.
// The rules are in docs/bundle-format.md (network.json), the why in docs/architecture.md (Key decisions).

export const BODY_MAX_BYTES = 1_000_000;

export type BodyDecision = { keep: true; maxBytes: number } | { keep: false; reason: string };

export interface BodyInput {
  direction: 'request' | 'response';
  /** CDP Network.ResourceType. */
  resourceType?: string;
  status?: number;
  mimeType?: string;
}

/** Types the app's own code requests: their bodies are the app's behaviour. */
const API_TYPES = new Set(['XHR', 'Fetch', 'EventSource']);
/** Types that carry an API-like body when they carry one at all. */
const MAYBE_API_TYPES = new Set(['Other', 'Ping', 'Preflight', 'CSPViolationReport', '']);
const ASSET_MIME = /^(image|font|audio|video)\//i;

export function bodyPolicy({ direction, resourceType = '', status, mimeType }: BodyInput): BodyDecision {
  const keep: BodyDecision = { keep: true, maxBytes: BODY_MAX_BYTES };
  if (direction === 'request' || API_TYPES.has(resourceType)) return keep;
  if (MAYBE_API_TYPES.has(resourceType)) {
    return ASSET_MIME.test(mimeType ?? '') ? { keep: false, reason: `static asset (${mimeType})` } : keep;
  }
  if (resourceType === 'Document') {
    return (status ?? 0) >= 400 ? keep : { keep: false, reason: 'page load (Document) that did not fail' };
  }
  return { keep: false, reason: `static resource (${resourceType})` };
}

/** Cuts a text body to maxBytes UTF-8 bytes. `size` is the original size. */
export function capText(text: string, maxBytes: number): { text: string; size: number; truncated: boolean } {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return { text, size: bytes.length, truncated: false };
  // A character split at the cut decodes to U+FFFD: drop it.
  const cut = new TextDecoder().decode(bytes.subarray(0, maxBytes)).replace(/\uFFFD$/, '');
  return { text: cut, size: bytes.length, truncated: true };
}

/** Cuts a base64 body to maxBytes decoded bytes, keeping it valid base64. */
export function capBase64(b64: string, maxBytes: number): { b64: string; size: number; truncated: boolean } {
  const size = base64Size(b64);
  if (size <= maxBytes) return { b64, size, truncated: false };
  return { b64: b64.slice(0, Math.floor(maxBytes / 3) * 4), size, truncated: true };
}

/** Decoded size of a base64 string, in bytes. */
export function base64Size(b64: string): number {
  return (b64.length / 4) * 3 - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
}

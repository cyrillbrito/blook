// Extension host of the viewer. Two ways in, both with "← Recordings" back to the Recordings page:
// - /replay.html?session=<id>: loads from IndexedDB, through the same bundle builder as Export,
//   so it shows exactly what the exported ZIP would hold. Offers "Download bundle".
// - /replay.html: the picker for a bundle .zip or folder ("Open bundle…" in the popup and the Recordings page).
import { buildBundle } from '@/lib/export/bundle';
import { bundleFromZip, ViewerApp, type Bundle, type ViewerAppProps } from '@blook/viewer';
import { NO_ANSWER, tryBackground } from '@/components/util';

const sessionId = new URLSearchParams(location.search).get('session') ?? '';
const back = { href: '/recordings.html', label: 'Recordings' };

async function loadFromDb(id: string): Promise<Bundle> {
  const { folder, zip } = await buildBundle(id);
  return bundleFromZip(zip, folder);
}

/** Same as the Recordings page's Download: transcribes if needed, then saves the ZIP. */
async function download(id: string) {
  const res = await tryBackground({ type: 'session/export', sessionId: id }, 10 * 60_000);
  if (!res) throw new Error(NO_ANSWER);
  if (!res.ok) throw new Error(res.error ?? 'Download failed.');
}

function props(): ViewerAppProps {
  if (!sessionId) return { back };
  return { back, initial: { label: `session ${sessionId}`, load: () => loadFromDb(sessionId) }, onDownload: () => download(sessionId) };
}

export default function App() {
  return <ViewerApp {...props()} />;
}

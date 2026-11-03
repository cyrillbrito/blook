// Extension host of the viewer. Three ways in:
// - /replay.html?session=<id>: loads from IndexedDB, through the same bundle builder as Export,
//   so it shows exactly what the exported ZIP would hold. Offers "Download bundle".
// - /replay.html?open=<id>: the side panel's "Open bundle…" hands over the picked file (components/handoff.ts).
// - /replay.html: the picker, like the standalone viewer.html.
import { buildBundle } from '@/lib/export/bundle';
import { storedTranscriptOptions } from '@/lib/transcribe/openrouter';
import { bundleFromUserFiles, bundleFromZip, type Bundle } from '@/components/viewer/bundle';
import { ViewerApp, type ViewerAppProps } from '@/components/viewer/ViewerApp';
import { claimFile } from '@/components/handoff';
import { tryBackground } from '@/components/util';

const params = new URLSearchParams(location.search);
const sessionId = params.get('session') ?? '';
const openId = params.get('open') ?? '';

async function loadFromDb(id: string): Promise<Bundle> {
  const { folder, zip } = await buildBundle(id, await storedTranscriptOptions(id));
  return bundleFromZip(zip, folder);
}

/** Same as the panel's Download: transcribes if needed, then saves the ZIP. */
async function download(id: string) {
  const res = await tryBackground({ type: 'session/export', sessionId: id }, 10 * 60_000);
  if (!res) throw new Error('The background worker did not answer.');
  if (res.error) throw new Error(res.error);
}

function props(): ViewerAppProps {
  if (sessionId) {
    return { initial: { label: `session ${sessionId}`, load: () => loadFromDb(sessionId) }, onDownload: () => download(sessionId) };
  }
  if (openId) {
    return {
      initial: {
        label: 'bundle',
        load: async () => {
          const file = await claimFile(openId);
          return file && bundleFromUserFiles([{ file, path: file.name }]);
        },
      },
    };
  }
  return {};
}

export default function App() {
  return <ViewerApp {...props()} />;
}

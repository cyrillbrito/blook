// Extension host of the viewer: /replay.html?session=<id> loads from IndexedDB, through the same
// bundle builder as Export, so it shows exactly what the exported ZIP would hold.
// Without ?session it's the drop zone, like the standalone viewer.html.
import { buildBundle } from '@/lib/export/bundle';
import { storedTranscriptOptions } from '@/lib/transcribe/openrouter';
import { bundleFromZip, type Bundle } from '@/components/viewer/bundle';
import { ViewerApp } from '@/components/viewer/ViewerApp';

const sessionId = new URLSearchParams(location.search).get('session') ?? '';

async function loadFromDb(id: string): Promise<Bundle> {
  // Transcription runs per chunk in the background; this reads what's stored and its status.
  const { folder, zip } = await buildBundle(id, await storedTranscriptOptions(id));
  return bundleFromZip(zip, folder);
}

export default function App() {
  return <ViewerApp initial={sessionId ? { label: `session ${sessionId}`, load: () => loadFromDb(sessionId) } : undefined} />;
}

// The viewer with its loading states. It shows one replay: hosts pass an optional initial loader
// (IndexedDB or a file handed over by the side panel). Only while nothing is loaded can the user
// drop or pick a bundle .zip or unzipped folder; once a bundle is open there are no load-other controls.
import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { FolderOpenIcon, SpinnerIcon } from '@/components/ui/icons';
import { bundleFromUserFiles, filesFromDrop, filesFromInput, type Bundle } from './bundle';
import { Viewer } from './Viewer';

type State =
  | { state: 'empty' }
  | { state: 'loading'; what: string }
  | { state: 'error'; message: string }
  | { state: 'ready'; bundle: Bundle };

export interface ViewerAppProps {
  /** Loads the bundle on start. Resolving to undefined falls back to the picker. */
  initial?: { label: string; load: () => Promise<Bundle | undefined> };
  /** Shows "Download bundle" in the viewer header. */
  onDownload?: () => Promise<void>;
}

export function ViewerApp({ initial, onDownload }: ViewerAppProps) {
  const [s, setS] = useState<State>(initial ? { state: 'loading', what: initial.label } : { state: 'empty' });
  const [dragging, setDragging] = useState(false);
  const zipInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);
  const ready = s.state === 'ready';

  const run = (what: string, load: () => Promise<Bundle | undefined>) => {
    setS({ state: 'loading', what });
    // Let the loading state paint before unzipping blocks the thread.
    setTimeout(() => {
      load()
        .then((bundle) => {
          if (!bundle) return setS({ state: 'empty' });
          document.title = `${bundle.session.title || bundle.name} · Blook`;
          setS({ state: 'ready', bundle });
        })
        .catch((e) => setS({ state: 'error', message: String((e as Error)?.message ?? e) }));
    }, 20);
  };

  useEffect(() => {
    if (initial) run(initial.label, initial.load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drop anywhere, until a bundle is open.
  useEffect(() => {
    if (ready) return;
    let depth = 0;
    const isFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!isFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => isFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = filesFromDrop(e.dataTransfer!);
      run('dropped bundle', async () => bundleFromUserFiles(await files));
    };
    addEventListener('dragenter', enter);
    addEventListener('dragleave', leave);
    addEventListener('dragover', over);
    addEventListener('drop', drop);
    return () => {
      removeEventListener('dragenter', enter);
      removeEventListener('dragleave', leave);
      removeEventListener('dragover', over);
      removeEventListener('drop', drop);
    };
  }, [ready]);

  if (ready) return <Viewer bundle={s.bundle} onDownload={onDownload} />;

  const pick = (list: FileList | null) => {
    if (!list?.length) return;
    const items = filesFromInput(list);
    run(items.length === 1 ? items[0]!.file.name : 'folder', () => bundleFromUserFiles(items));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted p-6 text-sm text-fg">
      <input ref={zipInput} type="file" accept=".zip,application/zip" hidden onChange={(e) => pick(e.target.files)} />
      <input
        ref={dirInput}
        type="file"
        hidden
        // Non-standard but supported by Chrome: pick a whole folder.
        {...({ webkitdirectory: '' } as object)}
        onChange={(e) => pick(e.target.files)}
      />
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/10 ring-4 ring-accent ring-inset">
          <span className="rounded-control bg-surface px-4 py-2 text-sm font-medium shadow">Drop the bundle .zip or folder</span>
        </div>
      )}
      <Card className="w-full max-w-md space-y-4 p-6 shadow-sm">
        <h1 className="text-base font-semibold">Blook viewer</h1>
        {s.state === 'loading' ? (
          <p className="flex items-center gap-2 text-muted">
            <SpinnerIcon /> Loading {s.what}…
          </p>
        ) : (
          <>
            {s.state === 'error' && <p className="rounded-control bg-danger-soft p-2 text-red-800">{s.message}</p>}
            <button
              type="button"
              className="flex w-full cursor-pointer flex-col items-center gap-1 rounded-card border-2 border-dashed border-line-strong p-8 text-muted hover:border-accent hover:bg-accent-soft/50"
              onClick={() => zipInput.current?.click()}
            >
              <FolderOpenIcon className="h-6 w-6" />
              <span className="text-fg">Drop a Blook bundle here</span>
              <span className="text-xs">a .zip, or the unzipped folder</span>
            </button>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => zipInput.current?.click()}>
                Choose .zip…
              </Button>
              <Button onClick={() => dirInput.current?.click()}>Choose folder…</Button>
            </div>
            <p className="text-xs text-muted">Everything stays in this browser tab. Nothing is uploaded.</p>
          </>
        )}
      </Card>
    </div>
  );
}

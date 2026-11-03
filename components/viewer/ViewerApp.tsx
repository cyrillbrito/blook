// The viewer with its loading states. Hosts pass an optional initial loader (IndexedDB in the
// extension); the user can always drop or pick a bundle .zip or unzipped folder.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { bundleFromUserFiles, filesFromDrop, filesFromInput, type Bundle } from './bundle';
import { Viewer } from './Viewer';

type State =
  | { state: 'empty' }
  | { state: 'loading'; what: string }
  | { state: 'error'; message: string }
  | { state: 'ready'; bundle: Bundle };

export function ViewerApp({ initial, footer }: { initial?: { label: string; load: () => Promise<Bundle> }; footer?: ReactNode }) {
  const [s, setS] = useState<State>(initial ? { state: 'loading', what: initial.label } : { state: 'empty' });
  const [dragging, setDragging] = useState(false);
  const zipInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);

  const run = (what: string, load: () => Promise<Bundle>) => {
    setS({ state: 'loading', what });
    // Let the loading state paint before unzipping blocks the thread.
    setTimeout(() => {
      load()
        .then((bundle) => {
          document.title = `${bundle.session.title || bundle.name} · Overseer`;
          setS({ state: 'ready', bundle });
        })
        .catch((e) => setS({ state: 'error', message: String((e as Error)?.message ?? e) }));
    }, 20);
  };

  useEffect(() => {
    if (initial) run(initial.label, initial.load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drop anywhere, at any time.
  useEffect(() => {
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
      const dt = e.dataTransfer!;
      const files = filesFromDrop(dt);
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
  }, []);

  const pick = (list: FileList | null) => {
    if (!list?.length) return;
    const items = filesFromInput(list);
    run(items.length === 1 ? items[0]!.file.name : 'folder', () => bundleFromUserFiles(items));
  };

  const inputs = (
    <>
      <input ref={zipInput} type="file" accept=".zip,application/zip" hidden onChange={(e) => pick(e.target.files)} />
      <input
        ref={dirInput}
        type="file"
        hidden
        // Non-standard but supported by Chrome: pick a whole folder.
        {...({ webkitdirectory: '' } as object)}
        onChange={(e) => pick(e.target.files)}
      />
    </>
  );

  const overlay = dragging && (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-blue-600/15 ring-4 ring-blue-500 ring-inset">
      <span className="rounded bg-white px-4 py-2 text-sm font-medium shadow">Drop the bundle .zip or folder</span>
    </div>
  );

  if (s.state === 'ready') {
    return (
      <>
        {inputs}
        {overlay}
        <Viewer bundle={s.bundle} onOpen={() => zipInput.current?.click()} />
      </>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 text-sm text-gray-800">
      {inputs}
      {overlay}
      <div className="w-full max-w-md space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-base font-semibold">Overseer viewer</h1>
        {s.state === 'loading' && <p className="text-gray-600">Loading {s.what}…</p>}
        {s.state === 'error' && <p className="rounded bg-red-50 p-2 text-red-800">{s.message}</p>}
        {s.state !== 'loading' && (
          <>
            <div
              className="cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-8 text-center text-gray-500 hover:border-blue-400 hover:bg-blue-50/40"
              onClick={() => zipInput.current?.click()}
            >
              Drop an Overseer bundle here
              <div className="mt-1 text-xs">a .zip, or the unzipped folder</div>
            </div>
            <div className="flex gap-2">
              <button className="rounded bg-gray-800 px-3 py-1 text-white hover:bg-gray-700" onClick={() => zipInput.current?.click()}>
                Choose .zip…
              </button>
              <button className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-100" onClick={() => dirInput.current?.click()}>
                Choose folder…
              </button>
            </div>
            <p className="text-xs text-gray-500">Everything stays in this browser tab. Nothing is uploaded.</p>
          </>
        )}
        {footer}
      </div>
    </div>
  );
}

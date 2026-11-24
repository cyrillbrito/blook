import { storage } from '#imports';
import type { Settings } from '@blook/core/types';
import type { PillPosition } from './messages';

export const DEFAULT_SETTINGS: Settings = {
  mask: false,
  mic: true,
  canvas: false,
  openRouterApiKey: '',
};

/** Where the recording pill was dragged to. Null: bottom center. Only the background uses it, for the pill. */
export const pillPositionItem = storage.defineItem<PillPosition | null>('local:pillPosition', {
  fallback: null,
});

/** Settings live in browser.storage.local, which the background closes to content scripts. Read them with getSettings. */
const settingsItem = storage.defineItem<Partial<Settings>>('local:settings', { fallback: {} });

/** Stored settings over the defaults, so a setting added later has its default for existing users. */
const withDefaults = (stored: Partial<Settings> | null): Settings => ({ ...DEFAULT_SETTINGS, ...stored });

export async function getSettings(): Promise<Settings> {
  return withDefaults(await settingsItem.getValue());
}

let updating: Promise<unknown> = Promise.resolve();

/** Saves a change. Updates run one after another, so quick changes from any page don't overwrite each other. */
export function updateSettings(patch: Partial<Settings>): Promise<void> {
  const run = async () => settingsItem.setValue({ ...(await getSettings()), ...patch });
  const p = updating.then(run, run);
  updating = p;
  return p;
}

/** Calls `fn` with the settings whenever they change in any context. Returns the unwatch function. */
export function watchSettings(fn: (settings: Settings) => void): () => void {
  return settingsItem.watch((value) => fn(withDefaults(value)));
}

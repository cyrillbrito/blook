import { storage } from '#imports';
import { DEFAULT_SETTINGS, type Settings } from './types';

/** Settings live in browser.storage.local, readable from every extension context. */
export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

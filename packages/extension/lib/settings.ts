import { storage } from '#imports';
import type { Settings } from '@blook/core/types';

export const DEFAULT_SETTINGS: Settings = {
  mask: false,
  mic: true,
  canvas: false,
  openRouterApiKey: '',
};

/** Settings live in browser.storage.local, readable from every extension context. */
export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

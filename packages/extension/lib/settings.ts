import { storage } from '#imports';
import type { Settings } from '@blook/core/types';

export const DEFAULT_SETTINGS: Settings = {
  mask: false,
  mic: true,
  canvas: false,
  openRouterApiKey: '',
};

/** Where the recording pill was dragged to (left and top, in CSS pixels). Null: the bottom-left corner. */
export const pillPositionItem = storage.defineItem<{ x: number; y: number } | null>('local:pillPosition', {
  fallback: null,
});

/** Settings live in browser.storage.local, readable from every extension context. */
export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

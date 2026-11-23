import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import root from '../../package.json' with { type: 'json' };

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
    // Scan only the pages for deps to pre-bundle.
    optimizeDeps: { entries: ['entrypoints/**/*.html'] },
  }),
  zip: { artifactTemplate: 'blook-chrome.zip' },
  manifest: {
    name: 'Blook',
    // One version for the product, in the root package.json.
    version: root.version,
    description:
      'Record your browser while you talk: page replay, network, console and your voice in one local ZIP for developers and coding agents.',
    permissions: ['debugger', 'storage', 'offscreen', 'scripting', 'unlimitedStorage', 'downloads'],
    host_permissions: ['<all_urls>'],
    // runtime.getContexts (lib/capture/offscreen.ts) needs Chrome 116.
    minimum_chrome_version: '116',
    // The popup (entrypoints/popup) is added by WXT as action.default_popup.
    action: { default_title: 'Blook' },
    commands: {
      'toggle-recording': {
        suggested_key: { default: 'Alt+Shift+R' },
        description: 'Start or stop recording the active tab',
      },
    },
  },
});

import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

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
    description: 'Record a narrated browser session into a local bundle for coding agents',
    permissions: ['sidePanel', 'debugger', 'storage', 'offscreen', 'scripting', 'unlimitedStorage', 'downloads'],
    host_permissions: ['<all_urls>'],
    // sidePanel.setPanelBehavior needs Chrome 116.
    minimum_chrome_version: '116',
    action: { default_title: 'Blook' },
  },
});

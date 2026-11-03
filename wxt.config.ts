import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
    // Keep Vite away from the cloned code in references/.
    optimizeDeps: { entries: ['entrypoints/**/*.html'] },
    server: { watch: { ignored: ['**/references/**'] } },
  }),
  manifest: {
    name: 'Blook',
    description: 'Record a narrated browser session into a local bundle for coding agents',
    permissions: [
      'sidePanel',
      'debugger',
      'storage',
      'offscreen',
      'tabs',
      'scripting',
      'unlimitedStorage',
      'downloads',
    ],
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Blook' },
  },
});

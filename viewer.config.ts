// Standalone viewer: one self-contained dist/viewer.html that opens from disk (file://)
// and loads a dropped bundle. Build with `bun run build:viewer`.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const root = decodeURIComponent(new URL('.', import.meta.url).pathname);

export default defineConfig({
  root: `${root}components/viewer/standalone`,
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: { alias: { '@': root.replace(/\/$/, '') } },
  build: {
    outDir: `${root}dist`,
    emptyOutDir: true,
    rollupOptions: { input: `${root}components/viewer/standalone/viewer.html` },
  },
});

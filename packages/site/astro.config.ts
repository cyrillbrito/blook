import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Static site on GitHub Pages: https://cyrillbrito.github.io/blook/ (.github/workflows/site.yml).
export default defineConfig({
  site: 'https://cyrillbrito.github.io',
  base: '/blook',
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});

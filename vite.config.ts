import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from any sub-folder / static host.
  base: './',
  server: {
    port: 8080,
    open: true,
  },
  build: {
    target: 'es2022',
    // Phaser alone is ~1.2 MB minified; don't warn about it.
    chunkSizeWarningLimit: 2000,
  },
});

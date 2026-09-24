import { defineConfig } from 'vite';

// Set by the Tauri CLI when it runs `beforeDevCommand` / `beforeBuildCommand`.
const tauri = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  // Relative asset paths so the build works from any sub-folder / static host.
  base: './',
  // Keep the Rust compiler output visible when running under `tauri dev`.
  clearScreen: false,
  server: {
    port: 8080,
    // Tauri loads the fixed devUrl, so fail instead of silently moving ports.
    strictPort: true,
    // The desktop window replaces the browser tab.
    open: !tauri,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: 'es2022',
    // Phaser alone is ~1.2 MB minified; don't warn about it.
    chunkSizeWarningLimit: 2000,
  },
});

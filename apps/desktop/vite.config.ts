import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  // Concurrent test and user servers must not overwrite each other's optimized modules.
  cacheDir: fileURLToPath(
    new URL(
      mode === 'e2e-header'
        ? '../../.test-artifacts/vite-header-cache'
        : mode === 'e2e'
          ? '../../.test-artifacts/vite-e2e-cache'
          : '../../node_modules/.vite',
      import.meta.url,
    ),
  ),
  // Discover lazy renderer dependencies before editing starts. Vite's late optimizer
  // otherwise reloads the page on first path-tracer use and discards an unsaved document.
  optimizeDeps: {
    include: ['three/webgpu', 'three-gpu-pathtracer', 'three-gpu-pathtracer/webgpu'],
  },
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1',
    hmr: mode === 'e2e' ? false : undefined,
    watch: mode === 'e2e' ? null : { ignored: ['**/src-tauri/**', '**/.agents/**'] },
  },
  build: { outDir: 'dist', emptyOutDir: true },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
}));

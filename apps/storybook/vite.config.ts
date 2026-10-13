import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Test and user previews own separate optimized modules and cannot reload one another's drafts.
  cacheDir: fileURLToPath(
    new URL(
      process.env.BUILDING_STORYBOOK_E2E === '1'
        ? '../../.test-artifacts/vite-storybook-cache'
        : '../../node_modules/.vite-storybook',
      import.meta.url,
    ),
  ),
  server: { host: '127.0.0.1', port: 6006, strictPort: true },
});

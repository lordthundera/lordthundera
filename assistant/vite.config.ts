import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The preview host (https://<port>-<sandbox>.e2b.app) must be allowed, otherwise
// Vite's dev-server host check rejects the request.
export default defineConfig({
  plugins: [react()],
  // relative asset URLs → the built app works from any subfolder (GitHub Pages,
  // a ZIP dropped on any static host, file:// for a quick look) without reconfiguring
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: ['.e2b.app', 'localhost'],
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: ['.e2b.app', 'localhost'],
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  // `npm run dev -- --open` on a headless box would hang; keep the config simple.
});

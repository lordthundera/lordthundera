import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The preview host (https://<port>-<sandbox>.e2b.app) must be allowed, otherwise
// Vite's dev-server host check rejects the request.
export default defineConfig({
  plugins: [react()],
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
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: Vite serves React on 5173, proxies /api/* to the Express dev server on 3001.
// Prod: Vercel serves React static + each api/* file as a serverless function.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

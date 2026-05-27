import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: Vite serves React on 5173, proxies /api/* to the Express dev server on 3001.
// Prod: server.js serves built dist/ + /api/* + /uploads/*.
export default defineConfig({
  plugins: [
    react(),
    // The static boarding-pass landing lives in public/landing.html. We want it
    // served at "/" in dev too, instead of Vite's index.html (the React app).
    // Rewrite at the middleware layer so Vite's static handler serves it directly.
    {
      name: 'pb-serve-landing-at-root',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/' || req.url === '/index.html') {
            req.url = '/landing.html';
          }
          next();
        });
      },
    },
  ],
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

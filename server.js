// r/PassportBros server. Single Express app for both dev and prod.
//   Dev: Vite runs separately on :5173 and proxies /api → here on :3001.
//   Prod: this serves the built dist/ as static + /api/* + /uploads/*.
//
// Run:  npm start  (or  npm run dev  to run alongside Vite)

import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { UPLOADS_ROOT } from './api/_lib/storage.js';

import groupsCreate     from './api/groups.js';
import groupGet         from './api/groups/[id].js';
import membersCreate    from './api/groups/[id]/members.js';
import groupData        from './api/groups/[id]/data.js';
import uploadsHandler   from './api/groups/[id]/uploads.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);

const app = express();
app.disable('x-powered-by');

// JSON parser for non-upload routes — 1MB plenty for our tiny payloads.
app.use(express.json({ limit: '1mb' }));

// Multer for the upload route only — diskStorage so big videos don't sit in RAM.
const tmpDir = path.join(UPLOADS_ROOT, '.tmp');
fs.mkdirSync(tmpDir, { recursive: true });
const upload = multer({
  dest: tmpDir,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

// Adapter — Vercel-style handlers expect path params on req.query.
function adapt(handler, paramKeys = []) {
  return async (req, res) => {
    req.query = { ...req.query };
    for (const k of paramKeys) req.query[k] = req.params[k];
    try {
      await handler(req, res);
    } catch (e) {
      console.error('handler error:', e);
      if (!res.headersSent) res.status(500).json({ error: 'internal error' });
    }
  };
}

// ─── API routes ────────────────────────────────────────────────────────
app.post('/api/groups',                       adapt(groupsCreate));
app.get( '/api/groups/:id',                   adapt(groupGet,      ['id']));
app.post('/api/groups/:id/members',           adapt(membersCreate, ['id']));
app.get( '/api/groups/:id/data',              adapt(groupData,     ['id']));
app.post('/api/groups/:id/uploads',           upload.single('file'), adapt(uploadsHandler, ['id']));
app.delete('/api/groups/:id/uploads',         adapt(uploadsHandler, ['id']));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ─── Static: /uploads (always) and dist/ (if built) ────────────────────
app.use('/uploads', express.static(UPLOADS_ROOT, {
  immutable: true, maxAge: '30d', // file paths include a timestamp so they're effectively immutable
}));

const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false }));
  // SPA fallback — any non-/api, non-/uploads request returns index.html.
  app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ─── Multer error handler ──────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'file exceeds 500 MB' });
  }
  console.error('unhandled:', err);
  if (!res.headersSent) res.status(500).json({ error: 'internal error' });
});

app.listen(PORT, () => {
  const mode = fs.existsSync(distDir) ? 'production (serving dist/)' : 'api-only (run vite separately)';
  console.log(`\n  r/PassportBros · ${mode}`);
  console.log(`  → http://localhost:${PORT}\n`);
});

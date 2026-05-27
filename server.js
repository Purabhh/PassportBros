// r/PassportBros server. Single Express app for both dev and prod.
//   Dev: Vite runs separately on :5173 and proxies /api → here on :3001.
//   Prod: this serves the built dist/ as static + /api/* + /uploads/*.
//
// Run:  npm start  (or  npm run dev  to run alongside Vite)

import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
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
// Use API_PORT (not PORT) so the dev API doesn't collide with Vite's PORT
// (which is read by `vite` and by some dev tooling that injects PORT into env).
const PORT = Number(process.env.API_PORT || 3001);

const app = express();
app.disable('x-powered-by');

// In production we sit behind nginx on the same droplet. Without trust proxy
// express thinks every request originates from 127.0.0.1, which would collapse
// our rate-limit buckets into one. Trust exactly one hop (our local nginx).
app.set('trust proxy', 1);

// JSON parser for non-upload routes — 1MB plenty for our tiny payloads.
app.use(express.json({ limit: '1mb' }));

// Multer for the upload route only — diskStorage so big videos don't sit in RAM.
const tmpDir = path.join(UPLOADS_ROOT, '.tmp');
fs.mkdirSync(tmpDir, { recursive: true });
const upload = multer({
  dest: tmpDir,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

// ─── Rate limiters ─────────────────────────────────────────────────────
//
// Group creation: 5/day per (IP + device-ID) so a single device on a single
// network can't spawn endless scrapbooks. Friends behind the same NAT each
// get their own bucket because they have different device-IDs. Frontend
// generates the device-ID once per browser and persists it in localStorage.
const groupCreateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const deviceId = String(req.headers['x-device-id'] || 'anon').slice(0, 80);
    return `gc:${req.ip}:${deviceId}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      error: 'too many scrapbooks made from this device today — try again tomorrow',
    });
  },
});

// Uploads: 100/hour per member token. A group of 5 friends each uploading
// at full tilt gets 500 uploads/hour shared — way more than realistic.
// The token-based key is correct even across group switches because each
// group issues its own token, and uploads are billed to the group anyway.
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const auth = String(req.headers.authorization || '');
    const tok = auth.startsWith('Bearer ') ? auth.slice(7, 7 + 64) : `noauth:${req.ip}`;
    return `up:${tok}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      error: 'too many uploads this hour — give it a few minutes',
    });
  },
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
// Rate-limited routes run their limiter BEFORE the body parser / multer so a
// rejected request doesn't write a 500 MB upload to disk before being denied.
app.post('/api/groups',                       groupCreateLimiter, adapt(groupsCreate));
app.get( '/api/groups/:id',                   adapt(groupGet,      ['id']));
app.post('/api/groups/:id/members',           adapt(membersCreate, ['id']));
app.get( '/api/groups/:id/data',              adapt(groupData,     ['id']));
app.post('/api/groups/:id/uploads',           uploadLimiter, upload.single('file'), adapt(uploadsHandler, ['id']));
app.delete('/api/groups/:id/uploads',         adapt(uploadsHandler, ['id']));
app.patch('/api/groups/:id/uploads',          adapt(uploadsHandler, ['id']));

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
  // The boarding-pass landing is the homepage; /g/:id and other paths fall
  // through to the React SPA. Both files ship in dist/ (Vite copies public/).
  app.get('/', (_req, res) => {
    res.sendFile(path.join(distDir, 'landing.html'));
  });
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

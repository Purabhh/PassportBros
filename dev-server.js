// Local dev API server. Mounts every Vercel handler under api/ at its
// matching Express route. In production, Vercel runs the same files as
// serverless functions and this shim isn't used.
//
// Run: `npm run dev` (concurrently with vite)

import 'dotenv/config';
import express from 'express';

// Each handler is the file's default export — same signature as Vercel.
import groupsCreate     from './api/groups.js';
import groupGet         from './api/groups/[id].js';
import membersCreate    from './api/groups/[id]/members.js';
import groupData        from './api/groups/[id]/data.js';
import uploadsSign      from './api/groups/[id]/uploads/sign.js';
import uploadsHandler   from './api/groups/[id]/uploads.js';

const PORT = Number(process.env.PORT || 3001);

const app = express();
app.use(express.json({ limit: '1mb' }));

// Adapter — Vercel exposes path params on req.query; Express puts them on
// req.params. Copy them over so handlers don't need to know which is which.
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

app.post('/api/groups',                            adapt(groupsCreate));
app.get( '/api/groups/:id',                        adapt(groupGet,        ['id']));
app.post('/api/groups/:id/members',                adapt(membersCreate,   ['id']));
app.get( '/api/groups/:id/data',                   adapt(groupData,       ['id']));
app.post('/api/groups/:id/uploads/sign',           adapt(uploadsSign,     ['id']));
app.post('/api/groups/:id/uploads',                adapt(uploadsHandler,  ['id']));
app.delete('/api/groups/:id/uploads',              adapt(uploadsHandler,  ['id']));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    db: !!process.env.DATABASE_URL,
    r2: !!(process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET),
  });
});

app.listen(PORT, () => {
  console.log(`\n  r/PassportBros dev api  →  http://localhost:${PORT}`);
  console.log(`  vite dev (separate)     →  http://localhost:5173\n`);
});

// Neon serverless Postgres connection. Used by every API handler.
// In dev, the .env is loaded by dotenv (see dev-server.js).
// In production on Vercel, env vars come from the Vercel dashboard.

import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  // Don't crash at import — only when a query is actually attempted, so
  // unrelated endpoints (e.g. /api/health) could still respond.
  console.warn('DATABASE_URL is not set; database queries will fail');
}

export const sql = process.env.DATABASE_URL
  ? neon(process.env.DATABASE_URL)
  : (() => {
      throw new Error('DATABASE_URL is not configured');
    });

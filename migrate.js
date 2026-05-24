// Run all SQL files in migrations/ against DATABASE_URL.
// Idempotent — every migration uses CREATE TABLE IF NOT EXISTS etc.
//
// Usage: `npm run migrate`

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const dir = path.join(__dirname, 'migrations');
const files = (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort();

for (const file of files) {
  const body = await fs.readFile(path.join(dir, file), 'utf8');
  console.log(`→ ${file}`);
  // Neon's HTTP driver doesn't support multi-statement strings; split on ; that
  // are followed by a newline (rough but good enough for our hand-written SQL).
  const stmts = body
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));
  for (const stmt of stmts) {
    await sql.query(stmt);
  }
}

console.log('\n✓ migrations complete');

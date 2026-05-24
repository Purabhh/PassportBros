// Run all SQL files in migrations/ against the SQLite database.
// Idempotent — every migration uses CREATE TABLE IF NOT EXISTS etc.

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './api/_lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'migrations');
const files = (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort();

for (const file of files) {
  const body = await fs.readFile(path.join(dir, file), 'utf8');
  console.log(`→ ${file}`);
  db.exec(body);
}

console.log('\n✓ migrations complete');
db.close();

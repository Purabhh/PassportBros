// Run SQL files in migrations/ against the SQLite database.
// Tracks applied version in PRAGMA user_version (a built-in 32-bit int),
// so each file runs at most once even when its statements aren't idempotent.
//
// Filename convention: NNN-name.sql where NNN is the migration number.

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './api/_lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'migrations');

const currentVersion = db.pragma('user_version', { simple: true });
const files = (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort();

let ran = 0;
for (const file of files) {
  const m = /^(\d+)/.exec(file);
  if (!m) { console.warn(`skip (no version prefix): ${file}`); continue; }
  const version = Number(m[1]);
  if (version <= currentVersion) {
    console.log(`✓ ${file} (already applied)`);
    continue;
  }
  const body = await fs.readFile(path.join(dir, file), 'utf8');
  console.log(`→ ${file}`);
  db.exec(body);
  db.pragma(`user_version = ${version}`);
  ran++;
}

console.log(`\n✓ migrations complete (${ran} applied, db at version ${db.pragma('user_version', { simple: true })})`);
db.close();

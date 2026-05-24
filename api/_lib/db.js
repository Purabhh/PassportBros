// SQLite-backed db. Exposes a `sql` tagged template literal that mirrors
// the Neon serverless API so handlers can use the same syntax either way:
//
//   const rows = await sql`SELECT * FROM groups WHERE id = ${id}`;
//
// For SELECT (or queries with RETURNING) it returns an array of row objects.
// For other writes it returns an empty array.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'passportbros.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const stmtCache = new Map();
function prep(query) {
  let s = stmtCache.get(query);
  if (!s) { s = db.prepare(query); stmtCache.set(query, s); }
  return s;
}

export async function sql(strings, ...values) {
  // Build "SELECT ... ? ... ?" from the tagged template
  const query = strings.join('?');
  const stmt = prep(query);
  const isRead = /^\s*(SELECT|WITH)\b/i.test(query) || /\bRETURNING\b/i.test(query);
  if (isRead) return stmt.all(...values);
  stmt.run(...values);
  return [];
}

// Convenience: detect a UNIQUE constraint violation (cross-engine helper).
export function isUniqueViolation(err) {
  return err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || err?.code === '23505';
}

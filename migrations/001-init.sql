-- r/PassportBros schema (SQLite). Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS groups (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id      TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  member_token  TEXT NOT NULL UNIQUE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS members_group_idx ON members(group_id);

CREATE TABLE IF NOT EXISTS uploads (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id           TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  member_id          INTEGER REFERENCES members(id) ON DELETE SET NULL,
  country_code       TEXT NOT NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
  r2_key             TEXT NOT NULL UNIQUE,
  original_filename  TEXT NOT NULL,
  content_type       TEXT NOT NULL,
  size_bytes         INTEGER NOT NULL,
  duration_sec       INTEGER,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS uploads_group_country_idx
  ON uploads(group_id, country_code, created_at DESC);
CREATE INDEX IF NOT EXISTS uploads_group_idx
  ON uploads(group_id, created_at DESC);

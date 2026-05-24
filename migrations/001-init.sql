-- r/PassportBros schema. Idempotent: safe to run on a fresh or existing db.

CREATE TABLE IF NOT EXISTS groups (
  id           TEXT PRIMARY KEY,                       -- e.g. "xY8nQ3kP42aBc7HmK5jL2"
  name         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS members (
  id            SERIAL PRIMARY KEY,
  group_id      TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  member_token  TEXT NOT NULL UNIQUE,                  -- nanoid(32), stored in browser
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS members_group_idx ON members(group_id);

CREATE TABLE IF NOT EXISTS uploads (
  id                 SERIAL PRIMARY KEY,
  group_id           TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  member_id          INTEGER REFERENCES members(id) ON DELETE SET NULL,
  country_code       TEXT NOT NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
  r2_key             TEXT NOT NULL UNIQUE,
  original_filename  TEXT NOT NULL,
  content_type       TEXT NOT NULL,
  size_bytes         BIGINT NOT NULL,
  duration_sec       INTEGER,                          -- null for photos
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS uploads_group_country_idx
  ON uploads(group_id, country_code, created_at DESC);
CREATE INDEX IF NOT EXISTS uploads_group_idx
  ON uploads(group_id, created_at DESC);

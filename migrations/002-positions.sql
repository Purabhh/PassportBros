-- Per-(group, country) ordering for uploads. Lower position = earlier in
-- the gallery; position 0 becomes the country's cover image.

ALTER TABLE uploads ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows: oldest within each (group, country) gets 0.
WITH ordered AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY group_id, country_code
           ORDER BY created_at ASC, id ASC
         ) - 1 AS new_pos
    FROM uploads
)
UPDATE uploads
   SET position = (SELECT new_pos FROM ordered WHERE ordered.id = uploads.id);

CREATE INDEX IF NOT EXISTS uploads_group_country_position_idx
  ON uploads(group_id, country_code, position);

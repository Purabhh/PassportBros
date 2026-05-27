// GET /api/groups/[id]/data - everything the SPA needs to render a group:
// the country list (with photo counts), all uploads grouped by country,
// the current member's name, and the group's basic info.
//
// One round-trip on page load = snappier UX.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '../../_lib/db.js';
import { requireMember } from '../../_lib/auth.js';
import { methodOk } from '../../_lib/json.js';
import { publicUrlFor } from '../../_lib/storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const countriesFile = path.join(__dirname, '..', '..', '..', 'countries.json');

let _countriesCache = null;
async function loadCountries() {
  if (_countriesCache) return _countriesCache;
  const raw = await fs.readFile(countriesFile, 'utf8');
  _countriesCache = JSON.parse(raw);
  return _countriesCache;
}

export default async function handler(req, res) {
  if (!methodOk(req, res, ['GET'])) return;
  const groupId = String(req.query?.id || '').trim();
  if (!groupId) return res.status(400).json({ error: 'missing id' });

  const auth = await requireMember(req, res, groupId);
  if (!auth) return;

  const [countries, uploadRows, memberRows] = await Promise.all([
    loadCountries(),
    sql`
      SELECT u.id, u.country_code, u.kind, u.r2_key, u.original_filename,
             u.content_type, u.size_bytes, u.duration_sec, u.position, u.created_at,
             m.id AS member_id, m.display_name AS member_name
        FROM uploads u
        LEFT JOIN members m ON m.id = u.member_id
       WHERE u.group_id = ${groupId}
       ORDER BY u.country_code ASC, u.position ASC, u.created_at ASC
    `,
    sql`SELECT id, display_name FROM members WHERE group_id = ${groupId} ORDER BY created_at ASC`,
  ]);

  // Static-served paths - no async needed.
  const uploads = uploadRows.map(u => ({
    id: u.id,
    countryCode: u.country_code,
    kind: u.kind,
    url: publicUrlFor(u.r2_key),
    filename: u.original_filename,
    contentType: u.content_type,
    sizeBytes: Number(u.size_bytes),
    durationSec: u.duration_sec,
    position: u.position,
    createdAt: u.created_at,
    // Use the same `displayName` field shape the `members` array and `me`
    // object use, so the frontend can read it uniformly everywhere.
    member: u.member_id ? { id: u.member_id, displayName: u.member_name } : null,
  }));

  // Group uploads by country for easy per-country rendering.
  const byCountry = new Map();
  for (const u of uploads) {
    if (!byCountry.has(u.countryCode)) byCountry.set(u.countryCode, []);
    byCountry.get(u.countryCode).push(u);
  }

  // Compose final country list with the uploads merged in.
  const countriesWithUploads = countries.map(c => ({
    ...c,
    uploads: byCountry.get(c.code) || [],
  }));

  res.json({
    group: { id: groupId, name: auth.group.name },
    me: { id: auth.member.id, displayName: auth.member.displayName },
    members: memberRows.map(m => ({ id: m.id, displayName: m.display_name })),
    countries: countriesWithUploads,
    totals: {
      members: memberRows.length,
      uploads: uploads.length,
      countriesWithUploads: byCountry.size,
    },
  });
}

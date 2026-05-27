// GET /api/groups/[id] - public info about a group (used by the join page).
// Anyone with the URL can read the group's name, member display names, and
// aggregate stats (countries visited, total memories). No private content
// - photo URLs, identities-on-uploads, and tokens stay behind auth.

import { sql } from '../_lib/db.js';
import { methodOk } from '../_lib/json.js';

export default async function handler(req, res) {
  if (!methodOk(req, res, ['GET'])) return;
  const id = String(req.query?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'missing id' });

  const groupRows = await sql`
    SELECT g.id, g.name, g.created_at,
           (SELECT COUNT(*) FROM members WHERE group_id = g.id)            AS member_count,
           (SELECT COUNT(*) FROM uploads WHERE group_id = g.id)            AS upload_count,
           (SELECT COUNT(DISTINCT country_code) FROM uploads WHERE group_id = g.id) AS country_count
      FROM groups g
     WHERE g.id = ${id}
  `;
  if (!groupRows.length) return res.status(404).json({ error: 'group not found' });

  // Display names of the first 8 members (ordered by join time), so the
  // invite page can show a friend strip. We cap the list so a 100-member
  // group doesn't bloat the response - the count above still shows total.
  const memberRows = await sql`
    SELECT display_name FROM members
     WHERE group_id = ${id}
     ORDER BY id ASC
     LIMIT 8
  `;

  const g = groupRows[0];
  res.json({
    id: g.id,
    name: g.name,
    createdAt: g.created_at,
    memberCount: g.member_count,
    uploadCount: g.upload_count,
    countryCount: g.country_count,
    memberNames: memberRows.map(r => r.display_name),
    founderName: memberRows[0]?.display_name || null,
  });
}

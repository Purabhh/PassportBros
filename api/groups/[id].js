// GET /api/groups/[id] — public info about a group (used by the join page).
// Anyone with the URL can read the group's name and member count.
// Photos and member identities require auth.

import { sql } from '../_lib/db.js';
import { methodOk } from '../_lib/json.js';

export default async function handler(req, res) {
  if (!methodOk(req, res, ['GET'])) return;
  const id = String(req.query?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'missing id' });

  const rows = await sql`
    SELECT g.id, g.name, g.created_at,
           COUNT(m.id)::int AS member_count
      FROM groups g
      LEFT JOIN members m ON m.group_id = g.id
     WHERE g.id = ${id}
     GROUP BY g.id
  `;
  if (!rows.length) return res.status(404).json({ error: 'group not found' });
  const g = rows[0];
  res.json({
    id: g.id,
    name: g.name,
    createdAt: g.created_at,
    memberCount: g.member_count,
  });
}

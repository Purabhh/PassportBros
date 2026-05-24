// POST /api/groups/[id]/members — join an existing group.
// Body: { displayName: string }
// Response: { member: {id, displayName, token} }
//
// No auth needed; if you have the group URL, you can join. The token returned
// is what the client uses for all subsequent authenticated requests.

import { sql } from '../../_lib/db.js';
import { newMemberToken } from '../../_lib/ids.js';
import { methodOk, badReq, readBody } from '../../_lib/json.js';

export default async function handler(req, res) {
  if (!methodOk(req, res, ['POST'])) return;
  const groupId = String(req.query?.id || '').trim();
  if (!groupId) return badReq(res, 'missing group id');

  const body = await readBody(req).catch(() => null);
  if (!body) return badReq(res, 'invalid json body');
  const displayName = String(body.displayName || '').trim().slice(0, 40);
  if (!displayName) return badReq(res, 'displayName is required');

  // Confirm the group exists before creating an orphan member.
  const groupRows = await sql`SELECT id FROM groups WHERE id = ${groupId} LIMIT 1`;
  if (!groupRows.length) return res.status(404).json({ error: 'group not found' });

  const token = newMemberToken();
  const rows = await sql`
    INSERT INTO members (group_id, display_name, member_token)
    VALUES (${groupId}, ${displayName}, ${token})
    RETURNING id
  `;
  res.status(201).json({
    member: { id: rows[0].id, displayName, token },
  });
}

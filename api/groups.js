// POST /api/groups — create a new group.
// Body: { name: string, founderName: string }
// Response: { group: {id, name}, member: {id, displayName, token} }
//
// The returned group.id IS the invite token — share the URL /g/<id> with friends.
// The member token is what the founder uses to authenticate from now on.

import { sql } from './_lib/db.js';
import { newGroupId, newMemberToken } from './_lib/ids.js';
import { methodOk, badReq, readBody } from './_lib/json.js';

export default async function handler(req, res) {
  if (!methodOk(req, res, ['POST'])) return;
  const body = await readBody(req).catch(() => null);
  if (!body) return badReq(res, 'invalid json body');

  const name = String(body.name || '').trim().slice(0, 80);
  const founderName = String(body.founderName || '').trim().slice(0, 40);
  if (!name) return badReq(res, 'name is required');
  if (!founderName) return badReq(res, 'founderName is required');

  const groupId = newGroupId();
  const memberToken = newMemberToken();

  try {
    await sql`INSERT INTO groups (id, name) VALUES (${groupId}, ${name})`;
    const memberRows = await sql`
      INSERT INTO members (group_id, display_name, member_token)
      VALUES (${groupId}, ${founderName}, ${memberToken})
      RETURNING id
    `;
    res.status(201).json({
      group: { id: groupId, name },
      member: {
        id: memberRows[0].id,
        displayName: founderName,
        token: memberToken,
      },
    });
  } catch (e) {
    console.error('create group failed:', e);
    res.status(500).json({ error: 'could not create group' });
  }
}

// Member-token auth. Token lives in localStorage on the client and is sent
// on every API call as `Authorization: Bearer <token>`. Server looks it up
// in the members table to find the member + group.

import { sql } from './db.js';

export function readBearer(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : null;
}

/**
 * Verify the request is from a member of the given group.
 * Returns { member, group } if valid; sends a 401/403 and returns null otherwise.
 */
export async function requireMember(req, res, groupId) {
  const token = readBearer(req);
  if (!token) {
    res.status(401).json({ error: 'missing bearer token' });
    return null;
  }
  const rows = await sql`
    SELECT m.id          AS member_id,
           m.display_name,
           m.member_token,
           m.group_id,
           g.id          AS group_id,
           g.name        AS group_name
      FROM members m
      JOIN groups  g ON g.id = m.group_id
     WHERE m.member_token = ${token}
       AND m.group_id     = ${groupId}
     LIMIT 1
  `;
  if (!rows.length) {
    res.status(403).json({ error: 'not a member of this group' });
    return null;
  }
  const row = rows[0];
  return {
    member: {
      id: row.member_id,
      displayName: row.display_name,
    },
    group: {
      id: row.group_id,
      name: row.group_name,
    },
  };
}

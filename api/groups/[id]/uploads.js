// POST /api/groups/[id]/uploads — register a completed R2 upload in the db.
// Body must echo what was sent to /uploads/sign (country, kind, filename,
// contentType, sizeBytes, durationSec) plus the r2Key returned by sign.
//
// DELETE /api/groups/[id]/uploads?uploadId=N — remove an upload (own only).

import { sql } from '../../_lib/db.js';
import { requireMember } from '../../_lib/auth.js';
import { methodOk, badReq, readBody } from '../../_lib/json.js';
import { publicUrlFor, deleteObject } from '../../_lib/r2.js';

export default async function handler(req, res) {
  if (!methodOk(req, res, ['POST', 'DELETE'])) return;
  const groupId = String(req.query?.id || '').trim();
  if (!groupId) return badReq(res, 'missing group id');

  const auth = await requireMember(req, res, groupId);
  if (!auth) return;

  if (req.method === 'POST') return registerUpload(req, res, groupId, auth);
  if (req.method === 'DELETE') return deleteUpload(req, res, groupId, auth);
}

async function registerUpload(req, res, groupId, auth) {
  const body = await readBody(req).catch(() => null);
  if (!body) return badReq(res, 'invalid json body');

  const countryCode = String(body.countryCode || '').trim().toLowerCase();
  const kind = String(body.kind || '').trim();
  const r2Key = String(body.r2Key || '').trim();
  const filename = String(body.filename || '').trim().slice(0, 200);
  const contentType = String(body.contentType || '').trim();
  const sizeBytes = Number(body.sizeBytes);
  const durationSec = body.durationSec == null ? null : Number(body.durationSec);

  if (!/^[a-z]{2,3}$/.test(countryCode)) return badReq(res, 'invalid countryCode');
  if (kind !== 'photo' && kind !== 'video') return badReq(res, 'invalid kind');
  if (!r2Key.startsWith(`groups/${groupId}/${countryCode}/`)) {
    return badReq(res, 'r2Key does not match this group/country');
  }
  if (!filename) return badReq(res, 'filename required');
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return badReq(res, 'invalid sizeBytes');

  try {
    const rows = await sql`
      INSERT INTO uploads
        (group_id, member_id, country_code, kind, r2_key,
         original_filename, content_type, size_bytes, duration_sec)
      VALUES
        (${groupId}, ${auth.member.id}, ${countryCode}, ${kind}, ${r2Key},
         ${filename}, ${contentType}, ${sizeBytes}, ${durationSec})
      RETURNING id, created_at
    `;
    const row = rows[0];
    res.status(201).json({
      upload: {
        id: row.id,
        countryCode,
        kind,
        url: await publicUrlFor(r2Key),
        filename,
        contentType,
        sizeBytes,
        durationSec,
        createdAt: row.created_at,
        member: { id: auth.member.id, name: auth.member.displayName },
      },
    });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'this file was already registered' });
    }
    console.error('register upload failed:', e);
    res.status(500).json({ error: 'could not register upload' });
  }
}

async function deleteUpload(req, res, groupId, auth) {
  const uploadId = Number(req.query?.uploadId);
  if (!Number.isInteger(uploadId)) return badReq(res, 'missing uploadId');

  const rows = await sql`
    SELECT id, member_id, r2_key FROM uploads
     WHERE id = ${uploadId} AND group_id = ${groupId}
     LIMIT 1
  `;
  if (!rows.length) return res.status(404).json({ error: 'upload not found' });
  const u = rows[0];
  if (u.member_id !== auth.member.id) {
    return res.status(403).json({ error: 'you can only delete your own uploads' });
  }

  await sql`DELETE FROM uploads WHERE id = ${uploadId}`;
  // R2 deletion is best-effort — if it fails we orphan a file but the db is clean.
  deleteObject(u.r2_key).catch(e => console.warn('R2 delete failed:', e));
  res.json({ ok: true });
}

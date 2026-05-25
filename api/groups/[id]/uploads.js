// POST   /api/groups/[id]/uploads        — multipart upload (field: "file")
// DELETE /api/groups/[id]/uploads?uploadId=N  — remove an upload (own only)
//
// Multer is wired in server.js so by the time this runs:
//   req.file       — multer file object (path on disk, originalname, mimetype, size)
//   req.body       — text form fields (countryCode, kind, durationSec)

import path from 'node:path';
import { sql, isUniqueViolation } from '../../_lib/db.js';
import { requireMember } from '../../_lib/auth.js';
import { methodOk, badReq } from '../../_lib/json.js';
import { saveBlob, deleteBlob, publicUrlFor } from '../../_lib/storage.js';
import fs from 'node:fs/promises';

const MAX_PHOTO_BYTES = 30 * 1024 * 1024;       // 30 MB
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;      // 500 MB
const MAX_VIDEO_SECONDS = 5 * 60;               // 5 min

const IMAGE_MIME = /^image\/(jpe?g|png|gif|webp|avif|heic|heif)$/i;
const VIDEO_MIME = /^video\/(mp4|webm|quicktime|x-matroska|x-msvideo|3gpp|3gpp2)$/i;

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
  if (!req.file) return badReq(res, 'no file in upload (field name must be "file")');

  const countryCode = String(req.body?.countryCode || '').trim().toLowerCase();
  const kind = String(req.body?.kind || '').trim();
  const filename = String(req.body?.filename || req.file.originalname || '').trim().slice(0, 200);
  const contentType = req.file.mimetype || 'application/octet-stream';
  const sizeBytes = req.file.size;
  const durationSec = req.body?.durationSec == null || req.body.durationSec === ''
    ? null : Number(req.body.durationSec);

  const cleanup = () => fs.unlink(req.file.path).catch(() => {});

  if (!/^[a-z]{2,3}$/.test(countryCode)) { cleanup(); return badReq(res, 'invalid countryCode'); }
  if (kind !== 'photo' && kind !== 'video') { cleanup(); return badReq(res, 'kind must be photo or video'); }
  if (!filename) { cleanup(); return badReq(res, 'filename required'); }

  if (kind === 'photo') {
    if (!IMAGE_MIME.test(contentType)) { cleanup(); return badReq(res, `unsupported photo type: ${contentType}`); }
    if (sizeBytes > MAX_PHOTO_BYTES)   { cleanup(); return badReq(res, 'photo exceeds 30 MB'); }
  } else {
    if (!VIDEO_MIME.test(contentType)) { cleanup(); return badReq(res, `unsupported video type: ${contentType}`); }
    if (sizeBytes > MAX_VIDEO_BYTES)   { cleanup(); return badReq(res, 'video exceeds 500 MB'); }
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      cleanup(); return badReq(res, 'durationSec required for videos');
    }
    if (durationSec > MAX_VIDEO_SECONDS) {
      cleanup(); return badReq(res, 'videos must be 5 minutes or less');
    }
  }

  // Final storage key — keep the legacy r2_key column name in the db.
  const ts = Date.now();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const r2Key = `groups/${groupId}/${countryCode}/${ts}-${safe}`;

  try {
    await saveBlob(r2Key, req.file.path);
  } catch (e) {
    console.error('save blob failed:', e);
    await cleanup();
    return res.status(500).json({ error: 'failed to save file' });
  }

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
        url: publicUrlFor(r2Key),
        filename,
        contentType,
        sizeBytes,
        durationSec,
        createdAt: row.created_at,
        member: { id: auth.member.id, name: auth.member.displayName },
      },
    });
  } catch (e) {
    await deleteBlob(r2Key).catch(() => {});
    if (isUniqueViolation(e)) {
      return res.status(409).json({ error: 'this file was already registered' });
    }
    console.error('register upload failed:', e);
    res.status(500).json({ error: 'could not register upload' });
  }
}

async function deleteUpload(req, res, groupId, auth) {
  const uploadId = Number(req.query?.uploadId);
  if (!Number.isInteger(uploadId)) return badReq(res, 'missing uploadId');

  // Any member of the group can delete any upload in the group. (auth.member
  // already confirmed by requireMember(). Friends trust friends; if this
  // becomes a problem we can tighten to uploader-only or add an "admin" flag.)
  const rows = await sql`
    SELECT id, r2_key FROM uploads
     WHERE id = ${uploadId} AND group_id = ${groupId}
     LIMIT 1
  `;
  if (!rows.length) return res.status(404).json({ error: 'upload not found' });
  const u = rows[0];

  await sql`DELETE FROM uploads WHERE id = ${uploadId}`;
  // file deletion is best-effort; orphan blob is harmless
  deleteBlob(u.r2_key).catch(e => console.warn('storage delete failed:', e));
  res.json({ ok: true });
}

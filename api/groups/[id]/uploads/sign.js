// POST /api/groups/[id]/uploads/sign — get a presigned R2 URL the browser
// can PUT the file to. We pre-validate everything that's checkable from
// metadata (size, mime, duration) before signing, then trust the browser
// to honor it.
//
// Body: {
//   countryCode: "jp",
//   filename: "trip.jpg",
//   contentType: "image/jpeg",
//   sizeBytes: 1234567,
//   durationSec: 47,           // null for photos; required for videos, max 300
//   kind: "photo" | "video"
// }
// Response: { uploadUrl, r2Key }
//
// The client uploads to uploadUrl, then calls POST /api/groups/[id]/uploads
// with the r2Key to register the upload in the db.

import { requireMember } from '../../../_lib/auth.js';
import { methodOk, badReq, readBody } from '../../../_lib/json.js';
import { presignUpload, r2Configured } from '../../../_lib/r2.js';

const MAX_PHOTO_BYTES = 30 * 1024 * 1024;       // 30 MB
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;      // 500 MB
const MAX_VIDEO_SECONDS = 5 * 60;               // 5 min

const IMAGE_MIME = /^image\/(jpe?g|png|gif|webp|avif|heic)$/i;
const VIDEO_MIME = /^video\/(mp4|webm|quicktime|x-matroska|x-msvideo)$/i;

export default async function handler(req, res) {
  if (!methodOk(req, res, ['POST'])) return;
  if (!r2Configured()) {
    return res.status(503).json({ error: 'R2 not configured on the server' });
  }
  const groupId = String(req.query?.id || '').trim();
  if (!groupId) return badReq(res, 'missing group id');

  const auth = await requireMember(req, res, groupId);
  if (!auth) return;

  const body = await readBody(req).catch(() => null);
  if (!body) return badReq(res, 'invalid json body');

  const countryCode = String(body.countryCode || '').trim().toLowerCase();
  const filename = String(body.filename || '').trim().slice(0, 200);
  const contentType = String(body.contentType || '').trim();
  const sizeBytes = Number(body.sizeBytes);
  const durationSec = body.durationSec == null ? null : Number(body.durationSec);
  const kind = String(body.kind || '').trim();

  if (!/^[a-z]{2,3}$/.test(countryCode)) return badReq(res, 'invalid countryCode');
  if (!filename) return badReq(res, 'filename required');
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return badReq(res, 'invalid sizeBytes');
  if (kind !== 'photo' && kind !== 'video') return badReq(res, 'kind must be photo or video');

  if (kind === 'photo') {
    if (!IMAGE_MIME.test(contentType)) return badReq(res, `unsupported photo type: ${contentType}`);
    if (sizeBytes > MAX_PHOTO_BYTES) return badReq(res, 'photo exceeds 30 MB');
  } else {
    if (!VIDEO_MIME.test(contentType)) return badReq(res, `unsupported video type: ${contentType}`);
    if (sizeBytes > MAX_VIDEO_BYTES) return badReq(res, 'video exceeds 500 MB');
    if (!Number.isFinite(durationSec) || durationSec <= 0) return badReq(res, 'durationSec required for videos');
    if (durationSec > MAX_VIDEO_SECONDS) return badReq(res, 'videos must be 5 minutes or less');
  }

  // Final R2 key: groups/<groupId>/<country>/<timestamp>-<sanitized-name>
  const ts = Date.now();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const r2Key = `groups/${groupId}/${countryCode}/${ts}-${safe}`;

  try {
    const uploadUrl = await presignUpload({ key: r2Key, contentType });
    res.json({ uploadUrl, r2Key });
  } catch (e) {
    console.error('presign failed:', e);
    res.status(500).json({ error: 'could not sign upload' });
  }
}

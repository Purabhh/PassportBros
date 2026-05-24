// Cloudflare R2 wrapper. R2 is S3-compatible so the AWS SDK works as-is.
// We use presigned PUT URLs so the browser uploads directly to R2 without
// passing through Vercel (which has a 4.5 MB body limit on Hobby tier).

import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

export const BUCKET = process.env.R2_BUCKET || '';
export const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');

export const s3 = (accountId && accessKeyId && secretAccessKey)
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })
  : null;

export function r2Configured() {
  return !!(s3 && BUCKET);
}

/** Get a presigned PUT URL the browser can use to upload a file directly. */
export async function presignUpload({ key, contentType }) {
  if (!r2Configured()) throw new Error('R2 not configured');
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return await getSignedUrl(s3, cmd, { expiresIn: 60 * 15 }); // 15 min
}

/** Public URL for an object, or a signed GET URL if no public base configured. */
export async function publicUrlFor(key) {
  if (PUBLIC_BASE) return `${PUBLIC_BASE}/${key}`;
  if (!r2Configured()) return null;
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return await getSignedUrl(s3, cmd, { expiresIn: 60 * 60 * 24 }); // 24h
}

export async function deleteObject(key) {
  if (!r2Configured()) return;
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// Local-disk file storage. Replaces the R2 module - same function names,
// same shape, just backed by /uploads on disk.

import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';

export const UPLOADS_ROOT = process.env.UPLOADS_DIR
  || path.join(process.cwd(), 'uploads');

fssync.mkdirSync(UPLOADS_ROOT, { recursive: true });

/** Public URL for a stored object - served via Express static. */
export function publicUrlFor(key) {
  return `/uploads/${key}`;
}

/** Move a file from `srcPath` to its final key path under UPLOADS_ROOT. */
export async function saveBlob(key, srcPath) {
  const dest = path.join(UPLOADS_ROOT, key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  // rename() works only on the same filesystem - fall back to copy+unlink.
  try {
    await fs.rename(srcPath, dest);
  } catch (e) {
    if (e.code === 'EXDEV') {
      await fs.copyFile(srcPath, dest);
      await fs.unlink(srcPath).catch(() => {});
    } else {
      throw e;
    }
  }
}

/** Best-effort delete; ENOENT is fine (already gone). */
export async function deleteBlob(key) {
  const fullPath = path.join(UPLOADS_ROOT, key);
  try { await fs.unlink(fullPath); } catch (e) {
    if (e.code !== 'ENOENT') console.warn('deleteBlob failed:', e.message);
  }
}

/** True when configured - local fs is always available, so always true. */
export function storageReady() { return true; }

// Tiny fetch wrapper for the PassportBros API. Member tokens are stored
// per-group in localStorage and auto-attached to authed requests.

const STORAGE_PREFIX = 'passportbros.member.';

export function getMemberFor(groupId) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + groupId);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveMemberFor(groupId, member) {
  localStorage.setItem(STORAGE_PREFIX + groupId, JSON.stringify(member));
}

export function clearMemberFor(groupId) {
  localStorage.removeItem(STORAGE_PREFIX + groupId);
}

async function request(method, url, { body, token } = {}) {
  const opts = { method, headers: {} };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  createGroup: ({ name, founderName }) =>
    request('POST', '/api/groups', { body: { name, founderName } }),

  getGroup: (id) =>
    request('GET', `/api/groups/${id}`),

  joinGroup: ({ groupId, displayName }) =>
    request('POST', `/api/groups/${groupId}/members`, { body: { displayName } }),

  getData: ({ groupId, token }) =>
    request('GET', `/api/groups/${groupId}/data`, { token }),

  deleteUpload: ({ groupId, token, uploadId }) =>
    request('DELETE', `/api/groups/${groupId}/uploads?uploadId=${uploadId}`, { token }),

  reorderUploads: ({ groupId, token, countryCode, orderedIds }) =>
    request('PATCH', `/api/groups/${groupId}/uploads`, {
      token, body: { countryCode, orderedIds },
    }),
};

/**
 * Upload a single file via multipart. Sends the file plus its metadata
 * (countryCode, kind, durationSec) in one request. Resolves with the
 * server's { upload } response, or throws on non-2xx.
 *
 *   await uploadFile({ groupId, token, countryCode, file, durationSec, onProgress })
 */
export async function uploadFile({
  groupId, token, countryCode, file, durationSec, onProgress,
}) {
  const kind = file.type.startsWith('video/') ? 'video' : 'photo';
  const form = new FormData();
  form.append('file', file);
  form.append('countryCode', countryCode);
  form.append('kind', kind);
  form.append('filename', file.name);
  if (durationSec != null) form.append('durationSec', String(durationSec));

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/groups/${groupId}/uploads`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data;
      try { data = JSON.parse(xhr.responseText || '{}'); } catch { data = { error: xhr.responseText }; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else {
        const err = new Error(data?.error || `HTTP ${xhr.status}`);
        err.status = xhr.status;
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error('network error during upload'));
    xhr.send(form);
  });
}

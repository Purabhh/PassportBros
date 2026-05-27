// Tiny fetch wrapper for the PassportBros API. Member tokens are stored
// per-group in localStorage and auto-attached to authed requests.

const STORAGE_PREFIX = 'passportbros.member.';
const DEVICE_ID_KEY = 'pb_device_id';

// One-per-browser random ID, used as half of the rate-limit key for
// unauthenticated routes (the other half is IP). Persisted in localStorage
// so it survives reloads and group switches — but a fresh browser profile
// gets a fresh ID, which is the limit we want.
export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (id) return id;
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch { return 'no-device-id'; }
}

export function getMemberFor(groupId) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + groupId);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Stored shape: { id, displayName, token, groupId, groupName }.
// groupId/groupName are denormalized into the value so the group-switcher
// can render the list without an extra round-trip per group.
export function saveMemberFor(groupId, member, groupName) {
  const existing = getMemberFor(groupId) || {};
  const stored = {
    ...existing,
    ...member,
    groupId,
    groupName: groupName ?? existing.groupName ?? null,
  };
  localStorage.setItem(STORAGE_PREFIX + groupId, JSON.stringify(stored));
}

export function clearMemberFor(groupId) {
  localStorage.removeItem(STORAGE_PREFIX + groupId);
}

// Returns every group this device has joined. Used by the group switcher.
// Entries without a groupName (legacy or pre-backfill) are still returned
// so the switcher can show them as "(unnamed)" rather than hide them.
export function listMemberships() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        out.push({
          groupId: parsed.groupId || key.slice(STORAGE_PREFIX.length),
          groupName: parsed.groupName || null,
          displayName: parsed.displayName || '',
        });
      } catch { /* skip malformed entry */ }
    }
  } catch { /* localStorage unavailable */ }
  return out;
}

async function request(method, url, { body, token } = {}) {
  const opts = { method, headers: { 'X-Device-Id': getDeviceId() } };
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
    xhr.setRequestHeader('X-Device-Id', getDeviceId());
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

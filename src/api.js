// Tiny fetch wrapper that auto-attaches the member token for the active group.

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
  const opts = {
    method,
    headers: {},
  };
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

  signUpload: ({ groupId, token, ...rest }) =>
    request('POST', `/api/groups/${groupId}/uploads/sign`, { body: rest, token }),

  registerUpload: ({ groupId, token, ...rest }) =>
    request('POST', `/api/groups/${groupId}/uploads`, { body: rest, token }),

  deleteUpload: ({ groupId, token, uploadId }) =>
    request('DELETE', `/api/groups/${groupId}/uploads?uploadId=${uploadId}`, { token }),
};

// Direct PUT to a presigned R2 URL — bypasses our API entirely.
export async function uploadToR2({ url, file, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 upload failed (${xhr.status}): ${xhr.responseText}`));
    };
    xhr.onerror = () => reject(new Error('network error during upload'));
    xhr.send(file);
  });
}

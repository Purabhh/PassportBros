// Tiny helpers shared by API handlers.

export function methodOk(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  res.setHeader('Allow', allowed.join(', '));
  res.status(405).json({ error: `method ${req.method} not allowed` });
  return false;
}

export function badReq(res, msg) {
  res.status(400).json({ error: msg });
  return null;
}

/**
 * Some Vercel runtimes leave req.body as a stream; Express's express.json()
 * leaves it as an object. This normalizes either way.
 */
export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (req.body && typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  // stream
  return await new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => { buf += c; });
    req.on('end', () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

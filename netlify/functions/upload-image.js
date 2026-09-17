const https = require('https');

const REPO = '/repos/atarajput1990-maker/shahsports-website';
const MEDIA_DIR = 'images/products';
const MAX_BYTES = 5 * 1024 * 1024;

function ghRequest(path, method, token, payload) {
  return new Promise((resolve) => {
    const headers = {
      'Authorization': `token ${token}`,
      'User-Agent': 'Shah-Sports-Admin',
      'Accept': 'application/vnd.github.v3+json'
    };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request({ hostname: 'api.github.com', path, method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: 500, body: JSON.stringify({ error: e.message }) }));
    if (payload) req.write(payload);
    req.end();
  });
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  /* same Identity check as save-products — this also writes to the repo */
  const { user } = context.clientContext || {};
  if (!user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Not authorised. Sign in to the admin panel and try again.' })
    };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GitHub token not configured' }) };
  }

  let filename, content;
  try {
    ({ filename, content } = JSON.parse(event.body));
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  /* never trust a client-supplied path — strip it to a bare safe filename */
  const safe = String(filename || '')
    .replace(/^.*[\\/]/, '')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (!safe || !/\.(png|jpe?g|webp|gif|avif)$/i.test(safe)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Filename must be a .png, .jpg, .webp, .gif or .avif file' }) };
  }
  if (typeof content !== 'string' || !content) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing image content' }) };
  }
  if (Buffer.byteLength(content, 'base64') > MAX_BYTES) {
    return { statusCode: 413, body: JSON.stringify({ error: 'Image is larger than 5 MB' }) };
  }

  const path = MEDIA_DIR + '/' + safe;

  /* GitHub needs the existing sha to overwrite a file at the same path */
  let sha;
  const existing = await ghRequest(REPO + '/contents/' + path, 'GET', token);
  if (existing.status === 200) {
    try { sha = JSON.parse(existing.body).sha; } catch (e) { /* ignore */ }
  }

  const payload = JSON.stringify({
    message: 'Upload product image via Shah Sports admin (' + (user.email || 'unknown') + ')',
    content,
    sha
  });

  const res = await ghRequest(REPO + '/contents/' + path, 'PUT', token, payload);
  if (res.status !== 200 && res.status !== 201) {
    return { statusCode: res.status, body: res.body };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: '/' + path })
  };
};

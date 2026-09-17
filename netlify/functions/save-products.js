const https = require('https');

const REPO_PATH = '/repos/atarajput1990-maker/shahsports-website/contents/products.json';

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  /* ── AUTH ──────────────────────────────────────────────────────
     Netlify verifies the Netlify Identity JWT sent in the
     Authorization header and puts the decoded user on
     context.clientContext. Without this check anyone on the
     internet could POST here and rewrite the whole catalogue,
     because this function holds a GitHub token with write access. */
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

  let products, sha;
  try {
    ({ products, sha } = JSON.parse(event.body));
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }
  if (!Array.isArray(products)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'products must be an array' }) };
  }

  const content = Buffer.from(JSON.stringify({ products }, null, 2) + '\n').toString('base64');

  const payload = JSON.stringify({
    message: 'Update products via Shah Sports admin (' + (user.email || 'unknown') + ')',
    content,
    sha
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: REPO_PATH,
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Shah-Sports-Admin',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode === 200 || res.statusCode === 201 ? 200 : res.statusCode,
          headers: { 'Content-Type': 'application/json' },
          body: data
        });
      });
    });
    req.on('error', (e) => resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) }));
    req.write(payload);
    req.end();
  });
};

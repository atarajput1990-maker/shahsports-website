const https = require('https');

const REPO = '/repos/atarajput1990-maker/shahsports-website';

function gh(path, token) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'Shah-Sports-Admin',
        'Accept': 'application/vnd.github.v3+json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: 500, body: JSON.stringify({ error: e.message }) }));
    req.end();
  });
}

exports.handler = async () => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GitHub token not configured' }) };
  }

  const res = await gh(REPO + '/contents/products.json', token);
  if (res.status !== 200) {
    return { statusCode: res.status, body: res.body };
  }

  let parsed, content;
  try {
    parsed = JSON.parse(res.body);
    content = Buffer.from(parsed.content, 'base64').toString('utf-8');
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Could not read products.json' }) };
  }

  /* the commit date drives the "last updated" line in the admin header;
     it is best-effort, so a failure here must not fail the whole read */
  let updated = null;
  try {
    const c = await gh(REPO + '/commits?path=products.json&sha=main&per_page=1', token);
    if (c.status === 200) {
      const list = JSON.parse(c.body);
      if (list[0] && list[0].commit && list[0].commit.committer) {
        updated = list[0].commit.committer.date;
      }
    }
  } catch (e) { /* ignore */ }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      products: JSON.parse(content).products,
      sha: parsed.sha,
      updated
    })
  };
};

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data');
const VISITORS = path.join(DATA, 'visitors.json');
fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(VISITORS)) fs.writeFileSync(VISITORS, '[]');

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const visitors = () => JSON.parse(fs.readFileSync(VISITORS, 'utf8'));
const saveVisitors = data => fs.writeFileSync(VISITORS, JSON.stringify(data.slice(-1000), null, 2));

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/visit' && req.method === 'POST') {
    const all = visitors();
    all.push({ id: crypto.randomUUID(), at: new Date().toISOString(), page: '/', referrer: req.headers.referer || 'direct', ua: req.headers['user-agent'] || '' });
    saveVisitors(all);
    return json(res, 201, { ok: true });
  }
  if (url.pathname === '/api/analytics' && req.method === 'GET') {
    // Set ADMIN_TOKEN in your hosting dashboard before deploying.
    if (!process.env.ADMIN_TOKEN || req.headers.authorization !== `Bearer ${process.env.ADMIN_TOKEN}`) return json(res, 401, { error: 'Unauthorized' });
    const all = visitors();
    return json(res, 200, { total: all.length, recent: all.slice(-20).reverse() });
  }
  const requestPath = decodeURIComponent(url.pathname);
  const safePath = requestPath === '/' ? '/index.html' : requestPath;
  const file = path.normalize(path.join(ROOT, safePath));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
  fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log('Portfolio running at http://localhost:3000'));

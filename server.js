const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');

const ROOT = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data');
const VISITORS = path.join(DATA, 'visitors.json');
const USERS = path.join(DATA, 'users.json');
const PORTFOLIO_ACCESS_PASSWORD = '072005';
const scrypt = promisify(crypto.scrypt);
const sessions = new Map();
fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(VISITORS)) fs.writeFileSync(VISITORS, '[]');
if (!fs.existsSync(USERS)) fs.writeFileSync(USERS, '[]');

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const visitors = () => JSON.parse(fs.readFileSync(VISITORS, 'utf8'));
const saveVisitors = data => fs.writeFileSync(VISITORS, JSON.stringify(data.slice(-1000), null, 2));
const users = () => JSON.parse(fs.readFileSync(USERS, 'utf8'));
const publicUser = user => ({ id: user.id, name: user.name, email: user.email });
const readBody = req => new Promise((resolve, reject) => {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 10_000) reject(new Error('Request body too large'));
  });
  req.on('end', () => {
    try { resolve(JSON.parse(body || '{}')); }
    catch { reject(new Error('Invalid JSON')); }
  });
  req.on('error', reject);
});
const sessionUser = req => {
  const cookie = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('portfolio_session='));
  const token = cookie?.slice('portfolio_session='.length);
  const session = token && sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return session.user;
};
const setSession = (res, user) => {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { user: publicUser(user), expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `portfolio_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`);
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/auth/session' && req.method === 'GET') {
    const user = sessionUser(req);
    return user ? json(res, 200, { user: publicUser(user) }) : json(res, 401, { error: 'Sign in required' });
  }
  if (url.pathname === '/api/auth/signup' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); }
    catch (error) { return json(res, 400, { error: error.message }); }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (name.length < 2 || name.length > 80) return json(res, 400, { error: 'Enter a name between 2 and 80 characters.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Enter a valid email address.' });
    if (password === PORTFOLIO_ACCESS_PASSWORD) {
      const user = { id: crypto.randomUUID(), name, email };
      setSession(res, user);
      return json(res, 201, { user: publicUser(user) });
    }
    if (password.length < 8 || password.length > 200) return json(res, 400, { error: 'Password must be at least 8 characters.' });
    const allUsers = users();
    if (allUsers.some(user => user.email === email)) return json(res, 409, { error: 'An account with this email already exists.' });
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    const user = { id: crypto.randomUUID(), name, email, salt, passwordHash };
    allUsers.push(user);
    fs.writeFileSync(USERS, JSON.stringify(allUsers, null, 2));
    setSession(res, user);
    return json(res, 201, { user: publicUser(user) });
  }
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); }
    catch (error) { return json(res, 400, { error: error.message }); }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (name.length < 2 || name.length > 80) return json(res, 400, { error: 'Enter a valid account name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Enter a valid email address.' });
    if (password === PORTFOLIO_ACCESS_PASSWORD) {
      const user = { id: crypto.randomUUID(), name, email };
      setSession(res, user);
      return json(res, 200, { user: publicUser(user) });
    }
    const user = users().find(entry => entry.email === email);
    if (!user || !password) return json(res, 401, { error: 'Invalid email or password.' });
    if (user.name.trim().toLocaleLowerCase() !== name.toLocaleLowerCase()) {
      return json(res, 401, { error: 'Name, email, or password is incorrect.' });
    }
    const passwordHash = await scrypt(password, user.salt, 64);
    if (!crypto.timingSafeEqual(passwordHash, Buffer.from(user.passwordHash, 'hex'))) {
      return json(res, 401, { error: 'Invalid email or password.' });
    }
    setSession(res, user);
    return json(res, 200, { user: publicUser(user) });
  }
  if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
    const cookie = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('portfolio_session='));
    if (cookie) sessions.delete(cookie.slice('portfolio_session='.length));
    res.setHeader('Set-Cookie', 'portfolio_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    return json(res, 200, { ok: true });
  }
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


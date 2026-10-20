'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8' };
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'X-Content-Type-Options': 'nosniff' };
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const files = new Map(manifest.files.map(f => [f.path, f]));
const key = Buffer.from(process.env.DEMO_CONTENT_KEY || '', 'base64url');
let content = null;
if (key.length === 32) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(manifest.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(manifest.tag, 'base64url'));
    content = Buffer.concat([decipher.update(fs.readFileSync(path.join(__dirname, 'payload.bin'))), decipher.final()]);
  } catch (error) { console.error('Encrypted content verification failed'); }
}
function equal(a, b) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
const server = http.createServer((req, res) => {
  const expires = Date.parse(process.env.DEMO_EXPIRES_AT || '');
  const password = process.env.DEMO_PASSWORD;
  if (!content || !Number.isFinite(expires) || !password) return reply(503, '试玩暂不可用');
  if (Date.now() >= expires) return reply(410, '试玩期限已结束');
  let credential = '';
  try { const auth = req.headers.authorization || ''; if (auth.startsWith('Basic ')) credential = Buffer.from(auth.slice(6), 'base64').toString('utf8'); } catch {}
  if (!equal(credential, 'publisher:' + password)) {
    res.writeHead(401, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'WWW-Authenticate': 'Basic realm="Caitou publisher demo", charset="UTF-8"' });
    return res.end('需要试玩密码');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return reply(405, 'Method Not Allowed');
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { return reply(400, 'Bad Request'); }
  if (pathname === '/') pathname = '/index.html';
  const entry = files.get(pathname);
  if (!entry) return reply(404, 'Not Found');
  res.writeHead(200, { ...headers, 'Content-Type': mime[path.extname(pathname)] || 'application/octet-stream' });
  if (req.method === 'HEAD') return res.end();
  res.end(content.subarray(entry.offset, entry.offset + entry.bytes));
  function reply(code, body) { res.writeHead(code, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }); res.end(body); }
});
server.listen(Number(process.env.PORT || 3000), '0.0.0.0');

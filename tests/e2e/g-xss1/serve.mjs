import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, '../../..'));
const port = Number(process.argv[3] || 8765);
const hashFile = process.argv[4] || path.join(import.meta.dirname, 'served-hashes.json');
const hashes = {};

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function flush() {
  fs.writeFileSync(hashFile, JSON.stringify({ root, files: hashes }, null, 2));
}

const server = http.createServer((req, res) => {
  let pathname = '/';
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { /* keep / */ }
  let file = path.normalize(path.join(root, pathname));
  if (!file.startsWith(root)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const rel = path.relative(root, file);
    hashes[rel] = crypto.createHash('sha256').update(buf).digest('hex');
    res.writeHead(200, {
      'content-type': types[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    res.end(buf);
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write('serving ' + root + ' on 127.0.0.1:' + port + '\n');
});
process.on('SIGTERM', () => { flush(); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { flush(); server.close(() => process.exit(0)); });
setInterval(flush, 2000).unref();

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/icon.svg', ['icon.svg', 'image/svg+xml']],
  ...['app', 'engine', 'levels', 'progress'].map(name => [`/src/${name}.js`, [`src/${name}.js`, 'text/javascript; charset=utf-8']]),
]);
const port = Number(process.env.PORT ?? 7860), host = process.env.HOST ?? '127.0.0.1';
const server = createServer(async (req, res) => {
  const common = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-cache', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { ...common, Allow: 'GET, HEAD' }); res.end(); return; }
  let path;
  try { path = new URL(req.url, 'http://localhost').pathname; } catch { res.writeHead(400, common); res.end(); return; }
  const file = files.get(path);
  if (!file) { res.writeHead(404, { ...common, 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return; }
  try {
    const body = await readFile(resolve(root, file[0]));
    res.writeHead(200, { ...common, 'Content-Type': file[1], 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500, common); res.end('Unable to load application'); }
});
server.listen(port, host, () => console.log(`Echo Dispatch: http://${host}:${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));

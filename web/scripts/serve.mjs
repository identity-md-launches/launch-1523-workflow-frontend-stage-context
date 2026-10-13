import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';

const root = fileURLToPath(new URL('../../dist/', import.meta.url));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
export function preview() {
  return createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/preview/')) { response.writeHead(404); response.end(); return; }
    const file = resolve(root, decodeURIComponent(url.pathname.slice('/preview/'.length) || 'index.html'));
    if (!file.startsWith(root)) { response.writeHead(403); response.end(); return; }
    try { const body = await readFile(file); response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(body); }
    catch { response.writeHead(404); response.end(); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = preview();
  server.listen(0, '0.0.0.0', () => console.log(`http://127.0.0.1:${server.address().port}/preview/`));
  setTimeout(() => server.close(), 45 * 60 * 1000).unref();
}

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const root = resolve('dist');
const prefix = '/damang-damang/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary' };
createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (!pathname.startsWith(prefix)) return response.writeHead(404).end();
  let file;
  try { file = resolve(root, decodeURIComponent(pathname.slice(prefix.length)) || 'index.html'); }
  catch { return response.writeHead(400).end(); }
  if (!file.startsWith(root + sep)) return response.writeHead(403).end();
  try { response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file)); }
  catch { response.writeHead(404).end(); }
}).listen(4174, '127.0.0.1', () => console.log('Production game: http://127.0.0.1:4174/damang-damang/'));

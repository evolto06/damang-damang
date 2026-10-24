import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

// Serve the production files strictly beneath a project-site prefix. Root-relative
// asset requests must fail here, as they would on a shared static host.
const root = resolve('dist');
const prefix = '/damang-damang/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return; }
  const file = resolve(root, decodeURIComponent(pathname.slice(prefix.length)) || 'index.html');
  if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(bytes);
  } catch { response.writeHead(404).end(); }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const base = new URL(prefix, 'http://127.0.0.1:' + server.address().port);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  const html = await page.text();
  const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map(match => match[1]).filter(path => !path.startsWith('#') && !/^(?:https?:|data:)/.test(path));
  assert.ok(assets.some(path => path.endsWith('.js')), 'production JavaScript exists');
  assert.ok(assets.some(path => path.endsWith('.css')), 'production CSS exists');
  for (const path of assets) {
    assert.ok(!path.startsWith('/'), 'asset stays relative: ' + path);
    const response = await fetch(new URL(path, base));
    assert.equal(response.status, 200, 'nested asset loads: ' + path);
  }
  const scriptPaths = assets.filter(path => path.endsWith('.js'));
  const scripts = await Promise.all(scriptPaths.map(async path => (await fetch(new URL(path, base))).text()));
  assert.ok(scripts.some(source => source.includes('models/spider.glb')), 'production bundle references the model');
  assert.ok(scripts.every(source => !/["']\/models\/spider\.glb["']/.test(source)), 'model path is not root-relative');
  const model = await fetch(new URL('models/spider.glb', base));
  assert.equal(model.status, 200, 'nested model loads');
  assert.equal(Buffer.from(await model.arrayBuffer()).toString('ascii', 0, 4), 'glTF', 'model is a GLB');
  console.log('Nested deployment check passed: HTML, JS, CSS and GLB under ' + prefix);
} finally {
  await new Promise(resolve => server.close(resolve));
}

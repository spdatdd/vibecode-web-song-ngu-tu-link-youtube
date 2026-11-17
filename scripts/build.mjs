import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Đóng gói giao diện và API vào một mô-đun Worker dùng được trên Sites.
const mimeTypes = {
  'index.html': 'text/html; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8',
  'captions.mjs': 'text/javascript; charset=utf-8',
  'styles.css': 'text/css; charset=utf-8',
  'poster.jpg': 'image/jpeg',
};
const routes = {};
for (const [file, type] of Object.entries(mimeTypes)) {
  const binary = file === 'poster.jpg';
  routes[file === 'index.html' ? '/' : '/' + file] = {
    type,
    binary,
    content: await readFile(new URL('../public/' + file, import.meta.url), binary ? 'base64' : 'utf8'),
  };
}
const worker = await readFile(new URL('../worker/index.mjs', import.meta.url), 'utf8');
const captions = await readFile(new URL('../public/captions.mjs', import.meta.url), 'utf8');
const output = new URL('../dist/server/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('index.js', output), 'const assets = ' + JSON.stringify(routes) + ';\n' + captions + '\n' + worker);

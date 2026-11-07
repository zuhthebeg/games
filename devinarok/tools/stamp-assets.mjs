import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const indexPath = join(root, 'index.html');
const hashOf = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 10);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : /\.m?js$/.test(entry.name) ? [path] : [];
  });
}

function stampedIndex() {
  const imports = {};
  for (const file of [...walk(join(root, 'js')), ...walk(join(root, 'vendor'))].sort()) {
    const url = `./${relative(root, file).split('\\').join('/')}`;
    imports[url] = `${url}?v=${hashOf(file)}`;
  }
  imports.three = `./vendor/three-0.187.0/three.module.min.js?v=${hashOf(join(root, 'vendor/three-0.187.0/three.module.min.js'))}`;
  imports['three/addons/'] = './vendor/three-0.187.0/addons/';
  for (const path of ['loaders/GLTFLoader.js', 'utils/SkeletonUtils.js', 'utils/BufferGeometryUtils.js', 'libs/meshopt_decoder.module.js']) {
    const url = `./vendor/three-0.187.0/addons/${path}`;
    imports[`three/addons/${path}`] = `${url}?v=${hashOf(join(root, url.slice(2)))}`;
  }
  const map = JSON.stringify({ imports }, null, 2).replace(/\n/g, '\n    ');
  let html = readFileSync(indexPath, 'utf8');
  html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/,
    `<script type="importmap">\n    ${map}\n    </script>`);
  html = html.replace(/src="js\/main\.js(?:\?v=[0-9a-f]+)?"/, `src="js/main.js?v=${hashOf(join(root, 'js/main.js'))}"`);
  html = html.replace(/href="css\/game\.css(?:\?v=[0-9a-f]+)?"/, `href="css/game.css?v=${hashOf(join(root, 'css/game.css'))}"`);
  return html;
}

const next = stampedIndex();
if (process.argv.includes('--check')) {
  if (next !== readFileSync(indexPath, 'utf8')) throw new Error('devinarok/index.html is stale');
} else if (next !== readFileSync(indexPath, 'utf8')) {
  writeFileSync(indexPath, next);
  console.log('devinarok/index.html stamped');
} else console.log('devinarok/index.html already current');

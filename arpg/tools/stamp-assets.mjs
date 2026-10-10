// Cache-busting for a build-less site: game.cocy.io serves JS with max-age=14400,
// HTML with max-age=600. A fresh index.html loading a stale module crashes the boot.
// This rewrites index.html so every module/stylesheet URL carries a content hash:
//   - <script type="importmap"> maps each js/** module to "?v=<hash>"
//   - the entry <script> and the stylesheet <link> get "?v=<hash>" directly
// Unchanged files keep their hash, so browser caches stay warm across deploys.
// Run after changing any arpg/js or arpg/css file:  node arpg/tools/stamp-assets.mjs
// `--check` exits non-zero when index.html is stale (used by the test suite).
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const indexPath = join(root, 'index.html');

const hashOf = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 10);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.m?js$/.test(entry.name) ? [path] : [];
  });
}

export function stampedIndex() {
  const modules = [...walk(join(root, 'js')), ...walk(join(root, 'vendor'))].sort();
  const imports = {};
  for (const file of modules) {
    const url = `./${relative(root, file).split('\\').join('/')}`;
    imports[url] = `${url}?v=${hashOf(file)}`;
  }
  const importMap = JSON.stringify({ imports }, null, 2).replace(/\n/g, '\n    ');
  let html = readFileSync(indexPath, 'utf8');
  const block = `<script type="importmap">\n    ${importMap}\n    </script>`;
  if (/<script type="importmap">[\s\S]*?<\/script>/.test(html)) {
    html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, block);
  } else {
    // The import map must precede every module script.
    html = html.replace(/(\n\s*)<link rel="stylesheet"/, `$1${block}$1<link rel="stylesheet"`);
  }
  html = html.replace(/src="js\/main\.js(\?v=[0-9a-f]+)?"/, `src="${imports['./js/main.js']}"`.replace('./', ''));
  html = html.replace(/href="css\/game\.css(\?v=[0-9a-f]+)?"/,
    `href="css/game.css?v=${hashOf(join(root, 'css', 'game.css'))}"`);
  return html;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const next = stampedIndex();
  const current = readFileSync(indexPath, 'utf8');
  if (process.argv.includes('--check')) {
    if (next !== current) {
      console.error('arpg/index.html is stale: run node arpg/tools/stamp-assets.mjs');
      process.exit(1);
    }
  } else if (next !== current) {
    writeFileSync(indexPath, next);
    console.log('arpg/index.html stamped');
  } else {
    console.log('arpg/index.html already current');
  }
}

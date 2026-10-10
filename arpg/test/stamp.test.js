import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stampedIndex } from '../tools/stamp-assets.mjs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('index.html cache-busting stamps match current js/css contents', () => {
  assert.equal(index, stampedIndex(), 'run: node arpg/tools/stamp-assets.mjs');
});

test('import map precedes the entry module and versions it', () => {
  const mapAt = index.indexOf('<script type="importmap">');
  const entryAt = index.search(/<script type="module" src="js\/main\.js\?v=[0-9a-f]{10}"/);
  assert.ok(mapAt > 0 && entryAt > mapAt);
  const imports = JSON.parse(index.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  assert.ok(imports['./js/input.js'].startsWith('./js/input.js?v='));
  assert.ok(imports['./js/sim/world.js']);
});

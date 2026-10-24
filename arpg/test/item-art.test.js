import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ITEMS } from '../js/meta/items.js';
import { itemArtKey, itemArtPath } from '../js/ui/item-art.js';
import { itemIcon, icon } from '../js/ui/icons.js';

const assets = new URL('../assets/items/', import.meta.url);
const records = JSON.parse(readFileSync(new URL('manifest.json', assets)));

test('all existing item IDs including wood resolve local reviewed art', () => {
  const used = new Set();
  for (const [id, definition] of Object.entries(ITEMS)) {
    const key = itemArtKey(id, definition);
    assert.ok(key, `uncovered item ${id}`);
    const path = itemArtPath(key);
    assert.ok(/^assets\/items\/[a-z0-9-]+\.webp$/.test(path), path);
    assert.ok(existsSync(new URL('../'+path, import.meta.url)), `${id}: ${path}`);
    const html = itemIcon(id, definition);
    assert.ok(html.includes('<picture>') && html.includes('<svg'), id);
    assert.ok(html.includes('alt=""') && html.includes('aria-hidden="true"'), id);
    assert.ok(html.includes('loading="lazy"') && html.includes('decoding="async"'), id);
    assert.ok(!html.includes('onerror=') && !html.includes('https:'), id);
    used.add(path.split('/').pop());
  }
  assert.deepEqual([...used].sort(), records.filter(r=>!/^scroll-(?:enchant|blessed)-(?:weapon|armor)\.webp$/.test(r.file)).map(r=>r.file).sort(), 'no unused active icons (retired enchant art is not loaded)');
});

test('rarity/affix variants share base art; real forms and hunt tiers stay meaningful', () => {
  for (const [id, definition] of Object.entries(ITEMS)) {
    if (definition.baseId) assert.equal(itemArtKey(id, definition), itemArtKey(definition.baseId, ITEMS[definition.baseId]));
  }
  assert.notEqual(itemArtKey('training_sword', ITEMS.training_sword), itemArtKey('rune_blade', ITEMS.rune_blade));
  assert.notEqual(itemArtKey('rune_blade', ITEMS.rune_blade), itemArtKey('warden_blade', ITEMS.warden_blade));
  assert.notEqual(itemArtKey('short_bow', ITEMS.short_bow), itemArtKey('pack_bow', ITEMS.pack_bow));
  assert.equal(itemArtKey('goblin_cleaver', ITEMS.goblin_cleaver), 'cleaver');
  assert.equal(itemArtKey('chief_maul', ITEMS.chief_maul), 'maul');
  assert.equal(itemArtKey('cloth_tunic', ITEMS.cloth_tunic), 'body-cloth');
  assert.equal(itemArtKey('warden_plate', ITEMS.warden_plate), 'body-plate');
  assert.ok(!records.some(r=>/crossbow|pistol|sneakers|garden_glove|item_helmet/.test(r.source)));
});

test('empty sockets and unknown/missing art retain SVG; forge gets real stone pictures', () => {
  for (const slot of ['weapon','head','body','hands','feet']) assert.ok(!icon(slot).includes('<img'));
  assert.ok(!itemIcon('future-unreviewed-item', {}).includes('<img'));
  assert.equal(itemArtPath('unknown'), null);
  assert.ok(!itemIcon('unknown-family', {slot:'weapon',family:'future'}).includes('<img'));
  for (const id of ['enhance_stone_1','enhance_stone_blessed','enhance_stone_cursed']) assert.ok(itemIcon(id,ITEMS[id]).includes('<picture>'));
  assert.ok(!icon('enhance_stone_3').includes('<picture>'), 'retired greater-stone alias has no active art');
});

test('delivered WebPs match source manifest and stay below legacy 200 KiB + T4 32 KiB total', () => {
  let bytes = 0;
  for (const record of records) {
    const data = readFileSync(new URL(record.file, assets));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF');
    assert.equal(data.toString('ascii', 8, 12), 'WEBP');
    assert.equal(createHash('sha256').update(data).digest('hex'), record.sha256);
    assert.equal(data.length, record.bytes);
    assert.ok(/^[a-f0-9]{64}$/.test(record.sourceSha256));
    bytes += data.length;
  }
  assert.equal(records.filter(r=>r.method.startsWith('original')).length, 38);
  assert.equal(records.filter(r=>r.method.startsWith('reviewed')).length, 5);
  assert.equal(records.filter(r=>r.method.startsWith('derived')).length, 4);
  assert.equal(records.length, 47);
  const t4 = records.filter(r => r.source === 'arpg/tools/item-art-tier4.py');
  assert.equal(t4.length, 11);
  assert.ok(t4.reduce((n,r)=>n+r.bytes,0) < 32*1024);
  assert.ok(records.filter(r=>!t4.includes(r)).reduce((n,r)=>n+r.bytes,0) < 200*1024);
  assert.ok(bytes < 232*1024, `${bytes} bytes`);
});

test('plain, blessed and cursed stones have distinct stone art, never the return-scroll icon', () => {
 const paths=['enhance_stone_1','enhance_stone_blessed','enhance_stone_cursed'].map(id=>itemArtPath(itemArtKey(id,ITEMS[id])));
 assert.equal(new Set(paths).size,3);assert.ok(paths.every(path=>path&&path!==itemArtPath('return_scroll')));
});

test('wood has its own timber picture and matching SVG fallback, not leather/ore/load', () => {
  assert.equal(itemArtKey('wood', ITEMS.wood), 'wood');
  assert.equal(itemArtPath('wood'), 'assets/items/wood.webp');
  const record = records.find(r => r.file === 'wood.webp');
  assert.equal(record.source, 'arpg/assets/items/wood-art.py');
  assert.equal(record.sourceSha256, createHash('sha256').update(readFileSync(new URL('wood-art.py', assets))).digest('hex'));
  const html = itemIcon('wood', ITEMS.wood);
  assert.match(html, /src="assets\/items\/wood.webp"/);
  assert.match(html, /icon-wood silhouette/);
  assert.notEqual(html.match(/<svg.*<\/svg>/)[0], icon('load'));
  assert.notEqual(itemArtPath('wood'), itemArtPath('hide'));
  assert.notEqual(itemArtPath('wood'), itemArtPath('rune_shard'));
});

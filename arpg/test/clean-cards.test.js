import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../js/meta/items.js';
import { cardHtml } from '../js/ui/gear-view.js';
import { GRADES } from '../js/ui/gear-view.js';

const save = (over = {}) => ({ level: 1, stats: { str: 10, dex: 10, int: 10, con: 10 }, items: [], equipped: {}, lineage: 'human', ...over });

test('armor names never expose internal class/tier tokens', () => {
  for (const [id, def] of Object.entries(ITEMS)) {
    if (!def?.name) continue;
    assert.doesNotMatch(def.name, /\b(light|medium|heavy)\b|\bT\d\b/i, id + ': ' + def.name);
  }
});

test('compact inventory card is icon + name only (no rarity duplicate, set prose, option hint, handedness line)', () => {
  const ids = Object.keys(ITEMS).filter(id => ITEMS[id].setId || ITEMS[id].form === 'wand' || ITEMS[id].handedness === 2).slice(0, 20);
  assert.ok(ids.length > 0);
  for (const id of ids) {
    const item = { uid: 'u-' + id, id, enhance: 0, affixes: [] };
    const s = save({ items: [item] });
    const html = cardHtml(item, s, { compact: true });
    const copy = html.split('p2-card-copy')[1] || '';
    assert.doesNotMatch(copy, /class="item-set"|세트 · 착용|옵션 \d+개 변경|자세히|한손 완드 · 방패|방패 장착 불가|twohand-note/, id);
    assert.doesNotMatch(copy, /<small>(일반|양질|희귀|영웅|전설)<\/small>/, id + ' rarity duplicated');
  }
});

test('lock never shows a zero strength requirement', () => {
  for (const [id, def] of Object.entries(ITEMS)) {
    if (!['weapon','head','body','hands','feet','offhand'].includes(def.kind)) continue;
    const item = { uid: 'x', id, enhance: 0, affixes: [] };
    for (const lineage of ['human', 'skeleton_knight']) {
      const html = cardHtml(item, save({ lineage, stats: { str: 1, dex: 1, int: 1, con: 1 } }), { compact: true });
      assert.doesNotMatch(html, /힘 0</, id + ' ' + lineage);
    }
  }
});

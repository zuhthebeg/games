import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave } from '../js/meta/save.js';
import { HubUI } from '../js/ui/hub.js';
import { socketsHtml, cardHtml, getHeroPortrait, comparisonFor, linesHtml } from '../js/ui/gear-view.js';
import { readFileSync } from 'node:fs';

const save = () => createSave({name:'UI 시험',answers:[0,0,0,0,0],createdAt:1});

test('equipment portrait uses a real idle frame for each weapon family', () => {
  for (const weapon of ['blade','bow','focus']) {
    const s = createSave({name:'UI 시험',answers:[0,0,0,0,0],weapon,createdAt:1});
    const p = getHeroPortrait(s);
    const atlas = JSON.parse(readFileSync(new URL('../'+p.url+'.json', import.meta.url)));
    assert.deepEqual(atlas.frames[p.frame].frame, {x:p.x,y:p.y,w:p.width,h:p.height});
    assert.equal(atlas.meta.size.w,p.atlasWidth);
    assert.equal(atlas.meta.size.h,p.atlasHeight);
  }
});

test('five equipment sockets show actual equipment and empty-slot affordances', () => {
  const html = socketsHtml(save());
  assert.equal((html.match(/data-action="socket"/g)||[]).length,5);
  for(const slot of ['weapon','head','body','hands','feet']) assert.ok(html.includes(`data-slot="${slot}"`));
  assert.ok(html.includes('비어 있음'));
  assert.ok(html.includes('starter:weapon') === false, 'socket must not expose an internal uid as a label');
});

test('item cards and comparison rows use real affixes and escape supplied attributes', () => {
  const s=save(); const item={...s.items[0],uid:'"<unsafe>',enhance:1};
  const html=cardHtml(item,s);
  assert.ok(html.includes('&quot;&lt;unsafe&gt;'));
  assert.ok(html.includes('enhance-badge'));
  const comparison=comparisonFor(item,s);
  const rows=linesHtml(comparison);
  assert.ok(rows.includes('data-line="attack"'));
  assert.ok(rows.includes('이득'));
});

test('settlement keeps unrevealed equipment hidden and reveals one item at a time', () => {
  const s=save(); const hub=Object.create(HubUI.prototype); hub.save=s; hub.revealed=0; hub.lootState={};
  const receipt={lootKept:{items:[s.items[0]],stacks:{},gold:0},lootLost:{items:[],stacks:{},gold:0},xpGained:0,xpLost:0,used:{},restored:{},levelsGained:0,statPointsGained:0};
  assert.ok(!hub.receiptHtml(receipt,false).includes('receipt-gear'));
  assert.ok(!hub.revealHtml(receipt).includes('p2-loot-card'));
  hub.revealed=1;
  assert.ok(hub.revealHtml(receipt).includes('p2-loot-card'));
});

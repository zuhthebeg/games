import test from 'node:test';
import { trained } from './fixtures/trained.js';
import assert from 'node:assert/strict';
import { createSave } from '../js/meta/save.js';
import { HubUI } from '../js/ui/hub.js';
import { socketsHtml, cardHtml, getHeroPortrait, comparisonFor, linesHtml } from '../js/ui/gear-view.js';
import { readFileSync } from 'node:fs';
import { addXp } from '../js/meta/progression.js';
import { deriveMods } from '../js/meta/stats.js';
import { attackRate } from '../js/content/balance.js';
import { ABILITIES } from '../js/content/combat.js';
import { BOOKS, learnSkill, equipSkill } from '../js/meta/skills.js';
import { carriedWeight, capacity, instance } from '../js/meta/items.js';
import { amount } from '../js/ui/gear-view.js';

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

function renderHub(s) {
  const h = Object.create(HubUI.prototype);
  Object.assign(h, { save:s, receipt:null, dev:false, recoverVitals:()=>{}, show:(html,page)=>{ h.html=html; h.page=page; } });
  return h;
}

test('inn NPC contract has no owner; unspent points badge lives on the character portrait', () => {
  const h=renderHub(addXp(save(),51));h.showInn();
  assert.ok(h.html.includes('data-action="character"'));
  assert.ok(h.html.includes('캐릭터 · 미분배 8점'));
  assert.doesNotMatch(h.html, /data-action="owner"|약사|교관 · 미분배/);
  for(const name of ['만물상','장비상','대장장이','아카데미','창고','가방']) assert.ok(h.html.includes(`<strong>${name}</strong>`));
  h.action('character',{});assert.equal(h.page,'character');
  for(const label of ['XP','HP / MP','공격력','방어력','공속','<span>기술</span>','지난 여정','allocation-confirm']) assert.ok(h.html.includes(label));
  const mods=deriveMods(h.save), rate=attackRate(mods.attackSpeedBonus,mods.weaponWeight,carriedWeight(h.save)/capacity(h.save));
  assert.ok(h.html.includes(`공속</span><b>${Math.round(rate*100)}`));
  assert.ok(h.html.includes(`방어력</span><b>${Math.round(mods.ac)}`));
  h.showAllocation(true);assert.equal(h.page,'level-up');assert.ok(!h.html.includes('character-summary'));
});

test('trainer shows all three families, exact ability numbers and learned/default equip choices', () => {
  let s={...trained(save()),gold:10000};s=equipSkill(learnSkill(s,'frost_lance'),'focus','frost_lance');
  const h=renderHub(s);h.action('trainer',{});assert.equal(h.page,'trainer');
  assert.equal((h.html.match(/data-action="academy-tab"/g)||[]).length,3);
  assert.ok(!h.html.includes('allocation-row'));
  for(const id of Object.keys(BOOKS).filter(id=>!ABILITIES[id].requiresSkeleton)) {
    const a=ABILITIES[id];h.academyFamily=a.family;h.showTrainer();assert.ok(h.html.includes(a.name));
    for(const chip of [a.executeUndead?'즉사 10%':a.shield?'1회 방어 · 8초':a.heal?`회복 최대 HP ${Math.round(a.heal.maxHpFrac*100)}%`:`피해 ${a.damage}`,`재사용 ${amount(a.cooldownMs/1000)}초`,`${a.manaCost||0} MP`]) assert.ok(h.html.includes(chip));
  }
  assert.ok(h.html.includes('data-id="ember_bolt"'));
  assert.match(h.html,/data-action="skill-slot" data-id="frost_lance" data-slot="\d" data-context="academy" aria-pressed="true"/);
});

test('bag and stash show only their belongings; supply merchant sells both locations and materials', () => {
  const s=save();s.items.push(instance('stored','iron_sword'));s.stash.stacks.potion=7;s.stacks.enhance_stone_1=8;
  const h=renderHub(s);h.showBag();assert.equal(h.page,'bag');assert.ok(h.html.includes('data-destination="stash"'));
  assert.ok(!h.html.includes('강화석'));
  h.showInventory();assert.equal(h.page,'inventory');assert.ok(h.html.includes('data-uid="stored"'));
  assert.ok(!h.html.includes('data-uid="starter:weapon"'));
  h.stashTab='consumable';h.showInventory();assert.ok(h.html.includes('7개'));assert.ok(h.html.includes('data-destination="bag"'));
  h.stashTab='material';h.showInventory();assert.ok(h.html.includes('강화석'));
  h.shopTab='sell';h.showShop();assert.ok(h.html.includes('data-source="stash"'));
  assert.ok(h.html.includes('data-id="enhance_stone_1"'));assert.ok(h.html.includes('전부'));
  assert.ok(!h.html.includes('data-action="sell-shop"'));
});

test('settlement keeps unrevealed equipment hidden and reveals one item at a time', () => {
  const s=save(); const hub=Object.create(HubUI.prototype); hub.save=s; hub.revealed=0; hub.lootState={};
  const receipt={lootKept:{items:[s.items[0]],stacks:{},gold:0},lootLost:{items:[],stacks:{},gold:0},xpGained:0,xpLost:0,used:{},restored:{},levelsGained:0,statPointsGained:0};
  assert.ok(!hub.receiptHtml(receipt,false).includes('receipt-gear'));
  assert.ok(!hub.revealHtml(receipt).includes('p2-loot-card'));
  hub.revealed=1;
  assert.ok(hub.revealHtml(receipt).includes('p2-loot-card'));
});

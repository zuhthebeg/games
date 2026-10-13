import { toOldScale } from './fixtures/old-scale.js';
import { trained } from './fixtures/trained.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STAGES, ABILITIES } from '../js/content/combat.js';
import { REGIONS, MAPS, availableStages, mapUnlocked, arrivalNotice } from '../js/content/world-map.js';
import { createSave, SaveStore, validateSave } from '../js/meta/save.js';
import { ITEMS, instance, enhanceMultiplier } from '../js/meta/items.js';
import { SKILL_DISPLAY, characterSkills, learnSkill, equipSkill } from '../js/meta/skills.js';
import { settleRound } from '../js/meta/run.js';
import { gearPrice } from '../js/meta/shop.js';
import { ECONOMY } from '../js/meta/economy.js';
import { itemDetailsHtml, amount } from '../js/ui/gear-view.js';
import { HubUI } from '../js/ui/hub.js';
const fresh = () => createSave({name:'월드 시험',answers:[0,0,0,0,0],createdAt:1});
const hubFor = save => Object.assign(Object.create(HubUI.prototype), {save, persist:()=>{}, show:(html,page)=>{}, lootState:{}, revealed:1, closeSheet:()=>{}, showReceipt:()=>{}});

test('W2 owns 20 existing quests plus independent throne challenge', () => {
  assert.deepEqual([...REGIONS.flatMap(r=>r.maps)].filter(id=>!id.startsWith('M_')).sort(),Object.keys(STAGES).filter(id=>!id.startsWith('M_')).sort());
  assert.equal(REGIONS.length,7);
  assert.deepEqual(MAPS.S14.requires,['S17','S18']);
  for(const [id,prior] of Object.entries({S2:'S1',S5:'S4',S8:'S7',S12:'S10',S11:'S10',S17:'S12',S13:'S11',S16:'S13',S18:'S16',S15:'S14',S19:'S15',S20:'S19'})) assert.deepEqual(MAPS[id].requires,[prior]);
});
test('both fork entrances open at S10, castle unlock is OR and neither branch skips later castle quests', () => {
  const s=fresh(); assert.deepEqual(availableStages(s),['S1']); s.cleared.S10=true;
  assert.ok(mapUnlocked(s,'S11')&&mapUnlocked(s,'S12')); assert.ok(!mapUnlocked(s,'S14'));
  for(const end of ['S17','S18']) {const branch=structuredClone(s);branch.cleared[end]=true;assert.ok(mapUnlocked(branch,'S14'));assert.ok(!mapUnlocked(branch,'S15'));assert.ok(!mapUnlocked(branch,'S20'));assert.ok(!mapUnlocked(branch,end==='S17'?'S18':'S17'));}
  s.cleared.S14=true;assert.ok(mapUnlocked(s,'S15'));s.cleared.S15=true;assert.ok(mapUnlocked(s,'S19'));s.cleared.S19=true;assert.ok(mapUnlocked(s,'S20'));
});
test('historical out-of-order clears remain replayable, debug all-clears open every node, without migration or mutation', () => {
  const s=fresh();s.cleared.S20=true;const before=structuredClone(s);assert.ok(mapUnlocked(s,'S20'));assert.deepEqual(s,before);assert.ok(validateSave(s));
  const old=JSON.parse(readFileSync(new URL('./fixtures/save-v1-s4.json',import.meta.url),'utf8'));
  const v3={...toOldScale(fresh(),3),cleared:{...fresh().cleared,...old.cleared}};delete v3.stash;delete v3.learned;delete v3.skills;
  const storage={getItem:()=>JSON.stringify(v3),setItem:()=>{},removeItem:()=>{}};const migrated=new SaveStore(storage).load();assert.ok(migrated);
  for(const [id,clear] of Object.entries(old.cleared)) if(clear) assert.ok(mapUnlocked(migrated,id));
  s.cleared=Object.fromEntries(Object.keys(STAGES).map(id=>[id,true]));assert.equal(availableStages(s).length,24);
});
test('locked sortie and launch reject action dispatch; coop fallback uses the same graph', () => {
  const h=hubFor(fresh());assert.throws(()=>h.showSortie('S14'),/잠긴/);assert.throws(()=>h.launch('S14'),/잠긴/);
  h.save.cleared.S17=true;h.sortieStage='S14';h.startCoop=(stage)=>assert.equal(stage,'S14');h.action('coop',{});
});
test('board retains 21 legacy and two side-map data-stage hooks and marks locked/completed/current independently', () => {
  const h=hubFor(fresh());h.showInnPanel=(title,html)=>h.html=html;h.showBoard();
  assert.equal((h.html.match(/data-stage=/g)||[]).length,24);assert.match(h.html,/data-stage="S1" class="contract depart" aria-current="step"/);assert.match(h.html,/data-stage="S14" class="contract lock" disabled/);
  h.save.cleared.S17=true;h.mapRegion='castle';h.showBoard();assert.match(h.html,/data-stage="S14" class="contract depart"/);
});
test('arrival notice contains actual region and quest, cleared maps are not called new', () => {
  const s=fresh();assert.equal(arrivalNotice(s,'S12'),`녹슨 광산 · 새 퀘스트: ${STAGES.S12.name}`);s.cleared.S12=true;assert.ok(!arrivalNotice(s,'S12').includes('새 퀘스트'));
});
test('display-only catalog sorts learned + default grades descending and same-grade order stays stable', () => {
  let s={...trained(fresh()),gold:10000};for(const id of ['flame_ring','whirl','heavy_cleave','frost_lance'])s=learnSkill(s,id);
  assert.deepEqual(characterSkills(s),['heavy_cleave','flame_ring','whirl','frost_lance','lunge','volley','ember_bolt']);
  assert.deepEqual(characterSkills(fresh()),['lunge','volley','ember_bolt']);assert.equal(SKILL_DISPLAY.heavy_cleave.label,'상급');assert.equal(SKILL_DISPLAY.whirl.label,'숙련');assert.equal(SKILL_DISPLAY.lunge.label,'입문');
});
test('every learned skill detail uses real damage/range/MP/cooldown/effects and equipped marker', () => {
  let s={...trained(fresh()),gold:10000};for(const id of Object.keys(SKILL_DISPLAY).filter(id=>!['lunge','volley','ember_bolt'].includes(id)))s=learnSkill(s,id);
  s=equipSkill(s,'focus','frost_lance');const h=hubFor(s);h.mountSheet=html=>h.html=html;
  for(const id of characterSkills(s)) {h.openSkill(id);const a=ABILITIES[id];assert.ok(h.html.includes(a.heal?`최대 HP ${Math.round(a.heal.maxHpFrac*100)}%</dd>`:`>${a.damage}</dd>`));assert.ok(h.html.includes(`${a.manaCost||0} MP`));assert.ok(h.html.includes(`${amount(a.cooldownMs/1000)}초`));assert.ok(h.html.includes(`${a.projectile?.rangePx||a.dash?.distance||a.heal?.radius||a.shape?.range||a.shape?.radius} px`));assert.ok(a.heal?!h.html.includes('기본 피해'):h.html.includes(`경직 위력 ${a.poise}`));}
  h.openSkill('frost_lance');assert.match(h.html,/id="skill-slot-\d" data-id="frost_lance" data-slot="\d" aria-pressed="true"/);assert.match(h.html,/관통 2회/);
});
test('full item details show actual base/enhancement/HP and every option with honest units even own item zero-deltas', () => {
  const weapon={...instance('detail','iron_sword_epic',0,[]),enhance:4,affixes:[{k:'atk_pct',v:6},{k:'capacity_flat',v:3},{k:'mana_pct',v:4}]};
  const html=itemDetailsHtml(weapon);assert.ok(html.includes(`×${amount(ITEMS[weapon.id].power*enhanceMultiplier(4))}`));assert.match(html,/\+6%/);assert.match(html,/\+3 kg/);assert.match(html,/\+4%/);assert.match(html,/종류/);
  const armor=itemDetailsHtml({...instance('armor','leather_vest'),enhance:2});assert.ok(armor.includes(`${ITEMS.leather_vest.ac} +2`));assert.match(armor,/방어력/);assert.doesNotMatch(armor,/HP 보호|DEF 수치|가벼울수록/);
  for(const k of ['hp_flat','speed_pct','dodge_pct','potion_pct','gold_pct','material_pct']) assert.ok(itemDetailsHtml({...weapon,affixes:[{k,v:2}]}).includes(`data-detail="${k}"`));
  const h=hubFor(fresh());h.mountSheet=html=>h.html=html;h.showSocket('weapon');assert.match(h.html,/data-detail="attack"/);assert.doesNotMatch(h.html,/= 유지|compare-sheet/);assert.match(h.html,/교체 후보/);
  h.openItem('starter:weapon');assert.match(h.html,/data-detail="attack"/);assert.match(h.html,/장비 정보/);assert.doesNotMatch(h.html,/추가 옵션 없음|compare-sheet/);
});
test('reveal sale uses actual owned settled loot, pays once, blocks worn and missing items, receipt reload never resurrects gear', () => {
  const drop=instance('drop:test','iron_sword',1,[]),base=fresh();
  const settled=settleRound(base,{stageId:'S2',terminal:'return_scroll',tempLoot:{items:[drop],stacks:{},gold:0}});
  const h=hubFor(settled.save);h.pendingReceipt={receipt:settled.receipt};h.showReceipt=()=>{};
  const html=h.revealHtml(settled.receipt);assert.match(html,/loot-sell/);assert.match(html,/마을로 돌아가면 자동 보관/);assert.ok(!html.includes('loot-keep'));
  const gold=h.save.gold;h.action('loot-sell',{uid:drop.uid});assert.equal(h.save.gold,gold+Math.floor(gearPrice(drop)*ECONOMY.sellFraction));assert.ok(!h.save.items.some(i=>i.uid===drop.uid));assert.throws(()=>h.action('loot-sell',{uid:drop.uid}));assert.equal(h.save.gold,gold+Math.floor(gearPrice(drop)*ECONOMY.sellFraction));assert.throws(()=>h.action('loot-sell',{uid:'starter:weapon'}),/装|장착/);
  let raw;const storage={setItem:(_,v)=>raw=v,getItem:()=>raw};new SaveStore(storage).save(h.save);const reloaded=new SaveStore(storage).load();assert.ok(reloaded);assert.ok(!reloaded.items.some(i=>i.uid===drop.uid));
  const loadedHub=hubFor(reloaded);assert.match(loadedHub.revealHtml(reloaded.lastReceipt),/보유하지 않음/);assert.ok(!loadedHub.revealHtml(reloaded.lastReceipt).includes('loot-sell'));
});

test('quest selection header and departure show actual player level beside recommendations', () => {
  const previous = globalThis.matchMedia;
  globalThis.matchMedia = () => ({matches:false});
  try {
    for (const level of [1, 10, 20]) {
      const s=fresh();s.level=level;s.cleared.S17=true;
      const h=hubFor(s);h.mapRegion='castle';
      h.showInnPanel=(title,html,panel,footer,options)=>{h.html=html;h.options=options;};
      h.showBoard();
      assert.match(h.options.eyebrow,new RegExp(`내 레벨 ${level}`));
      assert.ok(h.html.includes(`내 Lv.${level} · 추천 Lv.`));
      h.showSortie('S14');
      assert.ok(h.html.includes(`내 레벨 <b>${level}</b> · 추천 레벨`));
      assert.equal(h.panel,undefined,'recommendation adds no level-based lock');
    }
  } finally {globalThis.matchMedia=previous;}
});

test('QS1 normal swamp card, S11-only gate, low-level sortie/coop and side-clear independent main progress',()=>{
 const previous=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:false});
 try {
  const h=hubFor(fresh());h.mapRegion='swamp';h.showInnPanel=(title,html,panel,footer,options)=>{h.html=html;h.footer=footer;h.options=options;};h.showBoard();
  assert.match(h.html,/data-stage="M_MARSH_MARKERS" class="contract lock" disabled/);assert.throws(()=>h.showSortie('M_MARSH_MARKERS'),/잠긴/);
  h.save.cleared.S11=true;h.showBoard();assert.match(h.html,/곁가지 · QS1/);assert.match(h.html,/맵: 늪 우회길/);assert.match(h.options.eyebrow,/1 \/ 20 완료/);
  h.showSortie('M_MARSH_MARKERS');assert.match(h.html,/목표: 길 표식 0\/3/);assert.match(h.html,/추천: Lv12 \/ T3/);assert.match(h.footer,/data-action="launch"/);h.startCoop=stage=>assert.equal(stage,'M_MARSH_MARKERS');h.action('coop',{});
  h.save.cleared.M_MARSH_MARKERS=true;h.showBoard();assert.match(h.options.eyebrow,/1 \/ 20 완료/);assert.equal(mapUnlocked(h.save,'S16'),false);
 } finally {globalThis.matchMedia=previous;}
});

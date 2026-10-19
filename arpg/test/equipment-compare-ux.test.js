import test from 'node:test';
import assert from 'node:assert/strict';
import {compareItems} from '../js/meta/compare.js';
import {HubUI} from '../js/ui/hub.js';
import {ITEMS, equippedItem, equip, carriedWeight, capacity} from '../js/meta/items.js';
import {weaponLoadoutCandidate} from '../js/meta/skills.js';
import {shopStock} from '../js/meta/shop.js';
import {splitComparisonHtml} from '../js/ui/gear-view.js';
import {trained} from './weapon-loadout-fixture.js';

function hub(save=trained()) {
  globalThis.document={activeElement:null};
  const h=Object.assign(Object.create(HubUI.prototype),{save,persisted:[],root:{dataset:{page:'inventory'},querySelector:()=>null},lootState:{}});
  h.persist=s=>h.persisted.push(s);h.mountSheet=html=>{h.sheet=html};
  h.returnToPanel=h.showMerchant=h.showReceipt=()=>{};
  return h;
}
function pair() {
  const s=trained(),old=s.items.find(i=>i.uid==='wand'),candidate=s.items.find(i=>i.uid==='staff');
  old.enhance=12;candidate.enhance=7;
  old.affixes=[{k:'int_flat',v:3},{k:'capacity_flat',v:8}];candidate.affixes=[{k:'mana_pct',v:5},{k:'wis_flat',v:4}];
  s.equipped.weapon=old.uid;s.items.find(i=>i.uid==='starter:armor').enhance=9;
  return {s,old,candidate};
}

test('exclude enhancement normalizes only the selected pair; all numerical lines match a zero-pair oracle',()=>{
  const {s,old,candidate}=pair(),snapshot=structuredClone(s),oldSnapshot=structuredClone(old),candidateSnapshot=structuredClone(candidate);
  const expected=compareItems({...old,enhance:0},{...candidate,enhance:0},s);
  const actual=compareItems(old,candidate,s,{ignoreEnhancement:true});
  assert.deepEqual(actual.lines,expected.lines);
  assert.notDeepEqual(actual.lines,compareItems(old,candidate,s).lines);
  assert.equal(actual.lines.find(l=>l.key==='weight').from,ITEMS[old.id].weight);
  assert.equal(actual.lines.find(l=>l.key==='weight').to,ITEMS[candidate.id].weight);
  assert.equal(actual.lines.find(l=>l.key==='enhancePower').delta,0);
  assert.deepEqual(s,snapshot);assert.deepEqual(old,oldSnapshot);assert.deepEqual(candidate,candidateSnapshot);
});
test('base comparison preserves real equip weight, eligibility and shield removal with real enhanced context',()=>{
  const {s,old,candidate}=pair();
  const actual=compareItems(old,candidate,s),base=compareItems(old,candidate,s,{ignoreEnhancement:true});
  for(const key of ['weightAfter','weightLimit','locked','lockReason','removesOffhand'])assert.equal(base[key],actual[key],key);
  assert.equal(base.weightAfter,carriedWeight(equip(s,candidate.uid)));assert.equal(base.weightLimit,capacity(equip(s,candidate.uid)));
  s.stats.str=10;const heavy=s.items.find(i=>i.uid==='blunt');heavy.enhance=12;
  assert.equal(compareItems(old,heavy,s,{ignoreEnhancement:true}).lockReason,`힘 ${ITEMS[heavy.id].requiredStr} 필요`);
});
test('armor base comparison removes selected AC/weight enhancement but retains unrelated enhanced armor',()=>{
  const s=trained(),old=s.items.find(i=>i.uid==='starter:armor');old.enhance=12;
  const candidate={...old,uid:'other-armor',enhance:2,affixes:[{k:'hp_flat',v:7}]};s.items.push(candidate);s.equipped.body=old.uid;
  assert.deepEqual(compareItems(old,candidate,s,{ignoreEnhancement:true}).lines,compareItems({...old,enhance:0},{...candidate,enhance:0},s).lines);
  assert.equal(compareItems(old,candidate,s,{ignoreEnhancement:true}).lines.find(l=>l.key==='ac').delta,0);
});
test('comparison UI defaults actual, explicitly labels base mode and real after-equip context without saving',()=>{
  const {s,candidate}=pair(),h=hub(s),before=structuredClone(s);
  h.openItem(candidate.uid);assert.match(h.sheet,/id="compare-ignore-enhancement"[^>]*type="checkbox"/);
  assert.doesNotMatch(h.sheet,/id="compare-ignore-enhancement"[^>]*checked/);assert.match(h.sheet,/강화 포함 · 실제 능력치/);
  h.ignoreEnhancement=true;h.openItem(candidate.uid);
  assert.match(h.sheet,/id="compare-ignore-enhancement"[^>]*checked/);assert.match(h.sheet,/강화 제외 · 선택한 두 장비 \+0 기준/);
  assert.match(h.sheet,/실제 장착 후 소지/);assert.match(h.sheet,/실제 장착 조건/);
  const html=splitComparisonHtml(candidate,s,{ignoreEnhancement:true});assert.doesNotMatch(html,/data-line="enhance"/);
  assert.deepEqual(h.save,before);assert.equal(h.persisted.length,0);
});
test('same exact form equips immediately once for equip and loot, preserves current skills/raw history',()=>{
  for(const uid of ['sword','blunt','bow','wand','staff'])for(const action of ['equip','loot-equip']){
    const s=trained();s.equipped.weapon=uid;
    s.items.push({...s.items.find(i=>i.uid===uid),uid:'replacement',enhance:5});
    s.weaponLoadouts={'bow:bow':['volley',null,null]};
    const expected=weaponLoadoutCandidate(s,equip(s,'replacement')).save,h=hub(s),before=structuredClone(s);
    h.action(action,{uid:'replacement'});h.action(action,{uid:'replacement'});
    assert.deepEqual(h.save,expected);assert.equal(h.persisted.length,1);assert.equal(h.pendingEquipment,undefined);
    assert.deepEqual(h.save.loadout,before.loadout);assert.deepEqual(h.save.skillMastery,before.skillMastery);
    if(action==='loot-equip')assert.equal(h.lootState.replacement,'장착함');
  }
});
test('same-form purchase is atomic, charges exactly once and keeps current skills; failures never save',()=>{
  const s=trained(),offer=shopStock(s.createdAt,s.shopRefresh).find(i=>ITEMS[i.id].kind==='weapon');
  const def=ITEMS[offer.id],match=s.items.find(i=>ITEMS[i.id].family===def.family&&ITEMS[i.id].form===def.form);s.equipped.weapon=match.uid;
  const h=hub(s),gold=s.gold,slots=structuredClone(s.loadout);
  h.action('buy-equip',{uid:offer.uid});assert.equal(h.pendingEquipment,undefined);assert.equal(h.persisted.length,1);
  assert.equal(h.save.gold,gold-offer.price);assert.deepEqual(h.save.loadout,slots);
  assert.throws(()=>h.action('buy-equip',{uid:offer.uid}));assert.equal(h.persisted.length,1);assert.equal(h.save.gold,gold-offer.price);
  const poor=hub({...s,gold:0}),before=structuredClone(poor.save);assert.throws(()=>poor.action('buy-equip',{uid:offer.uid}),/골드/);assert.deepEqual(poor.save,before);assert.equal(poor.persisted.length,0);
});
test('owned detail entry points share last-footer enhance route even without scrolls; max reason explicit',()=>{
  const h=hub();for(const mode of ['equip','sell']){
    h.openItem('bow',mode);assert.match(h.sheet,/<div class="item-enhance-action">[\s\S]*data-action="socket-forge" data-uid="bow"/);
    assert.match(h.sheet,/<\/div><\/footer><\/dialog>$/);assert.doesNotMatch(h.sheet,/data-action="socket-forge"[^>]*disabled/);
  }
  h.showSocket('weapon');assert.match(h.sheet,/class="item-enhance-action"/);
  h.save.items.find(i=>i.uid==='bow').enhance=12;h.openItem('bow');assert.match(h.sheet,/data-action="socket-forge"[^>]*disabled/);assert.match(h.sheet,/최대 강화 \+12/);
  const offer=shopStock(h.save.createdAt,h.save.shopRefresh)[0];h.openItem(offer.uid,'buy');assert.doesNotMatch(h.sheet,/data-action="socket-forge"/);
  const before=structuredClone(h.save);h.openEnhancement=()=>{h.forgeOpened=true};h.action('socket-forge',{uid:'wand'});
  assert.equal(h.selectedUid,'wand');assert.equal(h.forgeTab,'enhance');assert.equal(h.forgeOpened,true);assert.deepEqual(h.save,before);assert.equal(h.persisted.length,0);
});
test('synthetic comparison UIDs never shadow real owned gear or normalize a different item',()=>{
  const {s,old,candidate}=pair();
  // Valid opaque save UIDs can happen to match the comparison's internal labels.
  s.items.unshift({...candidate,uid:'compare:from',id:'training_sword',enhance:12}, {...old,uid:'compare:to',enhance:11});
  const before=structuredClone(s),expected=compareItems({...old,enhance:0},{...candidate,enhance:0},{...s,items:s.items.filter(i=>!i.uid.startsWith('compare:'))});
  assert.deepEqual(compareItems(old,candidate,s,{ignoreEnhancement:true}).lines,expected.lines);
  assert.deepEqual(s,before);
});

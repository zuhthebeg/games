import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSave} from '../js/meta/save.js';
import {ITEMS} from '../js/meta/items.js';
import {HubUI} from '../js/ui/hub.js';
import {shopStock} from '../js/meta/shop.js';
import {trained} from './weapon-loadout-fixture.js';
function hub(s=trained()) {
 globalThis.document={activeElement:null};
 const h=Object.create(HubUI.prototype);h.save=s;h.root={dataset:{page:'bag'},querySelector:()=>null};h.persisted=[];h.persist=n=>{assert.equal(validateSave(n),true);h.persisted.push(n)};h.mountSheet=html=>{h.html=html;return null};h.returnToPanel=()=>{};h.showReceipt=()=>{};h.showMerchant=()=>{};h.lootState={};return h;
}
test('all three UI entry points are candidate-only, cancel is exact, confirm once',()=>{
 for(const action of ['equip','buy-equip','loot-equip']){
  const h=hub(),uid=action==='buy-equip'?shopStock(h.save.createdAt,h.save.shopRefresh).find(i=>ITEMS[i.id].kind==='weapon'&&(ITEMS[i.id].family!=='blade'||ITEMS[i.id].form==='blunt')).uid:'blunt',before=structuredClone(h.save);
  h.action(action,{uid});assert.equal(h.persisted.length,0);assert.deepEqual(h.save,before);assert.ok(h.pendingEquipment);assert.match(h.html,/무기·스킬 장착/);assert.match(h.html,/현재 스킬로 장착/);assert.match(h.html,/슬롯 3/);
  h.action('weapon-cancel',{});assert.deepEqual(h.save,before);assert.equal(h.pendingEquipment,null);
  h.action(action,{uid});const token=String(h.pendingEquipment.token);h.action('weapon-confirm',{token});h.action('weapon-confirm',{token});assert.equal(h.persisted.length,1);assert.notEqual(h.save.equipped.weapon,before.equipped.weapon);if(action==='buy-equip'){assert.ok(h.save.gold<before.gold);assert.deepEqual(h.save.shopBought,[uid]);}
 }
});
test('stale source/UID/history cannot overwrite, same equipped UID no-op, no-skill fallback warns',()=>{
 const h=hub();h.action('equip',{uid:h.save.equipped.weapon});assert.equal(h.persisted.length,0);assert.equal(h.pendingEquipment,undefined);
 h.action('equip',{uid:'blunt'});const token=String(h.pendingEquipment.token);h.save.gold--;assert.throws(()=>h.action('weapon-confirm',{token}),/변경/);assert.equal(h.persisted.length,0);assert.equal(h.pendingEquipment,null);
 for(const mutate of [s=>s.items=s.items.filter(i=>i.uid!=='blunt'),s=>s.weaponLoadouts={'blade:blunt':['ground_slam',null,null]}]){h.action('equip',{uid:'blunt'});const t=String(h.pendingEquipment.token);mutate(h.save);assert.throws(()=>h.action('weapon-confirm',{token:t}),/변경/);assert.equal(h.persisted.length,0);if(!h.save.items.find(i=>i.uid==='blunt'))h.save.items.push({uid:'blunt',id:'chief_maul',enhance:0,affixes:[],rolledAt:0});}
 const w=hub();w.save.loadout=['ground_slam','lunge',null];w.action('equip',{uid:'wand'});assert.match(w.html,/사용 불가/);assert.match(w.html,/위력/);assert.match(w.html,/현재 스킬 유지/);
});
test('requirement/capacity/purchase failures never create a pending transaction or charge gold',()=>{
 const h=hub();h.save.stats.str=10;const before=structuredClone(h.save);
 assert.throws(()=>h.action('equip',{uid:'blunt'}),/힘/);assert.deepEqual(h.save,before);assert.equal(h.persisted.length,0);assert.equal(h.pendingEquipment,undefined);
 const low=hub();low.save.gold=0;const uid=shopStock(low.save.createdAt,0).find(i=>ITEMS[i.id].kind==='weapon').uid,original=structuredClone(low.save);
 assert.throws(()=>low.action('buy-equip',{uid}),/골드/);assert.deepEqual(low.save,original);assert.equal(low.persisted.length,0);
 const heavy=hub();heavy.save.stacks.potion=10000;const unchanged=structuredClone(heavy.save);
 assert.throws(()=>heavy.action('buy-equip',{uid}),/무게/);assert.deepEqual(heavy.save,unchanged);assert.equal(heavy.persisted.length,0);
});
test('current choice saves the selected set for target; stale confirmation tokens do not accept a newer draft',()=>{
 const h=hub();h.save.weaponLoadouts={'blade:blunt':['ground_slam',null,null]};
 h.action('equip',{uid:'blunt'});const old=String(h.pendingEquipment.token);h.action('weapon-cancel',{});
 h.action('equip',{uid:'blunt'});const token=String(h.pendingEquipment.token);h.action('weapon-confirm',{token:old});assert.equal(h.persisted.length,0);assert.ok(h.pendingEquipment);
 h.action('weapon-confirm',{token,current:'true'});assert.deepEqual(h.save.loadout,['lunge',null,'whirl']);assert.deepEqual(h.save.weaponLoadouts['blade:blunt'],h.save.loadout);
});
test('armor keeps its original immediate equip path and does not introduce weapon history',()=>{
 const h=hub();h.action('equip',{uid:'starter:armor'});assert.equal(h.persisted.length,1);assert.equal(h.pendingEquipment,undefined);assert.equal(h.save.weaponLoadouts,undefined);
});

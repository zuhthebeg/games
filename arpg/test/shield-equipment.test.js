import test from 'node:test';
import assert from 'node:assert/strict';
import {ITEMS, equip, instance, carriedWeight, equippedItem} from '../js/meta/items.js';
import {shopStock,buyGear} from '../js/meta/shop.js';
import {createSave,validateSave,SaveStore} from '../js/meta/save.js';
import {deriveMods} from '../js/meta/stats.js';
import {compareItems} from '../js/meta/compare.js';
import {trained} from './weapon-loadout-fixture.js';
import {equipmentVisual} from '../js/render/paperdoll-state.js';
import {itemDetailsHtml,portraitHtml,socketsHtml} from '../js/ui/gear-view.js';

test('physical shield normal merchant purchase/equip and legacy v5 missing-offhand reload remain valid',()=>{
 let s=trained();delete s.equipped.offhand;assert.ok(validateSave(s));
 const original=structuredClone(s), stock=shopStock(s.createdAt,s.shopRefresh),offer=stock.find(i=>ITEMS[i.id].kind==='offhand');assert.ok(offer,'normal merchant shield');
 s=buyGear(s,offer.uid);const item=s.items.at(-1);s=equip(s,item.uid);assert.equal(deriveMods(s).offhand,'shield');assert.equal(equippedItem(s,'offhand').uid,item.uid);assert.ok(validateSave(s));
 const mem=new Map(),store=new SaveStore({getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)});store.save(s);assert.deepEqual(store.load(),s);assert.equal(original.equipped.offhand,undefined);
 assert.equal(ITEMS[item.id].ac,0);assert.match(itemDetailsHtml(item),/막기/);assert.match(socketsHtml(s),/방패/);assert.match(portraitHtml(s),/offhand/);
});
test('shield only equips with blade, switching bow/focus unequips atomically, keeps inventory and weight truthfully compares',()=>{
 let s=trained();const item=instance('shield','round_shield');s.items.push(item);s=equip(s,'shield');const weight=carriedWeight(s);
 assert.equal(equipmentVisual(s).offhand,'shield');
 for(const uid of ['bow','wand','staff']) {
  const preview=compareItems(equippedItem(s,'weapon'),s.items.find(i=>i.uid===uid),s);assert.equal(preview.removesOffhand,true);
  const next=equip(s,uid);assert.equal(next.equipped.offhand,null);assert.equal(deriveMods(next).offhand,undefined);assert.equal(next.items.some(i=>i.uid==='shield'),true);assert.ok(carriedWeight(next)<weight);assert.ok(validateSave(next));
  assert.throws(()=>equip(next,'shield'),/방패/);assert.equal(compareItems(null,item,next).locked,true);
 }
 const blunt=equip(s,'blunt');assert.equal(deriveMods(blunt).offhand,'shield');
});
test('shield rarity variants never accidentally grant passive AC and fresh saves have optional empty socket',()=>{
 for(const def of Object.values(ITEMS).filter(d=>d.kind==='offhand'))assert.equal(def.ac,0);
 assert.equal(createSave({name:'a',weapon:'blade',answers:[0,0,0,0,0],createdAt:1}).equipped.offhand,null);
 const invalid=trained();invalid.items.push(instance('shield','round_shield'));invalid.equipped.offhand='shield';invalid.equipped.weapon='bow';assert.equal(validateSave(invalid),false);
});

test('code-native physical shield poses depend on real equipment and facing/block depth, not magical shield status',async()=>{
 const {physicalShieldPose}=await import('../js/render/physical-shield.js');
 assert.equal(physicalShieldPose({kind:'player',weapon:'blade',shieldUntil:999,facing:0}),null);
 const p={kind:'player',weapon:'blade',offhand:'shield',facing:0};const idle=physicalShieldPose(p),block=physicalShieldPose({...p,shieldGuard:{left:2,facing:0}});assert.ok(idle);assert.ok(block.x>idle.x);
 assert.equal(physicalShieldPose({...p,facing:-Math.PI/2}).behind,true);assert.equal(physicalShieldPose({...p,facing:Math.PI/2}).behind,false);assert.equal(physicalShieldPose({...p,weapon:'focus'}),null);
});

test('human shield socket removes equipment without deleting, charging or resetting the item',async()=>{
 const {HubUI}=await import('../js/ui/hub.js');let s=trained();s.items.push(instance('shield','round_shield'));s=equip(s,'shield');const before=structuredClone(s);
 const hub=Object.assign(Object.create(HubUI.prototype),{save:s,commit(next){this.save=next;},returnToPanel(){}});
 hub.action('unequip',{slot:'offhand',uid:'shield'});assert.equal(hub.save.equipped.offhand,null);assert.deepEqual(hub.save.items,before.items);assert.equal(hub.save.gold,before.gold);assert.ok(validateSave(hub.save));
});

test('destroyed sword fallback to focus also removes shield atomically without losing owned shield',async()=>{
 const {enchant}=await import('../js/meta/enchant.js');let s=trained();s.items=s.items.filter(i=>ITEMS[i.id].slot!=='weapon'||['sword','wand'].includes(i.uid));s.items.push(instance('shield','round_shield'));s=equip(s,'sword');s=equip(s,'shield');s.items.find(i=>i.uid==='sword').enhance=11;s.stacks.enhance_stone_1=100;
 let next;for(let count=0;count<100;count++){s.enchantCount=count;const result=enchant(s,'sword','enhance_stone_1');if(result.result.outcome==='destroyed'){next=result.save;break;}}
 assert.ok(next);assert.equal(next.equipped.weapon,'wand');assert.equal(next.equipped.offhand,null);assert.ok(next.items.some(i=>i.uid==='shield'));assert.ok(validateSave(next));
});

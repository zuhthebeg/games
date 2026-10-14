import test from 'node:test';
import assert from 'node:assert/strict';
import * as skills from '../js/meta/skills.js';
import {createSave, validateSave, SaveStore, SAVE_KEY} from '../js/meta/save.js';
import {equip, ITEMS} from '../js/meta/items.js';

import {trained} from './weapon-loadout-fixture.js';
const swap=(s,uid,keepCurrent=false)=>skills.weaponLoadoutCandidate(s,equip(s,uid),{keepCurrent});

test('five actual form keys, no UID memories',()=>{
 const s=trained();for(const [uid,key] of [['sword','blade:sword'],['blunt','blade:blunt'],['bow','bow:bow'],['wand','focus:wand'],['staff','focus:staff']])assert.equal(skills.weaponLoadoutKey(equip(s,uid)),key);
});
test('old legacy family history is not proof of unseen blunt; outgoing sword only seeded',()=>{
 const s=trained();s.loadouts={blade:['heavy_cleave','whirl',null],focus:['ember_bolt',null,null]};const before=structuredClone(s);const c=swap(s,'blunt');
 assert.deepEqual(s,before);assert.deepEqual(c.save.loadout,s.loadout);assert.deepEqual(c.save.loadouts,s.loadouts);assert.equal(c.reason,'unseen');
 assert.deepEqual(Object.keys(c.save.weaponLoadouts).sort(),['blade:blunt','blade:sword']);assert.deepEqual(c.save.weaponLoadouts['blade:sword'],s.loadout);
});
test('sword/blunt restores learned sets with indices/null retained and no costs/relearning',()=>{
 let s=trained();s=swap(s,'blunt').save;s.loadout=['ground_slam',null,'armor_break'];s=swap(s,'sword').save;
 assert.deepEqual(s.loadout,['lunge',null,'whirl']);s=swap(s,'blunt').save;assert.deepEqual(s.loadout,['ground_slam',null,'armor_break']);assert.equal(s.gold,10000);assert.deepEqual(s.skillMastery,{lunge:1500,ground_slam:932,whirl:501});
});
test('wand/staff independent history, bow remembered, same-form new UID keeps current',()=>{
 let s=trained();s=swap(s,'wand').save;s.loadout=['ember_bolt',null,'frost_lance'];s=swap(s,'staff').save;s.loadout=['healing_light','flame_ring',null];s=swap(s,'wand').save;assert.deepEqual(s.loadout,['ember_bolt',null,'frost_lance']);s=swap(s,'staff').save;assert.deepEqual(s.loadout,['healing_light','flame_ring',null]);
 s=swap(s,'bow').save;s.loadout=['volley',null,'pierce_shot'];s=swap(s,'wand').save;s=swap(s,'bow').save;assert.deepEqual(s.loadout,['volley',null,'pierce_shot']);
 s.weaponLoadouts['bow:bow']=['volley',null,null];s.items.push({...s.items.find(i=>i.uid==='bow'),uid:'bow2'});assert.deepEqual(swap(s,'bow2').save.loadout,s.loadout);
});
test('blocked remembered slots null, weakened usable retained; no usable history keeps CURRENT untouched',()=>{
 const s=trained();s.weaponLoadouts={'blade:sword':['ground_slam','lunge','armor_break']};s.equipped.weapon='blunt';
 assert.deepEqual(swap(s,'sword').save.loadout,[null,'lunge',null]);
 s.weaponLoadouts['focus:wand']=['ground_slam',null,'armor_break'];assert.deepEqual(swap(s,'wand').save.loadout,s.loadout);assert.equal(swap(s,'wand').reason,'unusable');
 s.weaponLoadouts['focus:wand']=['lunge',null,'ember_bolt'];assert.deepEqual(swap(s,'wand').save.loadout,['lunge',null,'ember_bolt']);
 s.weaponLoadouts['focus:wand']=[null,null,null];assert.deepEqual(swap(s,'wand').save.loadout,s.loadout);
});
test('current choice overrides known target, identical UID no-op',()=>{
 const s=trained();s.weaponLoadouts={'blade:blunt':['ground_slam',null,null]};assert.deepEqual(swap(s,'blunt',true).save.loadout,s.loadout);assert.equal(swap(s,s.equipped.weapon).save,s);
});
test('optional map strict whitelist, dense three learned registered unique entries',()=>{
 const s=trained();assert.equal(validateSave(s),true);
 for(const map of [null,[],{'blade:axe':['lunge',null,null]},{'blade:sword':['wat',null,null]},{'blade:sword':['lunge','lunge',null]},{'blade:sword':['lunge',null]},{'blade:sword':[undefined,null,null]}]){assert.equal(validateSave({...s,weaponLoadouts:map}),false,JSON.stringify(map));}
 const unknown=structuredClone(s);unknown.learned=[];unknown.weaponLoadouts={'blade:blunt':['ground_slam',null,null]};assert.equal(validateSave(unknown),false);assert.throws(()=>swap(unknown,'blunt'));
});
test('old save and five-form history roundtrip preserve raw mastery/MAX30 and legacy/API',()=>{
 const s=trained(),data=new Map(),store=new SaveStore({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)});
 s.loadouts={blade:['lunge',null,'whirl']};store.save(s);assert.equal(JSON.parse(data.get(SAVE_KEY)).weaponLoadouts,undefined);assert.deepEqual(store.load(),s);
 let n=swap(s,'blunt').save;n.weaponLoadouts={...n.weaponLoadouts,'bow:bow':['volley',null,null],'focus:wand':['ember_bolt',null,null],'focus:staff':['healing_light',null,null]};store.save(n);assert.deepEqual(store.load(),n);assert.equal(SAVE_KEY,'arpg.save.v1');assert.deepEqual(skills.withFamilyLoadout(s,equip(s,'blunt')),equip(s,'blunt'));
});
test('malformed current slots are rejected; missing pre-K2 slots migrate; all-null slots stay null',()=>{
 for(const slots of [['missing',null,null],['ground_slam',null,null],['lunge','lunge',null],Array(3)]){
  const s=trained();s.loadout=slots;if(slots[0]==='ground_slam')s.learned=[];assert.throws(()=>swap(s,'blunt'),/스킬/);
 }
 const s=trained();delete s.loadout;assert.equal(validateSave(s),true);assert.equal(validateSave(swap(s,'blunt').save),true);
 s.loadout=[null,null,null];assert.deepEqual(swap(s,'blunt').save.loadout,[null,null,null]);
});

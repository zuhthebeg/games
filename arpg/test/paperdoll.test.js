import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave } from '../js/meta/save.js';
import { ITEMS, instance } from '../js/meta/items.js';
import { equipmentVisual, paperdollEnabled } from '../js/render/paperdoll-state.js';
import { PaperdollLibrary } from '../js/render/paperdoll-library.js';
const save = () => createSave({name:'외형',answers:[0,0,0,0,0],weapon:'blade',createdAt:1});
function wear(s, id) {const next=structuredClone(s),slot=ITEMS[id].slot;next.items.push(instance(id,id));next.equipped[slot]=id;return next;}
test('B descriptor is gear-derived, armour independent of kit, save unchanged',()=>{
  let s=save();const before=JSON.stringify(s);const naked=equipmentVisual(s);
  assert.equal(naked.head,'none');assert.equal(naked.weapon,'standard');assert.equal(JSON.stringify(s),before);
  s=wear(s,'head_light_common_t1');assert.equal(equipmentVisual(s).head,'mage');
  s=wear(s,'head_medium_common_t1');assert.equal(equipmentVisual(s).head,'barbarian');
  s=wear(s,'head_heavy_common_t1');assert.equal(equipmentVisual(s).head,'knight');
  s=wear(s,'hands_medium_fine_t1');s=wear(s,'feet_heavy_fine_t1');
  assert.ok(equipmentVisual(s).colours.every(Boolean));
  const old=equipmentVisual(s);s=wear(s,'short_bow');const bow=equipmentVisual(s);
  assert.equal(bow.kit,'bow');assert.equal(bow.weapon,'alternate');assert.deepEqual(old.colours,bow.colours);assert.equal(old.head,bow.head);
  s=wear(s,'hunter_bow');assert.equal(equipmentVisual(s).weapon,'standard');
  s=wear(s,'chief_maul');assert.equal(equipmentVisual(s).weapon,'alternate');
  s=wear(s,'apprentice_wand');assert.equal(equipmentVisual(s).weapon,'alternate');
  s=wear(s,'altar_staff');assert.equal(equipmentVisual(s).weapon,'standard');
  assert.notEqual(equipmentVisual(wear(save(),'leather_vest')).key,naked.key);
  assert.equal(equipmentVisual(wear(save(),'chief_maul_epic')).weapon,'alternate');
});
test('query-only original art switch; no persistent or new setting',()=>{
  assert.equal(paperdollEnabled('?paperdoll=0'),false);assert.equal(paperdollEnabled('?debug=1'),true);
  assert.equal(paperdollEnabled('?paperdoll=1'),true);
});
function cacheFixture(fail=false) {
  const calls=[],disposed=[];
  const cache=new PaperdollLibrary({compose:async d=>{calls.push(d.key);if(fail){fail=false;throw Error('offline');}return {key:d.key,metrics:{outputRGBABytes:4}};},dispose:a=>disposed.push(a.key)});
  return {cache,calls,disposed};
}
test('shared portrait/combat lease composes once, serial swaps evict and cap at two',async()=>{
  const {cache,calls,disposed}=cacheFixture();
  const [a,b]=await Promise.all([cache.acquire({key:'A'}),cache.acquire({key:'A'})]);
  assert.deepEqual(calls,['A']);assert.equal(cache.status().references,2);
  const c=await cache.acquire({key:'C'});assert.equal(cache.status().outputs,2);
  a.release();b.release();b.release();assert.deepEqual(disposed,['A']);
  c.release();const d=await cache.acquire({key:'D'});d.release();
  assert.equal(cache.status().outputs,1);assert.equal(cache.status().references,0);assert.equal(cache.status().peakOutputs,2);
});
test('offline failure is recoverable, aborted pending work allocates no output',async()=>{
  const {cache,calls}=cacheFixture(true);
  await assert.rejects(cache.acquire({key:'A'}),/offline/);const lease=await cache.acquire({key:'A'});lease.release();
  const abort=new AbortController();abort.abort();await assert.rejects(cache.acquire({key:'B'},abort.signal),/superseded/);
  assert.deepEqual(calls,['A','A']);assert.equal(cache.status().references,0);
});
test('live third atlas never exceeds budget or destroys referenced sprites',async()=>{
  const {cache,disposed}=cacheFixture();const a=await cache.acquire({key:'A'}),b=await cache.acquire({key:'B'});
  await assert.rejects(cache.acquire({key:'C'}),/budget/);assert.deepEqual(disposed,[]);
  a.release();b.release();assert.equal(cache.status().outputs,1);
});
test('a canceled portrait does not poison a concurrent combat request for same key',async()=>{
  const {cache,calls}=cacheFixture();const controller=new AbortController();
  const portrait=cache.acquire({key:'shared'},controller.signal);const combat=cache.acquire({key:'shared'});
  controller.abort();await assert.rejects(portrait,/superseded/);const lease=await combat;lease.release();
  assert.deepEqual(calls,['shared']);assert.equal(cache.status().references,0);
});
test('a pinned combat output cannot prevent eviction of a newer unused portrait',async()=>{
  const {cache,disposed}=cacheFixture();const combat=await cache.acquire({key:'combat'});
  const portrait=await cache.acquire({key:'portrait'});portrait.release();assert.deepEqual(disposed,['portrait']);
  const next=await cache.acquire({key:'next'});next.release();combat.release();assert.equal(cache.status().references,0);
});
test('every current base weapon changes geometry or baked palette, without extra sources',()=>{
  const bases=Object.entries(ITEMS).filter(([id,d])=>d.slot==='weapon'&&d.baseId===id);
  const signatures=bases.map(([id])=>{const d=equipmentVisual(wear(save(),id));return JSON.stringify([d.kit,d.weapon,d.weaponColour]);});
  assert.equal(new Set(signatures).size,bases.length);
});

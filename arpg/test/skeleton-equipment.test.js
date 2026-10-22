import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { createSave } from '../js/meta/save.js';
import { ITEMS, instance } from '../js/meta/items.js';
import { skeletonAppearance } from '../js/render/skeleton-equipment-state.js';
import { equipmentVisual } from '../js/render/paperdoll-state.js';
import { getHeroPortrait,portraitHtml } from '../js/ui/gear-view.js';
import { overFragments } from '../js/render/skeleton-equipment-compose.js';
import { installKnightPresentation,HUMAN_PRESENTATIONS } from '../js/solo/knight-presentation.js';
const fixture=()=>createSkeletonSave({lineage:'skeleton_knight',name:'骨',answers:[0,0,0,0,0],createdAt:1});
const parts={hands:'hands_light_common_t1',feet:'feet_light_common_t1',body:'cloth_tunic',head:'head_light_common_t1'};
test('inventory and unlock level never draw un-equipped armor; descriptor matches portrait',()=>{
 const s=fixture();for(const [uid,id] of Object.entries(parts))s.items.push(instance(uid,id));
 for(const level of [1,8,15,22,29,30]){s.level=level;const before=JSON.stringify(s),a=skeletonAppearance(s);assert.deepEqual(a.layers,['base','sword']);assert.deepEqual(equipmentVisual(s),a);assert.deepEqual(getHeroPortrait(s).appearance,a);assert.equal(JSON.stringify(s),before);}
 assert.match(portraitHtml(s),/data-paperdoll=/);assert.doesNotMatch(portraitHtml(s),/skeleton-warrior|기존 해골/);
});
test('all 16 actual slot combinations independent; source IDs present; sword versus blunt',()=>{
 const s=fixture();s.level=30;for(const [uid,id] of Object.entries(parts))s.items.push(instance(uid,id));
 const keys=[];for(let mask=0;mask<16;mask++){
  for(const [i,slot] of Object.keys(parts).entries())s.equipped[slot]=mask&(1<<i)?slot:null;
  const a=skeletonAppearance(s);keys.push(a.key);for(const [i,slot] of Object.keys(parts).entries()){assert.equal(a.layers.includes(slot),!!(mask&(1<<i)));assert.deepEqual(a.slots[slot],mask&(1<<i)?{uid:slot,id:parts[slot]}:null);}
 }
 assert.equal(new Set(keys).size,16);s.items.push(instance('maul','chief_maul'));s.equipped.weapon='maul';assert.ok(skeletonAppearance(s).layers.includes('blunt'));assert.ok(!skeletonAppearance(s).layers.includes('sword'));
 s.equipped.weapon=null;assert.deepEqual(skeletonAppearance(s).layers,['base','hands','feet','body','head']);
});
test('permanent DK has dedicated source in BOTH seams after every armor removed',()=>{
 const s=fixture();s.level=30;s.permanentDeathKnight=true;const a=skeletonAppearance(s);assert.equal(a.id,'player-death-knight');assert.deepEqual(a.layers,[]);assert.equal(getHeroPortrait(s).appearance.id,a.id);assert.match(getHeroPortrait(s).metadata,/player-death-knight\/atlas-0.webp.json/);
});
test('depth decides occlusion irrespective of slot iteration and supports alpha edges',()=>{
 const r={z:200,rgba:[255,0,0,255]},b={z:100,rgba:[0,0,255,255]};assert.deepEqual(overFragments([r,b]),[0,0,255,255]);assert.deepEqual(overFragments([b,r]),[0,0,255,255]);assert.deepEqual(overFragments([]),[0,0,0,0]);assert.deepEqual(overFragments([r,{z:100,rgba:[0,0,255,128]}]),[127,0,128,255]);
});
test('approved kit retains authoritative dodge state, labels idle art alias, restores every human/AI factory by identity',()=>{
 const calls=[],updates=[];const f=k=>(e,o)=>{calls.push({k,e,o});return {debug:{mode:'paperdoll',id:'player-skeleton-equipment'},update:(...a)=>updates.push(a),container:{},destroy(){}};};
 const factories=new Map(['blade','bow','focus','skeleton_warrior','death_knight',...Object.keys(HUMAN_PRESENTATIONS)].map(k=>[k,f(k)]));const original=new Map(factories),p={factories,register(k,f){factories.set(k,f);}},s=fixture();const restore=installKnightPresentation(p,s);
 const e={kind:'player',weapon:'blade',dodge:{dashLeft:3}};const raw=JSON.stringify(e);const v=factories.get('blade')(e,{});v.update(e,{},.03);assert.equal(calls.at(-1).k,'blade');assert.deepEqual(calls.at(-1).o.equipment,skeletonAppearance(s));assert.equal(updates.at(-1)[0],e);assert.equal(v.debug.dodgeFallback,'idle (approved source has no dodge clip)');assert.equal(JSON.stringify(e),raw);
 for(const type of Object.keys(HUMAN_PRESENTATIONS)){factories.get(type)({kind:'monster',type},{});assert.equal(calls.at(-1).k,HUMAN_PRESENTATIONS[type]);assert.equal(calls.at(-1).o.equipment,null);}
 restore();restore();assert.deepEqual(factories,original);assert.equal(equipmentVisual(createSave({name:'human',answers:[0,0,0,0,0],createdAt:1})).kit,'blade');
});

test('native armor-unequip action is skeleton-only, stale-safe and preserves permanent flag/items; failed write holds old state',async()=>{
 const {HubUI}=await import('../js/ui/hub.js');const s=fixture();s.level=30;s.permanentDeathKnight=true;s.items.push(instance('head',parts.head));s.equipped.head='head';
 let writes=0;const h={save:s,returnToPanel(){},commit(next){writes++;this.save=next;}};
 HubUI.prototype.action.call(h,'unequip',{slot:'head',uid:'head'});assert.equal(h.save.equipped.head,null);assert.equal(h.save.permanentDeathKnight,true);assert.deepEqual(h.save.items,s.items);assert.equal(s.equipped.head,'head');assert.equal(writes,1);
 assert.throws(()=>HubUI.prototype.action.call(h,'unequip',{slot:'head',uid:'head'}),/변경/);assert.equal(writes,1);
 assert.throws(()=>HubUI.prototype.action.call(h,'unequip',{slot:'weapon',uid:'starter:weapon'}),/변경/);assert.equal(writes,1);
 const human={...h,save:{...s,lineage:'human'}};assert.throws(()=>HubUI.prototype.action.call(human,'unequip',{slot:'head',uid:'head'}),/변경/);
 const failed={...h,save:s,commit(){throw Error('quota fixture');}};assert.throws(()=>HubUI.prototype.action.call(failed,'unequip',{slot:'head',uid:'head'}),/quota/);assert.equal(failed.save,s);
});

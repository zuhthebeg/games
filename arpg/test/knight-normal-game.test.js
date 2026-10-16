import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterStores } from '../js/meta/selected-character.js';
import { createSave, SAVE_KEY } from '../js/meta/save.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { SLOT_SAVE_KEYS } from '../js/meta/character-slots.js';
import { createWorld, addPlayer, startStage, step, emptyInput } from '../js/sim/world.js';
import { STAGES } from '../js/content/combat.js';
import { createTracker, settleRound } from '../js/meta/run.js';
import { ITEMS, meetsRequirement } from '../js/meta/items.js';
const options={lineage:'skeleton_knight',name:'기사',answers:[1,2,3,0,2],createdAt:123};
const memory=(human='HUMAN CORRUPT SENTINEL')=>{const data=new Map([[SAVE_KEY,human]]),writes=[];return {data,writes,getItem:k=>data.get(k)??null,setItem(k,v){writes.push(k);data.set(k,v);},removeItem(k){writes.push(k);data.delete(k);}};};
test('selected knight owns real receipt/mastery/consumables persistence, human is never loaded or written',()=>{
 const s=memory(),stores=new CharacterStores(s);assert.equal(stores.selectKnight(),null);
 const save=stores.createKnight(options),owner=stores.active;
 const tracker=createTracker(1);tracker.skillMastery={lunge:5};
 const {save:next}=settleRound(save,{stageId:'S1',terminal:'clear',depositedXp:3,tempLoot:{gold:9,stacks:{scrap:1},items:[]},used:{potions:1,manaPotions:0,scrolls:0},skillMastery:tracker.skillMastery});
 stores.persist(next,owner);assert.equal(s.data.get(SAVE_KEY),'HUMAN CORRUPT SENTINEL');assert.ok(s.writes.every(k=>k===SLOT_SAVE_KEYS.skeleton_knight));
 const reload=new CharacterStores(s).selectKnight();assert.deepEqual(reload,next);assert.equal(next.cleared.S1,true);assert.equal(next.stacks.potion,2);assert.equal(next.skillMastery.lunge,5);assert.equal(next.lastReceipt.stageId,'S1');
});
test('stale owner and externally replaced slot fail without wrong-slot writes',()=>{
 const human=JSON.stringify(createSave({name:'H',answers:[0,0,0,0,0],createdAt:1})),s=memory(human),stores=new CharacterStores(s);
 stores.selectKnight();const save=stores.createKnight(options),owner=stores.active;stores.selectHuman();
 assert.throws(()=>stores.persist(save,owner),/변경/);assert.throws(()=>stores.persist(save),/계보/);assert.equal(s.data.get(SAVE_KEY),human);
 stores.selectKnight();s.data.set(SLOT_SAVE_KEYS.skeleton_knight,'external');assert.throws(()=>stores.persist(save),/변경/);assert.equal(s.data.get(SLOT_SAVE_KEYS.skeleton_knight),'external');
});
test('corrupt knight preserves bytes/no human fallback, occupied creation rejects',()=>{
 const s=memory(),stores=new CharacterStores(s);s.data.set(SLOT_SAVE_KEYS.skeleton_knight,'broken');assert.throws(()=>stores.selectKnight(),/손상/);assert.deepEqual(s.writes,[]);assert.throws(()=>stores.createKnight(options));assert.equal(s.data.get(SLOT_SAVE_KEYS.skeleton_knight),'broken');
});
test('fresh knight weapon only; pending armor gate blocks all four armor slots, humans unchanged',()=>{
 const save=createSkeletonSave(options);assert.deepEqual(save.equipped,{weapon:'starter:weapon',head:null,body:null,hands:null,feet:null});assert.equal(save.items.length,1);
 for(const slot of ['head','body','hands','feet'])assert.equal(meetsRequirement(save,{kind:slot}),false);
 assert.equal(meetsRequirement(save,ITEMS.training_sword),true);assert.equal(meetsRequirement(save,ITEMS.short_bow),false);
 assert.equal(meetsRequirement({...save,lineage:'human'},ITEMS.cloth_tunic),true);
});
test('all stage spawns and known objective positions mirror copied geometry only; default identity preserved',()=>{
 const catalog=JSON.stringify(STAGES);
 for(const id of Object.keys(STAGES)){
  const a=createWorld({seed:42}),b=createWorld({seed:42});addPlayer(a,{pid:'local'});addPlayer(b,{pid:'local'});
  startStage(a,id);startStage(b,id,{playerSide:'right'});
  assert.equal(b.entities[0].x,b.arena.w-a.entities[0].x,id);assert.equal(b.entities[0].facing,Math.PI);
  assert.deepEqual(b.round.pending,a.round.pending.map(s=>({...s,fx:1-s.fx})),id);
  if(a.round.objective){for(const key of ['entry','token'])if(a.round.objective[key])assert.deepEqual(b.round.objective[key],{...a.round.objective[key],x:b.arena.w-a.round.objective[key].x});
   if(a.round.objective.markers)assert.deepEqual(b.round.objective.markers,a.round.objective.markers.map(p=>({...p,x:b.arena.w-p.x})));}
 }
 assert.equal(JSON.stringify(STAGES),catalog);
 const a=createWorld({seed:42}),b=createWorld({seed:42});for(const w of [a,b])addPlayer(w,{pid:'local'});startStage(a,'S2');startStage(b,'S2',{});for(let i=0;i<100;i++){step(a);step(b);}assert.deepEqual(b,a);
});
test('actual mirrored carry-return objective completes through existing step contract',()=>{
 const id=Object.keys(STAGES).find(id=>STAGES[id].objective?.kind==='carry-return');assert.ok(id);
 const w=createWorld({seed:7});const p=addPlayer(w,{pid:'local',mods:{maxHp:100000}});startStage(w,id,{playerSide:'right'});
 const o=w.round.objective; // Movement by ordinary input; no objective state manipulation.
 for(const target of [o.token,o.entry]){let budget=8000;while(Math.hypot(p.x-target.x,p.y-target.y)>o.radius/2&&budget--){const dx=target.x-p.x,dy=target.y-p.y,l=Math.hypot(dx,dy);step(w,{local:{...emptyInput(),mx:dx/l,my:dy/l}});}assert.ok(budget>0);for(let i=0;i<o.dwellTicks+5;i++)step(w);}
 assert.equal(w.round.state,'clear');assert.equal(p.terminal,'clear');
});
test('public factory overrides preserve combat entities, all roles, honest dodge fallback and exact human restoration',async()=>{
 const {installKnightPresentation,HUMAN_PRESENTATIONS,ORIGINAL_PRESENTATIONS}=await import('../js/solo/knight-presentation.js');
 const calls=[],updates=[],factory=key=>(entity,options)=>{calls.push({key,entity,options});return{container:{},debug:{key},update:(...args)=>updates.push(args),destroy(){}};};
 const original=new Map(['blade','bow','focus','skeleton_warrior','goblin_grunt'].map(k=>[k,factory(k)]));
 const provider={factories:new Map(original),register(k,f){this.factories.set(k,f);}};const restore=installKnightPresentation(provider);
 for(const type of new Set(Object.values(STAGES).flatMap(s=>s.spawns.map(p=>p.monster))))assert.ok(HUMAN_PRESENTATIONS[type]||ORIGINAL_PRESENTATIONS.includes(type),type);
 const player={kind:'player',weapon:'blade',dodge:{dashLeft:3},x:500},raw=JSON.stringify(player);
 const visual=provider.factories.get('blade')(player,{});visual.update(player,{},.03);assert.equal(calls.at(-1).key,'blade');assert.equal(calls.at(-1).options.equipment.id,'player-skeleton-equipment');assert.equal(updates.at(-1)[0].dodge.dashLeft,0);assert.equal(updates.at(-1)[0].moving,true);assert.equal(JSON.stringify(player),raw);assert.match(visual.debug.dodgeFallback,/no baked/);
 for(const type of ['goblin_grunt','goblin_slinger','spirit']){const e={kind:'monster',type,hp:100};const v=provider.factories.get(type)(e,{});v.update(e,{},.03);assert.equal(calls.at(-1).key,HUMAN_PRESENTATIONS[type]);assert.equal(v.debug.species,'human');assert.equal(updates.at(-1)[0],e);}
 restore();restore();assert.deepEqual(provider.factories,original);
});
test('old trial armor is unequipped once without item loss or touching human; quota keeps raw profile intact',()=>{
 const s=memory(),stores=new CharacterStores(s),old=createSave({...options,weapon:'blade'});old.lineage='skeleton_knight';const raw=JSON.stringify(old);s.data.set(SLOT_SAVE_KEYS.skeleton_knight,raw);
 const selected=stores.selectKnight();assert.equal(selected.equipped.body,null);assert.equal(selected.items.length,2);assert.equal(s.data.get(SAVE_KEY),'HUMAN CORRUPT SENTINEL');
 s.writes.length=0;assert.deepEqual(stores.selectKnight(),selected);assert.deepEqual(s.writes,[]);
 s.data.set(SLOT_SAVE_KEYS.skeleton_knight,raw);s.setItem=()=>{throw Error('quota');};assert.throws(()=>stores.selectKnight(),/quota/);assert.equal(s.data.get(SLOT_SAVE_KEYS.skeleton_knight),raw);
});
test('knight reset returns to character choice, never to accidental human creation in knight slot',async()=>{
 const {HubUI}=await import('../js/ui/hub.js');let page;
 const h=Object.assign(Object.create(HubUI.prototype),{resetStep:2,save:createSkeletonSave(options),initialCharacters:{},resetSave(){},showIntro(){page='human-intro';},showCharacterChoice(){page='choice';}});
 h.action('reset-final',{});assert.equal(page,'choice');assert.equal(h.save,null);
});
test('asynchronous human co-op callbacks validate their profile/lobby owner before changing state',async()=>{
 const {readFileSync}=await import('node:fs');const source=readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('  function startCoop('),source.indexOf('  hub.startCoop ='));
 assert.match(fn,/const ownsLobby = \(\) => characters.active === profileOwner && coop === lobby/);
 for(const callback of ['onSession','onBegin','onFrame','onLost'])assert.match(fn,new RegExp(callback+': [^\\n]+ => \\{\\n\\s+if \\(!ownsLobby\\(\\)\\) return;'));
});

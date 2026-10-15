import test from 'node:test';
import assert from 'node:assert/strict';
import { HubUI } from '../js/ui/hub.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { createSave, SAVE_KEY } from '../js/meta/save.js';
import { SLOT_SAVE_KEYS } from '../js/meta/character-slots.js';
import { buildRoundMods } from '../js/meta/run.js';
const options={lineage:'skeleton_knight',name:'문답 기사',answers:[1,2,3,0,2],createdAt:123};
const hub=()=>Object.assign(Object.create(HubUI.prototype),{answers:[],name:'',initialCharacters:{},show(html,page){this.html=html;this.page=page;}});
test('initial UI offers human and real knight, unfinished classes disabled before name/quiz',()=>{
 const h=hub(); h.showCharacterChoice();
 assert.match(h.html,/인간/);assert.match(h.html,/해골/);assert.match(h.html,/data-action="choose-skeleton"/);
 h.action('choose-skeleton',{});assert.equal(h.page,'skeleton-role');assert.match(h.html,/기사/);assert.match(h.html,/준비 중/);
 assert.equal((h.html.match(/disabled/g)||[]).length,2);
});
test('knight preview uses exact answers stats and blade without human override',()=>{
 const h=hub();Object.assign(h,{creationLineage:'skeleton_knight',name:options.name,answers:options.answers});h.showQuizResult();
 assert.match(h.html,/해골 기사/);assert.match(h.html,/검/);assert.doesNotMatch(h.html,/data-action="override"/);
});
test('knight creation callback never commits to human store and launches saved profile',()=>{
 const h=hub();let got;Object.assign(h,{creationLineage:'skeleton_knight',name:options.name,answers:options.answers,initialCharacters:{create(o){got=o;return createSkeletonSave(o);}},commit(){assert.fail('human commit');}});
 h.action('create',{});assert.equal(got.name,options.name);assert.deepEqual(got.answers,options.answers);assert.equal(h.skeletonProfile.lineage,'skeleton_knight');assert.equal(h.page,'skeleton-profile');
});
test('slot read is strict, occupied/corrupt never quarantined or overwritten; human bytes exact',async()=>{
 const {readKnight,createKnight}=await import('../js/meta/initial-characters.js');
 const human=JSON.stringify(createSave({name:'SENTINEL',answers:[0,1,2,3,0],createdAt:1}));const data=new Map([[SAVE_KEY,human]]),writes=[];
 const storage={getItem:k=>data.get(k)??null,setItem(k,v){writes.push(k);data.set(k,v);},removeItem(){assert.fail('remove');}};
 assert.equal(readKnight(storage),null);const s=createKnight(storage,options);assert.deepEqual(s,readKnight(storage));assert.deepEqual(writes,[SLOT_SAVE_KEYS.skeleton_knight]);
 assert.throws(()=>createKnight(storage,options),/occupied/);const raw=data.get(SLOT_SAVE_KEYS.skeleton_knight);assert.equal(data.get(SAVE_KEY),human);
 data.set(SLOT_SAVE_KEYS.skeleton_knight,'BROKEN');assert.throws(()=>readKnight(storage),/손상/);assert.throws(()=>createKnight(storage,options),/occupied/);assert.equal(data.get(SLOT_SAVE_KEYS.skeleton_knight),'BROKEN');assert.equal(writes.length,1);
 data.set(SLOT_SAVE_KEYS.skeleton_knight,human);assert.throws(()=>readKnight(storage),/손상/);data.set(SLOT_SAVE_KEYS.skeleton_knight,raw);
 const denied={...storage,setItem(){throw Error('quota');}};data.delete(SLOT_SAVE_KEYS.skeleton_knight);assert.throws(()=>createKnight(denied,options),/quota/);assert.equal(data.get(SAVE_KEY),human);assert.equal(readKnight(storage),null);
});
test('production session validates supplied knight, applies quiz mods and supplies on each retry without mutation',async()=>{
 const {createKnightSession}=await import('../js/solo/undead-session.js');const save=createSkeletonSave(options),raw=JSON.stringify(save);
 const provider={factories:new Map([['blade',()=>{}],['skeleton_warrior',()=>{}]]),register(k,f){this.factories.set(k,f);}};
 assert.throws(()=>createKnightSession(provider,{...save,lineage:'skeleton_mage'}));
 const s=createKnightSession(provider,save);const e=s.restart(),mods=buildRoundMods(save);
 assert.equal(e.player.potions,mods.potions);assert.equal(e.player.scrolls,mods.scrolls);assert.equal(e.player.weapon,'blade');assert.equal(e.player.weaponForm,mods.weaponForm);assert.equal(s.save.name,options.name);assert.deepEqual(s.save.quiz.answers,options.answers);
 const other=createSkeletonSave({...options,answers:[0,0,0,0,0]});const a=createKnightSession(provider,other);assert.notEqual(a.restart().player.maxMp,e.player.maxMp);a.leave();s.leave();assert.equal(JSON.stringify(save),raw);
});
test('explicit debug=0 and skeleton room links do not bypass chooser or load human store',async()=>{
 const {readFileSync}=await import('node:fs');const source=readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
 const boot=source.slice(source.indexOf('  const bootQuery ='),source.indexOf('  const app ='));
 for(const search of ['?debug=0','?character=skeleton_knight&room=unsupported']){
  let reads=0;const run=new Function('location','store',`${boot};return {legacyEntry,saved};`);const result=run({search},{load(){reads++;return 'HUMAN';}});
  assert.equal(result.legacyEntry,false);assert.equal(result.saved,null);assert.equal(reads,0);
 }
});
test('main co-op entry rejects a skeleton profile before constructing a lobby',async()=>{
 const {readFileSync}=await import('node:fs');const source=readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('  function startCoop('),source.indexOf('  hub.startCoop ='));
 const start=new Function('hub','closeCoop',`let undead=null,undeadStarting=false;${fn};return startCoop;`)({save:createSkeletonSave(options)},()=>{});
 assert.throws(()=>start('S2',1),/솔로 시험 전투/);
});
test('choosing existing human restores last journey UI state without writing the human save',()=>{
 const h=hub(),human=createSave({name:'SENTINEL',answers:[0,1,2,3,0],createdAt:1});
 const receipt={terminal:'clear',stageId:'S1'};human.lastReceipt=receipt;
 Object.assign(h,{receipt:null,initialCharacters:{human:()=>human},showInn(){this.page='inn';}});
 h.action('choose-human',{});assert.equal(h.save,human);assert.equal(h.receipt,receipt);assert.equal(h.page,'inn');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as combat from '../js/content/combat.js';
import * as identity from '../js/content/monsters.js';
import {NEW_MONSTER_DROPS} from '../js/content/loot.js';
import {BALANCE} from '../js/content/balance.js';
import {ATLAS_IDS} from '../js/render/atlas-state.js';
import {rollDrops} from '../js/meta/items.js';
import {createTracker,trackRound,settleRound,buildRoundMods,usedConsumables} from '../js/meta/run.js';
import {SaveStore,validateSave} from '../js/meta/save.js';
import {createWorld,addPlayer,startStage,step,setLoad,emptyInput} from '../js/sim/world.js';
import {preset} from '../tools/balance/botsim.mjs';
import {botInput} from '../tools/balance/bot.js';
import {questEvents,rewardSave} from './fixtures/quest-rewards.js';
import {placementTraces} from './m2b-placement-trace.mjs';
const root=new URL('../../',import.meta.url),base='423a23b',source='cfcd05f';
const read=p=>readFileSync(new URL(p,import.meta.url));
const json=p=>JSON.parse(read(p));
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:16*1024*1024});
const sha=b=>createHash('sha256').update(b).digest('hex');
async function oldCombat(){let s=git('show',base+':arpg/js/content/combat.js').toString();s=s.replace(/from '([^']+)'/g,(_,p)=>'from '+JSON.stringify(new URL(p,new URL('../js/content/combat.js',import.meta.url)).href));return import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));}

test('SUC hostile S19 replaces exactly one slinger; M2b/quests/TD1/archetypes stay exact and only approved S1 dragon spawn is removed',async()=>{
 const old=await oldCombat();assert.deepEqual(Object.keys(combat),Object.keys(old));
 assert.deepEqual(Object.fromEntries(Object.entries(combat.MONSTERS).filter(([id])=>id!=='succubus')),old.MONSTERS);
 assert.deepEqual(combat.MONSTERS.succubus,{...old.MONSTERS.goblin_slinger,lifeState:'living'});
 assert.ok(!combat.MONSTERS.succubus.invulnerable);assert.equal(combat.MONSTERS.training_succubus,undefined);
 for(const [key,value] of Object.entries(old))if(!['MONSTERS','STAGES'].includes(key)){if(typeof value==='function')assert.equal(combat[key].toString(),value.toString());else assert.deepEqual(combat[key],value,key);}
 for(const [id,stage] of Object.entries(old.STAGES)){
  const expected=structuredClone(stage);if(id==='S19'){assert.equal(expected.spawns[3].monster,'goblin_slinger');expected.spawns[3].monster='succubus';}
  if(id==='S1'){assert.equal(expected.spawns[1].monster,'training_dragon');expected.spawns.splice(1,1);}
  assert.deepEqual(combat.STAGES[id],expected,id);
 }
 assert.equal(combat.STAGES.S19.spawns.length,36);assert.equal(combat.STAGES.S19.maxConcurrent,4);
 assert.equal(combat.STAGES.S19.spawns.filter(s=>s.monster==='succubus').length,1);assert.equal(BALANCE.stages.S19.huntTier,3);
 assert.deepEqual(Object.entries(combat.STAGES).flatMap(([id,s])=>s.spawns.filter(e=>e.monster==='succubus').map(()=>id)),['S19']);
 assert.deepEqual(combat.STAGES.S1.spawns,[{monster:'scarecrow',at:0,fx:.62,fy:.5}]);assert.equal(combat.STAGES.TD1.spawns[0].monster,'throne_dragon');
});

test('SUC identity is additive hostile/living only; ATLAS_IDS adds exactly one key with every renderer function byte-preserved',async()=>{
 const s=git('show',base+':arpg/js/content/monsters.js').toString();const old=await import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
 for(const [key,value] of Object.entries(old)){
  const current=structuredClone(identity[key]);
  if(key==='MONSTER_MODELS'){assert.deepEqual(current,[...value,'succubus']);continue;}
  if(['MONSTER_PALETTES','MONSTER_NAMES','MONSTER_VARIANTS'].includes(key))delete current.succubus;
  assert.deepEqual(current,value,key);
 }
 assert.equal(identity.MONSTER_NAMES.succubus,'서큐버스');assert.deepEqual(identity.MONSTER_PALETTES.succubus,[0xffffff]);
 assert.deepEqual(identity.MONSTER_VARIANTS.succubus,{baseArchetypeId:'succubus',baseModelId:'succubus',paletteId:'succubus',nameKey:'succubus',speciesTags:['demon','humanoid'],lifeState:'living',disposition:'hostile'});
 assert.equal(ATLAS_IDS.succubus,'succubus');assert.equal(ATLAS_IDS.training_succubus,undefined);
 const before=git('show',base+':arpg/js/render/atlas-state.js').toString();assert.equal(read('../js/render/atlas-state.js').toString(),before.replace("  demon: 'demon', goleling: 'goleling', slime: 'slime',","  demon: 'demon', goleling: 'goleling', slime: 'slime',\n  succubus: 'succubus',"));
});

test('SUC slinger raw gold/material/gear/stone/scroll outputs equal isolated checkpoint for all tiers/threats/elite/bonus seeds',async()=>{
 const oldSource=git('show',base+':arpg/js/content/loot.js');const old=await import('data:text/javascript;base64,'+oldSource.toString('base64'));
 assert.deepEqual(Object.fromEntries(Object.entries(NEW_MONSTER_DROPS).filter(([id])=>id!=='succubus')),old.NEW_MONSTER_DROPS);
 assert.deepEqual(NEW_MONSTER_DROPS.succubus,{gold:[2,5],stacks:[{id:'wood',count:1,chance:.5},{id:'hide',count:1,chance:.3},{id:'mana_potion',count:1,chance:.15}],items:[]});
 // meta/items is exactly frozen below, so existing slinger remains the checkpoint implementation.
 for(const huntTier of [1,2,3,4])for(const threat of [1,2,3])for(const elite of [false,true])for(const bonus of [0,20])for(let seed=0;seed<256;seed++){
  const ctx={stageId:'S19',huntTier,threat,elite,goldBonus:bonus,materialBonus:bonus,dropLuck:bonus/100};assert.deepEqual(rollDrops('succubus',seed,ctx),rollDrops('goblin_slinger',seed,ctx));
 }
 for(const threat of [1,2,3])for(let seed=1;seed<=40;seed++)for(const repeat of [false,true]){
  const save=rewardSave('S19',threat);if(repeat)save.cleared.S19=true;
  const events=questEvents('S19',seed,threat).map(e=>({...e,xp:combat.MONSTERS[e.monster].xp}));
  const oldEvents=events.map(e=>({...e,monster:e.monster==='succubus'?'goblin_slinger':e.monster}));
  const a=trackRound(save,createTracker(seed),events).tracker,b=trackRound(save,createTracker(seed),oldEvents).tracker;
  assert.deepEqual(a,b);assert.deepEqual(settleRound(save,{stageId:'S19',terminal:'clear',...a}),settleRound(save,{stageId:'S19',terminal:'clear',...b}));
 }
});

test('SUC actual live enemy casts projectile, takes damage, dies once, yields valid recommended-gear clear settlement/save',()=>{
 for(const seed of [1,11,79]){
  const save=preset('S19'),w=createWorld({seed}),p=addPlayer(w,{pid:'a',mods:buildRoundMods(save)});startStage(w,'S19');
  let tracker=createTracker(seed),kills=0,sucKills=0,cast=false,projectile=false;
  for(let t=0;t<18000&&w.round.state==='running';t++){
   const observe=t<650;const events=step(w,{a:observe?emptyInput():botInput(w,p)});
   cast ||= events.some(e=>e.type==='act'&&w.entities.find(m=>m.id===e.id)?.type==='succubus'&&e.ability==='sling_stone');
   projectile ||= w.projectiles.some(e=>e.ownerType==='succubus'&&e.abilityId==='sling_stone');
   kills+=events.filter(e=>e.type==='kill').length;sucKills+=events.filter(e=>e.type==='kill'&&e.monster==='succubus').length;
   const out=trackRound(save,tracker,events,usedConsumables(save,p));tracker=out.tracker;setLoad(w,'a',out.load.ratio);
  }
  assert.ok(cast&&projectile,'real hostile cast and projectile');assert.equal(w.round.state,'clear',seed+' hp='+p.hp);assert.equal(sucKills,1);assert.equal(kills,36);
  const out=settleRound(save,{stageId:'S19',terminal:p.terminal,...tracker,used:usedConsumables(save,p)});assert.ok(validateSave(out.save));assert.ok(out.save.cleared.S19&&out.receipt.goldGained>0);
  const map=new Map(),store=new SaveStore({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});store.save(out.save);assert.deepEqual(store.load(),out.save);
 }
});

test('SUC source/pixels stay exact cfcd05f with 312 true-alpha trims, 40 keyed clips and 3.910MiB raw RGBA, original thresholds retained',()=>{
 const manifest=json('../assets/sprites/manifest.json'),entry=manifest.at(-1),oldManifest=JSON.parse(git('show',base+':arpg/assets/sprites/manifest.json'));
 assert.deepEqual(manifest.slice(0,-1),oldManifest);assert.equal(entry.id,'succubus');assert.deepEqual(entry.content_ids,['succubus']);
 const sourceEntry=JSON.parse(git('show',source+':arpg/assets/sprites/manifest.json')).find(e=>e.id==='succubus');assert.deepEqual(entry,{...sourceEntry,label:'서큐버스',content_ids:['succubus']});
 for(const file of entry.sheets){const sheet=json('../assets/sprites/succubus/'+file);for(const f of [file,sheet.meta.image])assert.deepEqual(read('../assets/sprites/succubus/'+f),git('show',source+':arpg/assets/sprites/succubus/'+f),f);}
 const proof=json('../tools/art/succubus/validation.json'),sourceProof=json('../tools/art/succubus/source-validation.json');
 assert.equal(proof.frames,312);assert.equal(proof.lossless_alpha_verified,312);assert.equal(proof.clipped_frames,0);assert.equal(proof.raw_rgba_bytes,4100264);assert.equal(proof.kit_bytes,525392);assert.equal(proof.min_delivery_pixels_alpha_gt16,364);
 assert.equal(proof.original256_pixel_threshold_gt16,1000);assert.equal(proof.delivery128_raw_pixel_threshold_gt16,250);assert.equal(proof.delivery128_logical_area_threshold_gt16,1000);
 assert.equal(sourceProof.bones,19);assert.equal(sourceProof.keyed_channels,117);assert.equal(sourceProof.exact_source_bone_samples,39);assert.equal(sourceProof.connected_garment_components,1);assert.equal(sourceProof.connected_garment_vertices,3641);assert.equal(sourceProof.blended_vertices,3537);assert.equal(sourceProof.normalized_garment_weights,true);assert.equal(sourceProof.all_materials_opaque,true);
 assert.equal(Object.keys(proof.motion).length,40);for(const m of Object.values(proof.motion))assert.ok(m.unique_alpha>1&&m.unique_pixels>1&&m.unique_bone_poses>1);
 const data=json('../assets/sprites/succubus/'+entry.sheets[0]),evidence=json('../tools/art/succubus/trim-alpha-evidence.json');assert.deepEqual(data.meta.size,{w:1022,h:1003});assert.equal(Number(data.meta.scale),.5);
 assert.equal(Object.keys(data.frames).length,312);assert.equal(Object.keys(data.animations).length,40);
 for(const [name,f] of Object.entries(data.frames)){assert.equal(f.trimmed,true);assert.equal(f.rotated,false);assert.deepEqual(f.sourceSize,{w:128,h:128});assert.deepEqual(f.anchor,entry.anchor);assert.equal(f.sourceSize.w/Number(data.meta.scale),256);assert.equal(evidence[name].delivery128_original_alpha_sha256,evidence[name].atlas_reconstructed_alpha_sha256);}
});

test('SUC freezes original sim/net/render/input/HUD/art/quest bytes; exact parent66a difficulty/prices and parent-owned stamps are allowed',()=>{
 const rows=git('ls-tree','-r','-z',base,'arpg').toString().split('\0').filter(Boolean).map(row=>{const [,hash,path]=row.match(/^\d+ blob ([a-f0-9]+)\t(.+)$/);return {hash,path};});
 const allowed=new Set(['arpg/js/content/combat.js','arpg/js/content/loot.js','arpg/js/content/monsters.js','arpg/js/render/atlas-state.js','arpg/assets-ledger.md','arpg/assets/sprites/manifest.json','arpg/index.html']);
 for(const {path:file,hash} of rows)if(!allowed.has(file)&&!file.startsWith('arpg/test/')){
  if(file==='arpg/js/content/balance.js'||file==='arpg/js/meta/items.js'){assert.deepEqual(readFileSync(new URL(file,root)),git('show','66a7b5b:'+file),'exact approved parent easing/prices: '+file);continue;}
  const current=readFileSync(new URL(file,root));assert.equal(createHash('sha1').update(Buffer.from('blob '+current.length+'\0')).update(current).digest('hex'),hash,file);
 }
 const original=git('show',base+':arpg/index.html').toString();
 const approved=git('show','66a7b5b:arpg/index.html').toString();let stamped=approved;
 for(const p of ['js/content/combat.js','js/content/loot.js','js/content/monsters.js','js/render/atlas-state.js'])stamped=stamped.replace(new RegExp('(\\./'+p.replaceAll('.','\\.')+'\\?v=)[a-f0-9]{10}'),'$1'+sha(read('../'+p)).slice(0,10));
 const current=read('../index.html').toString();assert.ok(current===original||current===stamped||current===approved);
});

test('SUC plus approved S1 removal against isolated parent 66a7b5b: 18 named traces differ, other 225 including M2b maps match',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'arpg-suc-enemy-'));
 try{execFileSync('tar',['-x','-C',dir],{input:git('archive','66a7b5b','arpg/js','package.json')});const before=await placementTraces(pathToFileURL(dir+'/')),after=await placementTraces(root);assert.equal(before.length,243);let changed=0;
  for(let i=0;i<before.length;i++){if(['S19','S1'].includes(before[i].stage)){assert.notEqual(after[i].sha256,before[i].sha256);changed++;}else assert.deepEqual(after[i],before[i],before[i].stage);}
  assert.equal(changed,18);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { STAGES, MONSTERS, ABILITIES } from '../js/content/combat.js';
import { BALANCE } from '../js/content/balance.js';
import { REGIONS, REGION_EDGES, MAPS, mapUnlocked, availableStages } from '../js/content/world-map.js';
import { MONSTER_VARIANTS, MONSTER_NAMES } from '../js/content/monsters.js';
import { biomeForStage } from '../js/content/biomes.js';
import { NEW_MONSTER_DROPS } from '../js/content/loot.js';
import { createSave, validateSave, SaveStore, SAVE_VERSION } from '../js/meta/save.js';
import { STAGE_XP, stageXp } from '../js/meta/progression.js';
import { ITEMS, rollDrops } from '../js/meta/items.js';
import { buildRoundMods, createTracker, trackRound, settleRound, usedConsumables, currentLoad } from '../js/meta/run.js';
import { createWorld, addPlayer, spawnMonster, startStage, step, emptyInput, setLoad, turnUndeadChance } from '../js/sim/world.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
import { ATLAS_IDS } from '../js/render/atlas-state.js';
import { ORIGINAL_PRESENTATIONS } from '../js/solo/knight-presentation.js';
import { SPECIES_AUDIO } from '../js/audio-profile.js';
import { preset } from '../tools/balance/botsim.mjs';
import { botInput } from '../tools/balance/bot.js';
import { HubUI } from '../js/ui/hub.js';
const ids=['S24','S25','S26','S27'], boss='necropolis_lord';
const fresh=()=>createSave({name:'지하묘역',answers:[0,0,0,0,0],createdAt:1});
async function baseline(file){let source=execFileSync('git',['show','c7b1abe:arpg/js/'+file],{encoding:'utf8'});source=source.replace(/from '([^']+)'/g,(_,p)=>'from '+JSON.stringify(new URL(p,new URL('../js/'+file,import.meta.url)).href));return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
const storeFor=()=>{const data=new Map();return new SaveStore({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)});};

test('necropolis contains four named real killAll maps, differentiated existing undead rosters and one final boss',()=>{
 assert.deepEqual(REGIONS.find(r=>r.id==='necropolis')?.maps,ids);
 assert.deepEqual(ids.map(id=>STAGES[id]?.name),['매장지','구울 소굴','망령 회랑','망자의 성소']);
 assert.ok(REGION_EDGES.some(([a,b])=>a==='graveyard'&&b==='necropolis'));
 for(const id of ids){const s=STAGES[id];assert.equal(s.goal,'killAll');assert.equal(biomeForStage(id),'graveyard');assert.equal(BALANCE.stages[id].huntTier,4);assert.ok(s.maxConcurrent<=3);assert.ok(s.hpMult>=5&&s.hpMult<=6);assert.ok(s.dmgMult>=2&&s.dmgMult<=2.4);assert.ok(STAGE_XP[id]>0);
  for(const spawn of s.spawns){assert.equal(MONSTERS[spawn.monster].lifeState,'undead');assert.ok(NEW_MONSTER_DROPS[spawn.monster]);assert.ok(spawn.fx>.05&&spawn.fx<.95&&spawn.fy>.05&&spawn.fy<.95);}
 }
 assert.ok(STAGES.S24.spawns.filter(s=>s.monster.startsWith('skeleton')).length>STAGES.S24.spawns.length/2);
 assert.ok(STAGES.S25.spawns.filter(s=>s.monster==='ghoul').length>=STAGES.S25.spawns.length/2);
 assert.ok(STAGES.S26.spawns.filter(s=>['ghost','skeleton_mage'].includes(s.monster)).length>=STAGES.S26.spawns.length/2);
 assert.equal(STAGES.S27.spawns.filter(s=>s.monster===boss).length,1);assert.ok(STAGES.S27.spawns.some(s=>s.monster==='skeleton_warrior'));
});

test('S20 and S23 gates cannot be bypassed by forged new clears, then maps unlock sequentially',()=>{
 const s=fresh();for(const id of ids){s.cleared[id]=true;assert.equal(mapUnlocked(s,id),false);}
 s.cleared.S23=true;for(const id of ids)assert.equal(mapUnlocked(s,id),false);
 s.cleared.S23=false;s.cleared.S20=true;for(const id of ids)assert.equal(mapUnlocked(s,id),false);
 for(const id of ids)delete s.cleared[id];s.cleared.S23=true;
 for(let i=0;i<ids.length;i++){assert.equal(mapUnlocked(s,ids[i]),true);assert.equal(availableStages(s).includes(ids[i]),true);assert.deepEqual(MAPS[ids[i]].requires,[i?ids[i-1]:'S23']);if(i<3)assert.equal(mapUnlocked(s,ids[i+1]),false);s.cleared[ids[i]]=true;}
 for(const id of ids)assert.equal(mapUnlocked(s,id),true);
});

test('all pre-existing encounters, monsters, abilities, maps, biome/reward/tuning entries and living bats stay exactly at approved base',async()=>{
 for(const [file,names] of Object.entries({'content/combat.js':['STAGES','MONSTERS','ABILITIES'],'content/balance.js':['BALANCE'],'content/world-map.js':['MAPS'],'content/monsters.js':['MONSTER_VARIANTS'],'content/biomes.js':['BIOMES','STAGE_BIOMES'],'content/loot.js':['NEW_MONSTER_DROPS'],'meta/progression.js':['STAGE_XP']})){
  const old=await baseline(file),now=await import(new URL('../js/'+file,import.meta.url));
  for(const name of names)for(const [id,value] of Object.entries(old[name])){if(name==='BALANCE'&&id==='stages'){for(const [key,tune] of Object.entries(value))assert.deepEqual(now[name][id][key],tune,key);}else assert.deepEqual(now[name][id],value,file+'/'+id);}
 }
 assert.equal(MONSTERS.bat.lifeState,'beast');assert.equal(MONSTER_VARIANTS.bat.lifeState,'beast');
 assert.equal(execFileSync('git',['diff','c7b1abe','--','arpg/js/sim','arpg/js/net','arpg/assets'],{encoding:'utf8'}),'','no simulation, protocol or art-byte changes');
});

test('authored boss identity is undead and strict boss; existing skeleton art/audio and unique boss name',()=>{
 assert.equal(MONSTERS[boss]?.lifeState,'undead');assert.equal(MONSTERS[boss]?.boss,true);assert.ok(MONSTER_VARIANTS[boss].speciesTags.includes('boss'));assert.equal(MONSTER_VARIANTS[boss].lifeState,'undead');assert.equal(MONSTER_VARIANTS[boss].baseModelId,'skeleton_warrior');
 assert.equal(ATLAS_IDS[boss],'skeleton-warrior');assert.ok(ORIGINAL_PRESENTATIONS.includes(boss));assert.equal(SPECIES_AUDIO[boss].death,'bone-death');assert.equal(MONSTER_NAMES[boss],'망자의 군주');
 for(const ability of MONSTERS[boss].abilities)assert.ok(ABILITIES[ability]);assert.equal(MONSTERS[boss].invulnerable,undefined);
});

test('boss takes real holy heal damage and turn execution stays below one percent including holy bonus',()=>{
 for(const skill of ['healing_light','turn_undead']){
  const w=createWorld({seed:1}),p=addPlayer(w,{pid:'a',weapon:'focus',x:500,y:400,mods:{skill,effectiveInt:10000,staffAffinity:'holy',mpRegen:0}}),m=spawnMonster(w,boss,550,400);
  m.spawnLeft=0;m.thinkLeft=1000;w.rng=1;const hp=m.hp,events=step(w,{a:{...emptyInput(),skillEdge:true}});for(let i=0;i<50;i++)events.push(...step(w));
  assert.equal(p.mp,p.maxMp-ABILITIES[skill].manaCost);if(skill==='healing_light'){assert.ok(m.hp<hp);assert.equal(events.filter(e=>e.type==='hit'&&e.dst===m.id).length,1);}else{const turn=events.find(e=>e.type==='turnUndead');assert.ok(turn);assert.equal(turn.success,false);assert.equal(turnUndeadChance(10000,true,true),.009);assert.equal(m.dead,false);}
 }
});

test('historical save missing all new flags round-trips without migration, schema change or free unlock',()=>{
 const s=fresh();for(const id of ids){delete s.cleared[id];delete s.stageThreat[id];}const store=storeFor();assert.ok(validateSave(s));store.save(s);assert.deepEqual(store.load(),s);assert.equal(store.load().version,SAVE_VERSION);for(const id of ids)assert.equal(mapUnlocked(store.load(),id),false);
});

for(const id of ids)test(`${id} real recommended physical build clears all waves, receives bounded rewards, unlocks next and reloads (3 seeds)`,()=>{
 for(const seed of [1,11,79]){
  const s=preset(id);s.cleared.S20=s.cleared.S23=true;for(const prior of ids.slice(0,ids.indexOf(id)))s.cleared[prior]=true;
  const w=createWorld({seed}),p=addPlayer(w,{pid:'a',mods:buildRoundMods(s)});let tracker=createTracker(seed),kills=0,peak=0;const seen=new Set();startStage(w,id);setLoad(w,'a',currentLoad(s,tracker).ratio);
  while(w.tick<18000&&w.round.state==='running'){
   const events=step(w,{a:botInput(w,p)});for(const e of events){if(e.type==='spawn')seen.add(e.monster);if(e.type==='kill')kills++;}
   peak=Math.max(peak,w.entities.filter(e=>e.kind==='monster'&&!e.dead).length);const out=trackRound(s,tracker,events,usedConsumables(s,p));tracker=out.tracker;setLoad(w,'a',out.load.ratio);
  }
  assert.equal(w.round.state,'clear',`${id}/${seed} HP=${p.hp} kills=${kills}`);assert.equal(kills,STAGES[id].spawns.length);assert.deepEqual(seen,new Set(STAGES[id].spawns.map(s=>s.monster)));assert.ok(peak<=3);
  const out=settleRound(s,{stageId:id,terminal:p.terminal,...tracker,used:usedConsumables(s,p)});assert.ok(out.save.cleared[id]);assert.ok(out.receipt.goldGained>0&&out.receipt.goldGained<=600);assert.ok(out.receipt.stageXp>0);assert.ok(out.receipt.lootKept.items.length<=tracker.gearBudget&&tracker.gearBudget<=2);assert.ok(validateSave(out.save));assert.equal(stageXp(out.save,id),Math.round(out.receipt.stageXp*.25));if(id!=='S27')assert.ok(mapUnlocked(out.save,ids[ids.indexOf(id)+1]));
  const store=storeFor();store.save(out.save);assert.deepEqual(store.load(),out.save);
 }
});

test('new content deterministic world and guest snapshot type/AI/HP survive without protocol additions',()=>{
 for(const id of ids){const a=createWorld({seed:11}),b=createWorld({seed:11});for(const w of [a,b]){addPlayer(w,{pid:'a'});startStage(w,id);}for(let t=0;t<500;t++){step(a);step(b);}assert.deepEqual(a,b);const frozen=JSON.stringify(a),guest=decodeSnapshot(encodeSnapshot(a),'a');assert.equal(JSON.stringify(a),frozen);assert.equal(guest.round.stageId,id);for(const m of a.entities.filter(e=>e.kind==='monster')){const g=guest.entities.find(e=>e.id===m.id);assert.equal(g.type,m.type);assert.equal(g.hp,m.hp);if(m.act)assert.equal(g.act.def,ABILITIES[m.act.id]);}}
});

test('new boss deterministic ordinary T4 drops preserve gear budget and existing materials only',()=>{
 for(let seed=0;seed<200;seed++)for(const threat of [1,2,3]){const ctx={stageId:'S27',huntTier:4,threat};const drop=rollDrops(boss,seed,ctx);assert.deepEqual(drop,rollDrops(boss,seed,ctx));assert.ok(Number.isSafeInteger(drop.gold)&&drop.gold>0);for(const id of Object.keys(drop.stacks))assert.ok(ITEMS[id]);for(const item of drop.items)assert.equal(ITEMS[item.id].huntTier,ITEMS[item.id].slot==='offhand'?1:['weapon','body'].includes(ITEMS[item.id].slot)?4:3);}
});

test('normal board exposes four gated maps and separate completion counter without changing /20 or graveyard /3',()=>{
 const s=fresh(),h=Object.assign(Object.create(HubUI.prototype),{save:s,showInnPanel:(_t,html,_p,_f,opts)=>{h.html=html;h.opts=opts;}});h.showBoard();assert.match(h.html,/망자의 지하묘역/);for(const id of ids)assert.match(h.html,new RegExp(`data-stage="${id}" class="contract lock" disabled`));s.cleared.S20=s.cleared.S23=true;h.showBoard();assert.match(h.html,/data-stage="S24" class="contract depart"/);assert.match(h.opts.eyebrow,/1 \/ 20 완료 · 묘지 1 \/ 3 · 지하묘역 0 \/ 4/);
});


test('boss and escort share one existing atlas lease, with no manifest mutation or premature release',async()=>{
 const {AtlasLibrary}=await import('../js/render/atlas-library.js');const loads=[],unloads=[];
 const entry={id:'skeleton-warrior',content_ids:['skeleton_warrior'],sheets:['atlas.json'],animations:['idle']};
 const animations=Object.fromEntries(['E','SE','S','SW','W','NW','N','NE'].map(d=>['idle_'+d,[{}]]));
 const library=new AtlasLibrary({baseUrl:'http://localhost/sprites/',fetchManifest:async()=>[entry],loadSheet:async url=>{loads.push(url);return {animations};},unloadSheet:async url=>unloads.push(url)});
 library.beginRound([boss,'skeleton_warrior']);const [a,b]=await Promise.all([library.load(boss),library.load('skeleton_warrior')]);assert.ok(a);assert.equal(a,b);assert.equal(loads.length,1);
 library.beginRound([boss]);assert.equal(unloads.length,0);assert.equal(await library.load(boss),a);library.beginRound([]);await Promise.all(library.releasing.values());assert.equal(unloads.length,1);assert.deepEqual(entry.content_ids,['skeleton_warrior']);
});

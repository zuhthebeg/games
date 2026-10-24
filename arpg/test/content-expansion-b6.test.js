import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MONSTERS, STAGES, ABILITIES } from '../js/content/combat.js';
import { BALANCE } from '../js/content/balance.js';
import { BIOMES, biomeForStage } from '../js/content/biomes.js';
import { MONSTER_VARIANTS } from '../js/content/monsters.js';
import { MAPS, REGIONS, REGION_EDGES, mapUnlocked } from '../js/content/world-map.js';
import { STAGE_XP } from '../js/meta/progression.js';
import { createSave, validateSave } from '../js/meta/save.js';
import { createWorld, addPlayer, startStage, step, spawnMonster, setLoad } from '../js/sim/world.js';
import { rollDrops } from '../js/meta/items.js';
import { ATLAS_IDS } from '../js/render/atlas-state.js';
import { SPECIES_AUDIO } from '../js/audio-profile.js';
import { preset } from '../tools/balance/botsim.mjs';
import { botInput } from '../tools/balance/bot.js';
import { buildRoundMods, createTracker, trackRound, settleRound, usedConsumables, currentLoad } from '../js/meta/run.js';

const ids=['S43','S44','S45'], types=['abyss_glub','drowned_skull','abyss_squidle'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').slice(0,12);
test('S43–S45 follow the spore frontier without changing old save gates',()=>{
 const save=createSave({name:'이전 영웅',answers:[0,0,0,0,0],createdAt:1});assert.ok(validateSave(save));
 for(const id of ids)assert.equal(mapUnlocked(save,id),false);
 save.cleared.S42=true;assert.equal(mapUnlocked(save,'S43'),false);
 save.cleared.S20=save.cleared.S27=save.cleared.S30=save.cleared.S33=save.cleared.S36=true;assert.equal(mapUnlocked(save,'S43'),false);
 save.cleared.S39=true;assert.equal(mapUnlocked(save,'S43'),true);
 // Old saves that already cleared S40–S41 but not S42 keep exactly their prior map access.
 assert.equal(mapUnlocked({cleared:{S20:true,S27:true,S30:true,S33:true,S36:true,S39:true,S40:true,S41:true}},'S43'),false);
 assert.equal(mapUnlocked({cleared:{S20:true,S27:true,S30:true,S33:true,S36:true,S39:true}},'S40'),true);
 for(let i=0;i<2;i++){assert.deepEqual(MAPS[ids[i+1]].requires,[ids[i]]);assert.equal(mapUnlocked(save,ids[i+1]),false);save.cleared[ids[i]]=true;assert.equal(mapUnlocked(save,ids[i+1]),true)}
 assert.deepEqual(REGIONS.find(r=>r.id==='abyss').maps,ids);
 assert.ok(REGION_EDGES.some(([a,b])=>a==='spore'&&b==='abyss'));
 assert.ok(BIOMES.abyssal_trench);
 for(const id of ids){assert.equal(biomeForStage(id),'abyssal_trench');assert.ok(STAGE_XP[id]>STAGE_XP.S42);assert.equal(STAGES[id].goal,'killAll');assert.ok(STAGES[id].maxConcurrent<=3);assert.ok(STAGES[id].spawns.every(s=>types.includes(s.monster)))}
 assert.equal(BALANCE.stages.S45.eliteChance,1);assert.equal(STAGES.S45.spawns[0].monster,'abyss_squidle');
});
test('torpedo biter, stone-and-mire skull and sweeping squid lord use distinct native rigs within atlas budgets',()=>{
 assert.deepEqual(types.map(id=>MONSTERS[id].abilities),[['boar_charge','wolf_bite'],['sling_stone','spider_puddle'],['chief_cleave','guardian_ring']]);
 // Every pair is new: no shipped monster uses the same ability set.
 for(const type of types)assert.ok(Object.entries(MONSTERS).every(([id,m])=>id===type||[...m.abilities].sort().join()!==[...MONSTERS[type].abilities].sort().join()),type);
 const manifest=JSON.parse(readFileSync(new URL('../assets/sprites/manifest.json',import.meta.url)));
 for(const type of types){assert.equal(ATLAS_IDS[type],type);assert.ok(SPECIES_AUDIO[type]);assert.equal(MONSTER_VARIANTS[type].lifeState,MONSTERS[type].lifeState);
  assert.ok(MONSTERS[type].abilities.every(id=>ABILITIES[id]));
  const world=createWorld({seed:11});addPlayer(world,{pid:'a',x:400,y:400,mods:{maxHp:10000}});
  const monster=spawnMonster(world,type,485,400);monster.spawnLeft=0;let acts=0;
  for(let t=0;t<300;t++)acts+=step(world).filter(e=>e.type==='act'&&e.id===monster.id).length;
  assert.ok(acts>0,type+' did not attack');assert.ok(rollDrops(type,11,{stageId:'S43',huntTier:4,threat:1}).gold>0);
  const entry=manifest.find(e=>e.id===type);assert.ok(entry);assert.deepEqual(entry.content_ids,[type]);
  let decoded=0,clips=new Set();for(const name of entry.sheets){const raw=readFileSync(new URL('../assets/sprites/'+type+'/'+name,import.meta.url));const json=JSON.parse(raw);decoded+=json.meta.size.w*json.meta.size.h*4;assert.equal(entry.cacheVersion,sha(raw));
   const image=new URL('../assets/sprites/'+type+'/'+json.meta.image.split('?')[0],import.meta.url);
   assert.equal(new URL(json.meta.image,'https://assets.example/').searchParams.get('v'),sha(readFileSync(image)));
   Object.keys(json.animations).forEach(k=>clips.add(k));}
  assert.ok(decoded<=16*1048576,type+' exceeds decoded 16 MiB');for(const state of ['idle','run','attack','hit','death'])for(const direction of ['E','SE','S','SW','W','NW','N','NE'])assert.ok(clips.has(state+'_'+direction));
 }
});
test('each new monster actually executes both distinct actions at the intended ranges',()=>{
 for(const [type,dx] of [['abyss_glub',300],['drowned_skull',250],['abyss_squidle',200]]){
  const world=createWorld({seed:11});addPlayer(world,{pid:'a',x:400,y:400,mods:{maxHp:100000}});
  const monster=spawnMonster(world,type,400+dx,400);monster.spawnLeft=0;
  const used=new Set();for(let tick=0;tick<540;tick++)for(const event of step(world))if(event.type==='act'&&event.id===monster.id)used.add(event.ability);
  assert.deepEqual([...used].sort(),[...MONSTERS[type].abilities].sort(),type+' missing action');
 }
});
test('no previously shipped stage, monster or player number changed for batch 6',()=>{
 for(const id of ['S40','S41','S42'])assert.deepEqual([BALANCE.stages[id].hp,BALANCE.stages[id].damage,BALANCE.stages[id].eliteChance],{S40:[7.5,2.8,.18],S41:[7.6,2.85,.18],S42:[7.8,2.9,1]}[id]);
 assert.deepEqual([STAGE_XP.S40,STAGE_XP.S41,STAGE_XP.S42],[3720,3820,3920]);assert.deepEqual(MAPS.S40.requires,['S39']);
 assert.deepEqual([MONSTERS.spore_king.hp,MONSTERS.spore_king.abilities],[340,['guardian_crush','spider_puddle']]);
 assert.deepEqual(STAGES.S42.spawns.map(s=>s.monster),['spore_king','gale_hywirl','spore_mushnub']);
});
test('recommended player clears each abyss stage and persists real settlement',()=>{
 for(const id of ids){const save=preset(id);save.cleared.S20=save.cleared.S23=save.cleared.S27=save.cleared.S30=save.cleared.S33=save.cleared.S36=save.cleared.S39=save.cleared.S42=true;
  for(const prior of ids.slice(0,ids.indexOf(id)))save.cleared[prior]=true;
  const world=createWorld({seed:11}),player=addPlayer(world,{pid:'a',mods:buildRoundMods(save)});
  let tracker=createTracker(11),kills=0;startStage(world,id);setLoad(world,'a',currentLoad(save,tracker).ratio);
  while(world.tick<18000&&world.round.state==='running'){
   const events=step(world,{a:botInput(world,player)});kills+=events.filter(e=>e.type==='kill').length;
   const out=trackRound(save,tracker,events,usedConsumables(save,player));tracker=out.tracker;setLoad(world,'a',out.load.ratio);
  }
  assert.equal(world.round.state,'clear',id+' hp '+player.hp+' kills '+kills);
  assert.equal(kills,STAGES[id].spawns.length);
  const out=settleRound(save,{stageId:id,terminal:player.terminal,...tracker,used:usedConsumables(save,player)});
  assert.ok(validateSave(out.save)&&out.save.cleared[id]);assert.ok(out.receipt.goldGained>0);
  if(id!=='S45')assert.equal(mapUnlocked(out.save,ids[ids.indexOf(id)+1]),true);
 }
});
test('13-row route map keeps the tapped region quest list on screen (desktop sticky details + mobile reveal)',async()=>{
 const {HubUI}=await import('../js/ui/hub.js');
 assert.ok(readFileSync(new URL('../css/game.css',import.meta.url),'utf8').includes('@media(min-width:760px){\n  .map-board{grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:28px}\n  .map-details{position:sticky;top:0}'),'desktop details column stays in view');
 const save=createSave({name:'해구 지도',answers:[0,0,0,0,0],createdAt:1});for(const id of Object.keys(MAPS))if(!/^S4[3-5]$/.test(id))save.cleared[id]=true;
 const previous=globalThis.innerHeight;globalThis.innerHeight=844;
 try{for(const [top,expected] of [[1500,1],[-900,1],[120,0]]){
  let scrolled=0;const section={getBoundingClientRect:()=>({top}),scrollIntoView:o=>{assert.deepEqual(o,{block:'start'});scrolled++}};
  const hub=Object.assign(Object.create(HubUI.prototype),{save,root:{querySelector:sel=>sel==='#map-region-outskirts'?section:null},showInnPanel(title,html){this.html=html}});
  hub.action('map-region',{region:'outskirts'});
  assert.equal(hub.mapRegion,'outskirts');assert.match(hub.html,/data-region="abyss"[^>]*grid-row:13;grid-column:2/);assert.equal(scrolled,expected,String(top));
 }}finally{globalThis.innerHeight=previous}
});

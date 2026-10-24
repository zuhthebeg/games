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

const ids=['S49','S50','S51'], types=['sky_armabee','sky_pigeon','sky_birb'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').slice(0,12);
test('S49–S51 follow the clockwork frontier without changing old save gates',()=>{
 const save=createSave({name:'이전 영웅',answers:[0,0,0,0,0],createdAt:1});assert.ok(validateSave(save));
 for(const id of ids)assert.equal(mapUnlocked(save,id),false);
 save.cleared.S45=save.cleared.S48=true;assert.equal(mapUnlocked(save,'S49'),false);
 save.cleared.S20=save.cleared.S27=save.cleared.S30=save.cleared.S33=save.cleared.S36=save.cleared.S39=true;assert.equal(mapUnlocked(save,'S49'),false);
 save.cleared.S42=save.cleared.S45=true;assert.equal(mapUnlocked(save,'S49'),true);
 // Old saves that already cleared S46–S47 but not S48 keep exactly their prior map access.
 assert.equal(mapUnlocked({cleared:{S20:true,S27:true,S30:true,S33:true,S36:true,S39:true,S42:true,S45:true,S46:true,S47:true}},'S49'),false);
 assert.equal(mapUnlocked({cleared:{S20:true,S27:true,S30:true,S33:true,S36:true,S39:true,S42:true,S45:true}},'S46'),true);
 for(let i=0;i<2;i++){assert.deepEqual(MAPS[ids[i+1]].requires,[ids[i]]);assert.equal(mapUnlocked(save,ids[i+1]),false);save.cleared[ids[i]]=true;assert.equal(mapUnlocked(save,ids[i+1]),true)}
 assert.deepEqual(REGIONS.find(r=>r.id==='sky').maps,ids);
 assert.ok(REGION_EDGES.some(([a,b])=>a==='clockwork'&&b==='sky'));
 assert.ok(BIOMES.sky_spire);
 for(const id of ids){assert.equal(biomeForStage(id),'sky_spire');assert.ok(STAGE_XP[id]>STAGE_XP.S48);assert.equal(STAGES[id].goal,'killAll');assert.ok(STAGES[id].maxConcurrent<=3);assert.ok(STAGES[id].spawns.every(s=>types.includes(s.monster)))}
 assert.equal(BALANCE.stages.S51.eliteChance,1);assert.equal(STAGES.S51.spawns[0].monster,'sky_birb');
 // Append-only registries: seeded tests iterate Object.keys order.
 assert.deepEqual(Object.keys(MONSTERS).slice(Object.keys(MONSTERS).indexOf('clock_drone'),Object.keys(MONSTERS).indexOf('sky_birb')+1),['clock_drone','clock_walker','clock_colossus',...types]);
 assert.deepEqual(Object.keys(STAGES).filter(id=>/^S(?:4[6-9]|5[01])$/.test(id)),['S46','S47','S48',...ids]);
});
test('ranged armabee, diving pigeon and storm birb use distinct native rigs within atlas budgets',()=>{
 assert.deepEqual(types.map(id=>MONSTERS[id].abilities),[['sling_stone','goblin_hop'],['wolf_dash','boar_gore'],['spirit_bolt','chief_slam']]);
 for(const type of types){assert.equal(MONSTERS[type].lifeState,'beast');assert.ok(MONSTER_VARIANTS[type].speciesTags.some(t=>['bird','insect'].includes(t)))}
 // Every pair is new: no shipped monster uses the same ability set.
 for(const type of types)assert.ok(Object.entries(MONSTERS).every(([id,m])=>id===type||[...m.abilities].sort().join()!==[...MONSTERS[type].abilities].sort().join()),type);
 const manifest=JSON.parse(readFileSync(new URL('../assets/sprites/manifest.json',import.meta.url)));
 for(const type of types){assert.equal(ATLAS_IDS[type],type);assert.ok(SPECIES_AUDIO[type]);assert.equal(MONSTER_VARIANTS[type].lifeState,MONSTERS[type].lifeState);
  assert.ok(MONSTERS[type].abilities.every(id=>ABILITIES[id]));
  const world=createWorld({seed:11});addPlayer(world,{pid:'a',x:400,y:400,mods:{maxHp:10000}});
  const monster=spawnMonster(world,type,485,400);monster.spawnLeft=0;let acts=0;
  for(let t=0;t<300;t++)acts+=step(world).filter(e=>e.type==='act'&&e.id===monster.id).length;
  assert.ok(acts>0,type+' did not attack');assert.ok(rollDrops(type,11,{stageId:'S49',huntTier:4,threat:1}).gold>0);
  const entry=manifest.find(e=>e.id===type);assert.ok(entry);assert.deepEqual(entry.content_ids,[type]);
  let decoded=0,clips=new Set();for(const name of entry.sheets){const raw=readFileSync(new URL('../assets/sprites/'+type+'/'+name,import.meta.url));const json=JSON.parse(raw);decoded+=json.meta.size.w*json.meta.size.h*4;assert.equal(entry.cacheVersion,sha(raw));
   const image=new URL('../assets/sprites/'+type+'/'+json.meta.image.split('?')[0],import.meta.url);
   assert.equal(new URL(json.meta.image,'https://assets.example/').searchParams.get('v'),sha(readFileSync(image)));
   Object.keys(json.animations).forEach(k=>clips.add(k));}
  assert.ok(decoded<=16*1048576,type+' exceeds decoded 16 MiB');for(const state of ['idle','run','attack','hit','death'])for(const direction of ['E','SE','S','SW','W','NW','N','NE'])assert.ok(clips.has(state+'_'+direction));
 }
});
test('each new monster actually executes both distinct actions at the intended ranges',()=>{
 for(const [type,dx] of [['sky_armabee',300],['sky_pigeon',250],['sky_birb',260]]){
  const world=createWorld({seed:11});addPlayer(world,{pid:'a',x:400,y:400,mods:{maxHp:100000}});
  const monster=spawnMonster(world,type,400+dx,400);monster.spawnLeft=0;
  const used=new Set();for(let tick=0;tick<540;tick++)for(const event of step(world))if(event.type==='act'&&event.id===monster.id)used.add(event.ability);
  assert.deepEqual([...used].sort(),[...MONSTERS[type].abilities].sort(),type+' missing action');
 }
});
test('no previously shipped stage, monster or player number changed for batch 8',()=>{
 for(const id of ['S46','S47','S48'])assert.deepEqual([BALANCE.stages[id].hp,BALANCE.stages[id].damage,BALANCE.stages[id].eliteChance],{S46:[8.5,3.1,.18],S47:[8.6,3.15,.18],S48:[8.8,3.2,1]}[id]);
 assert.deepEqual([STAGE_XP.S46,STAGE_XP.S47,STAGE_XP.S48],[4320,4420,4520]);assert.deepEqual(MAPS.S46.requires,['S45']);
 assert.deepEqual([MONSTERS.clock_colossus.hp,MONSTERS.clock_colossus.abilities],[380,['chief_charge','guardian_ring']]);
 assert.deepEqual(STAGES.S48.spawns.map(s=>s.monster),['clock_colossus','clock_drone','clock_walker']);
});
test('recommended player clears each sky stage and persists real settlement',()=>{
 for(const id of ids){const save=preset(id);save.cleared.S20=save.cleared.S23=save.cleared.S27=save.cleared.S30=save.cleared.S33=save.cleared.S36=save.cleared.S39=save.cleared.S42=save.cleared.S45=save.cleared.S48=true;
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
  if(id!=='S51')assert.equal(mapUnlocked(out.save,ids[ids.indexOf(id)+1]),true);
 }
});
test('15-row route map places sky below clockwork and keeps the tapped region quest list on screen',async()=>{
 const {HubUI}=await import('../js/ui/hub.js');
 const save=createSave({name:'태엽 지도',answers:[0,0,0,0,0],createdAt:1});for(const id of Object.keys(MAPS))if(!/^S(?:49|50|51)$/.test(id))save.cleared[id]=true;
 const previous=globalThis.innerHeight;globalThis.innerHeight=844;
 try{for(const [top,expected] of [[2100,1],[-1200,1],[120,0]]){
  let scrolled=0;const section={getBoundingClientRect:()=>({top}),scrollIntoView:o=>{assert.deepEqual(o,{block:'start'});scrolled++}};
  const hub=Object.assign(Object.create(HubUI.prototype),{save,root:{querySelector:sel=>sel==='#map-region-sky'?section:null},showInnPanel(title,html){this.html=html}});
  hub.action('map-region',{region:'sky'});
  assert.equal(hub.mapRegion,'sky');assert.match(hub.html,/data-region="sky"[^>]*grid-row:15;grid-column:1/);assert.match(hub.html,/data-route="clockwork:sky"/);
  assert.match(hub.html,/world-map\/sky\.webp\?v=69b74d022b11/);assert.equal(scrolled,expected,String(top));
 }}finally{globalThis.innerHeight=previous}
});

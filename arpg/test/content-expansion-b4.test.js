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

const ids=['S37','S38','S39'], types=['dune_cactoro','sun_totem','crown_alpaking'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').slice(0,12);
test('S37–S39 follow the mire frontier without changing old save gates',()=>{
 const save=createSave({name:'이전 영웅',answers:[0,0,0,0,0],createdAt:1});assert.ok(validateSave(save));
 for(const id of ids)assert.equal(mapUnlocked(save,id),false);
 save.cleared.S36=true;assert.equal(mapUnlocked(save,'S37'),false);
 save.cleared.S20=save.cleared.S27=save.cleared.S30=true;assert.equal(mapUnlocked(save,'S37'),false);
 save.cleared.S33=true;assert.equal(mapUnlocked(save,'S37'),true);
 for(let i=0;i<2;i++){assert.deepEqual(MAPS[ids[i+1]].requires,[ids[i]]);assert.equal(mapUnlocked(save,ids[i+1]),false);save.cleared[ids[i]]=true;assert.equal(mapUnlocked(save,ids[i+1]),true)}
 assert.deepEqual(REGIONS.find(r=>r.id==='dunes').maps,ids);
 assert.ok(REGION_EDGES.some(([a,b])=>a==='mire'&&b==='dunes'));
 assert.ok(BIOMES.sun_dunes);
 for(const id of ids){assert.equal(biomeForStage(id),'sun_dunes');assert.ok(STAGE_XP[id]>STAGE_XP.S36);assert.equal(STAGES[id].goal,'killAll');assert.ok(STAGES[id].maxConcurrent<=3);assert.ok(STAGES[id].spawns.every(s=>types.includes(s.monster)))}
 assert.equal(BALANCE.stages.S39.eliteChance,1);assert.equal(STAGES.S39.spawns[0].monster,'crown_alpaking');
});
test('charging cactus, ring-pulse slinger and leaping slam flyer use distinct native rigs within atlas budgets',()=>{
 assert.deepEqual(types.map(id=>MONSTERS[id].abilities),[['boar_charge','boar_gore'],['sling_stone','guardian_ring'],['goblin_hop','chief_slam']]);
 const manifest=JSON.parse(readFileSync(new URL('../assets/sprites/manifest.json',import.meta.url)));
 for(const type of types){assert.equal(ATLAS_IDS[type],type);assert.ok(SPECIES_AUDIO[type]);assert.ok(['beast','living'].includes(MONSTER_VARIANTS[type].lifeState));
  assert.ok(MONSTERS[type].abilities.every(id=>ABILITIES[id]));
  const world=createWorld({seed:11});addPlayer(world,{pid:'a',x:400,y:400,mods:{maxHp:10000}});
  const monster=spawnMonster(world,type,485,400);monster.spawnLeft=0;let acts=0;
  for(let t=0;t<300;t++)acts+=step(world).filter(e=>e.type==='act'&&e.id===monster.id).length;
  assert.ok(acts>0,type+' did not attack');assert.ok(rollDrops(type,11,{stageId:'S37',huntTier:4,threat:1}).gold>0);
  const entry=manifest.find(e=>e.id===type);assert.ok(entry);assert.deepEqual(entry.content_ids,[type]);
  let decoded=0,clips=new Set();for(const name of entry.sheets){const raw=readFileSync(new URL('../assets/sprites/'+type+'/'+name,import.meta.url));const json=JSON.parse(raw);decoded+=json.meta.size.w*json.meta.size.h*4;assert.equal(entry.cacheVersion,sha(raw));
   const image=new URL('../assets/sprites/'+type+'/'+json.meta.image.split('?')[0],import.meta.url);
   assert.equal(new URL(json.meta.image,'https://assets.example/').searchParams.get('v'),sha(readFileSync(image)));
   Object.keys(json.animations).forEach(k=>clips.add(k));}
  assert.ok(decoded<=16*1048576,type+' exceeds decoded 16 MiB');for(const state of ['idle','run','attack','hit','death'])for(const direction of ['E','SE','S','SW','W','NW','N','NE'])assert.ok(clips.has(state+'_'+direction));
 }
});
test('each new monster actually executes both distinct actions at the intended ranges',()=>{
 for(const [type,dx] of [['dune_cactoro',250],['sun_totem',70],['crown_alpaking',250]]){
  const world=createWorld({seed:11});addPlayer(world,{pid:'a',x:400,y:400,mods:{maxHp:100000}});
  const monster=spawnMonster(world,type,400+dx,400);monster.spawnLeft=0;
  const used=new Set();for(let tick=0;tick<540;tick++)for(const event of step(world))if(event.type==='act'&&event.id===monster.id)used.add(event.ability);
  assert.deepEqual([...used].sort(),[...MONSTERS[type].abilities].sort(),type+' missing action');
 }
});
test('recommended player clears each dunes stage and persists real settlement',()=>{
 for(const id of ids){const save=preset(id);save.cleared.S20=save.cleared.S23=save.cleared.S27=save.cleared.S30=save.cleared.S33=save.cleared.S36=true;
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
  if(id!=='S39')assert.equal(mapUnlocked(out.save,ids[ids.indexOf(id)+1]),true);
 }
});

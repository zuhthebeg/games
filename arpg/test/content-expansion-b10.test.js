import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MONSTERS, STAGES, ABILITIES } from '../js/content/combat.js';
import { BALANCE } from '../js/content/balance.js';
import { BIOMES, biomeForStage } from '../js/content/biomes.js';
import { MONSTER_VARIANTS } from '../js/content/monsters.js';
import { MAPS, REGIONS, REGION_ROUTE, REGION_EDGES, mapUnlocked } from '../js/content/world-map.js';
import { STAGE_XP } from '../js/meta/progression.js';
import { createSave, validateSave } from '../js/meta/save.js';
import { createWorld, addPlayer, startStage, step, spawnMonster, setLoad } from '../js/sim/world.js';
import { rollDrops } from '../js/meta/items.js';
import { ATLAS_IDS } from '../js/render/atlas-state.js';
import { SPECIES_AUDIO } from '../js/audio-profile.js';
import { preset } from '../tools/balance/botsim.mjs';
import { botInput } from '../tools/balance/bot.js';
import { buildRoundMods, createTracker, trackRound, settleRound, usedConsumables, currentLoad } from '../js/meta/run.js';

const ids=['S55','S56','S57'],types=['lunar_bunny','lunar_crab','lunar_ninja'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').slice(0,12);
test('lunar route follows orbital S54 gate, alternating map and monotonic balance/XP',()=>{
 const save=createSave({name:'이전 영웅',answers:[0,0,0,0,0],createdAt:1});for(const id of ids)assert.equal(mapUnlocked(save,id),false);
 for(const n of [20,23,27,30,33,36,39,42,45,48,51])save.cleared['S'+n]=true;assert.equal(mapUnlocked(save,'S55'),false);save.cleared.S54=true;assert.equal(mapUnlocked(save,'S55'),true);
 for(let i=0;i<2;i++){assert.deepEqual(MAPS[ids[i+1]].requires,[ids[i]]);assert.equal(mapUnlocked(save,ids[i+1]),false);save.cleared[ids[i]]=true;assert.equal(mapUnlocked(save,ids[i+1]),true)}
 assert.deepEqual(REGIONS.find(r=>r.id==='lunar').maps,ids);assert.deepEqual(REGION_ROUTE.lunar,[17,2]);assert.ok(REGION_EDGES.some(([a,b])=>a==='orbital'&&b==='lunar'));assert.ok(BIOMES.lunar_garden);
 for(let i=0;i<3;i++){const id=ids[i],prior='S'+(54+i);assert.equal(biomeForStage(id),'lunar_garden');assert.ok(STAGE_XP[id]>STAGE_XP[prior]);assert.ok(BALANCE.stages[id].hp>BALANCE.stages[prior].hp);assert.ok(BALANCE.stages[id].damage>BALANCE.stages[prior].damage);assert.equal(STAGES[id].goal,'killAll');assert.ok(STAGES[id].spawns.every(s=>types.includes(s.monster)))}
 assert.equal(BALANCE.stages.S57.eliteChance,1);assert.equal(STAGES.S57.spawns[0].monster,'lunar_ninja');assert.deepEqual(Object.keys(STAGES).filter(id=>/^S5[5-7]$/.test(id)),ids);
});
test('three native CC0 lunar models have 40 animated clips each within mobile decode budget',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../assets/sprites/manifest.json',import.meta.url)));
 for(const type of types){assert.equal(ATLAS_IDS[type],type);assert.ok(SPECIES_AUDIO[type]);assert.equal(MONSTER_VARIANTS[type].lifeState,MONSTERS[type].lifeState);assert.ok(MONSTERS[type].abilities.every(id=>ABILITIES[id]));assert.ok(Object.entries(MONSTERS).every(([id,m])=>id===type||[...m.abilities].sort().join()!==[...MONSTERS[type].abilities].sort().join()),type);
  assert.ok(rollDrops(type,11,{stageId:'S55',huntTier:4,threat:1}).gold>0);const entry=manifest.find(e=>e.id===type);assert.ok(entry);assert.deepEqual(entry.content_ids,[type]);let decoded=0,clips=new Set();
  for(const name of entry.sheets){const raw=readFileSync(new URL('../assets/sprites/'+type+'/'+name,import.meta.url)),json=JSON.parse(raw);decoded+=json.meta.size.w*json.meta.size.h*4;assert.equal(entry.cacheVersion,sha(raw));const image=new URL('../assets/sprites/'+type+'/'+json.meta.image.split('?')[0],import.meta.url);assert.equal(new URL(json.meta.image,'https://assets.example/').searchParams.get('v'),sha(readFileSync(image)));Object.keys(json.animations).forEach(k=>clips.add(k))}
  assert.ok(decoded<=16*1048576,type);for(const state of ['idle','run','attack','hit','death'])for(const direction of ['E','SE','S','SW','W','NW','N','NE'])assert.ok(clips.has(state+'_'+direction),type+state+direction);
 }
});
test('all lunar monsters execute both unique combat actions',()=>{
 for(const [type,dx] of [['lunar_bunny',300],['lunar_crab',250],['lunar_ninja',250]]){const world=createWorld({seed:11});addPlayer(world,{pid:'a',x:400,y:400,mods:{maxHp:100000}});const monster=spawnMonster(world,type,400+dx,400);monster.spawnLeft=0;const used=new Set();for(let t=0;t<540;t++)for(const e of step(world))if(e.type==='act'&&e.id===monster.id)used.add(e.ability);assert.deepEqual([...used].sort(),[...MONSTERS[type].abilities].sort(),type)}
});
test('recommended player clears each lunar stage and persists actual settlement',()=>{
 for(const id of ids){const save=preset(id);for(const n of [20,23,27,30,33,36,39,42,45,48,51,54,55,56])if(n<Number(id.slice(1)))save.cleared['S'+n]=true;
  const world=createWorld({seed:11}),player=addPlayer(world,{pid:'a',mods:buildRoundMods(save)});let tracker=createTracker(11),kills=0;startStage(world,id);setLoad(world,'a',currentLoad(save,tracker).ratio);
  while(world.tick<18000&&world.round.state==='running'){const events=step(world,{a:botInput(world,player)});kills+=events.filter(e=>e.type==='kill').length;const out=trackRound(save,tracker,events,usedConsumables(save,player));tracker=out.tracker;setLoad(world,'a',out.load.ratio)}
  assert.equal(world.round.state,'clear',id+' hp '+player.hp);assert.equal(kills,STAGES[id].spawns.length);const out=settleRound(save,{stageId:id,terminal:player.terminal,...tracker,used:usedConsumables(save,player)});assert.ok(validateSave(out.save)&&out.save.cleared[id]);assert.ok(out.receipt.goldGained>0);if(id!=='S57')assert.equal(mapUnlocked(out.save,ids[ids.indexOf(id)+1]),true);
 }
});

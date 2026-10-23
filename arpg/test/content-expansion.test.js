import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STAGES, MONSTERS, ABILITIES } from '../js/content/combat.js';
import { BALANCE } from '../js/content/balance.js';
import { MONSTER_VARIANTS } from '../js/content/monsters.js';
import { BIOMES, biomeForStage } from '../js/content/biomes.js';
import { MAPS, REGIONS, mapUnlocked, REGION_EDGES } from '../js/content/world-map.js';
import { STAGE_XP } from '../js/meta/progression.js';
import { createSave, SaveStore, validateSave } from '../js/meta/save.js';
import { createWorld, addPlayer, startStage, step, spawnMonster } from '../js/sim/world.js';
import { rollDrops } from '../js/meta/items.js';
import { ATLAS_IDS, atlasScale } from '../js/render/atlas-state.js';
import { SPECIES_AUDIO } from '../js/audio-profile.js';
import { preset } from '../tools/balance/botsim.mjs';
import { botInput } from '../tools/balance/bot.js';
import { buildRoundMods, createTracker, trackRound, settleRound, usedConsumables, currentLoad } from '../js/meta/run.js';
import { setLoad } from '../js/sim/world.js';

const ids=['S28','S29','S30'];
const types=['ash_reaver','veil_stalker','cinder_oracle'];
const original=()=>createSave({name:'기존 캐릭터',answers:[0,0,0,0,0],createdAt:1});
test('ash frontier is gated behind S27 and old saves roundtrip unchanged',()=>{
 const save=original(), raw=JSON.stringify(save);assert.equal(validateSave(save),true);
 for(const id of ids)assert.equal(mapUnlocked(save,id),false);
 save.cleared.S27=true;assert.equal(mapUnlocked(save,'S28'),false);
 save.cleared.S20=true;assert.equal(mapUnlocked(save,'S28'),true);
 assert.equal(mapUnlocked(save,'S29'),false);
 for(let i=0;i<ids.length-1;i++){assert.deepEqual(MAPS[ids[i+1]].requires,[ids[i]]);save.cleared[ids[i]]=true;assert.equal(mapUnlocked(save,ids[i+1]),true);}
 assert.deepEqual(REGIONS.find(r=>r.id==='cinder').maps,ids);
 assert.ok(REGION_EDGES.some(([from,to])=>from==='necropolis'&&to==='cinder'));
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const store=new SaveStore(storage);const old=JSON.parse(raw);store.save(old);assert.deepEqual(store.load(),old);
 for(const id of ids)assert.equal(mapUnlocked(store.load(),id),false);
});
test('three distinct enemy AI kits spawn and act with existing abilities',()=>{
 assert.deepEqual(types.map(id=>MONSTERS[id].abilities),[
  ['chief_cleave','chief_charge','chief_slam'],['goblin_hop','goblin_slash'],['spirit_bolt']]);
 for(const id of types){assert.equal(ATLAS_IDS[id],id);assert.ok(SPECIES_AUDIO[id]);assert.equal(MONSTER_VARIANTS[id].lifeState,'living');
  assert.ok(MONSTERS[id].abilities.every(ability=>ABILITIES[ability]));
  const world=createWorld({seed:42});addPlayer(world,{pid:'a',x:400,y:400,mods:{maxHp:10000}});
  const enemy=spawnMonster(world,id,480,400);enemy.spawnLeft=0;
  let acts=0;for(let tick=0;tick<240;tick++)acts+=step(world).filter(event=>event.type==='act'&&event.id===enemy.id).length;
  assert.ok(acts>0,id+' acted');assert.ok(Number.isFinite(enemy.hp));
  const loot=rollDrops(id,12,{stageId:'S28',huntTier:4,threat:1});assert.ok(Number.isSafeInteger(loot.gold)&&loot.gold>0);
 }
});
test('each stage plays in new biome with bounded waves and elite finale',()=>{
 assert.ok(BIOMES.cinder_wastes);
 for(const id of ids){assert.equal(biomeForStage(id),'cinder_wastes');assert.ok(STAGE_XP[id]>STAGE_XP.S27);
  assert.equal(STAGES[id].goal,'killAll');assert.ok(STAGES[id].spawns.every(s=>types.includes(s.monster)));
  assert.equal(BALANCE.stages[id].huntTier,4);assert.ok(STAGES[id].maxConcurrent<=3);
  const world=createWorld({seed:7});addPlayer(world,{pid:'a'});startStage(world,id);
  const emitted=[];for(let i=0;i<200;i++)emitted.push(...step(world));
  assert.ok(emitted.some(event=>event.type==='spawn'),id+' spawned');
 }
 assert.equal(BALANCE.stages.S30.eliteChance,1);assert.equal(BALANCE.stages.S30.waves,1);
});
test('all five authored octant clips fit decoded texture budget',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../assets/sprites/manifest.json',import.meta.url)));
 for(const id of types){const entry=manifest.find(row=>row.id===id);assert.ok(entry,id);
  assert.deepEqual(entry.content_ids,[id]);assert.deepEqual(entry.animations,['idle','run','attack','hit','death']);
  let decoded=0;const clips=new Set();for(const sheet of entry.sheets){const meta=JSON.parse(readFileSync(new URL('../assets/sprites/'+id+'/'+sheet,import.meta.url)));
   decoded+=meta.meta.size.w*meta.meta.size.h*4;Object.keys(meta.animations).forEach(k=>clips.add(k));
  }
  assert.ok(decoded<=16*1048576,id+' decoded RGBA exceeds 16 MiB');
  for(const state of entry.animations)for(const direction of ['E','SE','S','SW','W','NW','N','NE'])assert.ok(clips.has(state+'_'+direction));
 }
});

test('recommended character clears each frontier stage and banks a valid next-stage save',()=>{
 for(const id of ids){const save=preset(id);save.cleared.S20=save.cleared.S23=save.cleared.S27=true;
  for(const prior of ids.slice(0,ids.indexOf(id)))save.cleared[prior]=true;
  const world=createWorld({seed:11}),player=addPlayer(world,{pid:'a',mods:buildRoundMods(save)});
  let tracker=createTracker(11),kills=0;startStage(world,id);setLoad(world,'a',currentLoad(save,tracker).ratio);
  while(world.tick<18000&&world.round.state==='running'){
   const events=step(world,{a:botInput(world,player)});kills+=events.filter(e=>e.type==='kill').length;
   const out=trackRound(save,tracker,events,usedConsumables(save,player));tracker=out.tracker;setLoad(world,'a',out.load.ratio);
  }
  assert.equal(world.round.state,'clear',id+' HP '+player.hp+' kills '+kills);
  assert.equal(kills,STAGES[id].spawns.length);
  const out=settleRound(save,{stageId:id,terminal:player.terminal,...tracker,used:usedConsumables(save,player)});
  assert.ok(out.save.cleared[id]);assert.ok(validateSave(out.save));assert.ok(out.receipt.goldGained>0);
  if(id!=='S30')assert.equal(mapUnlocked(out.save,ids[ids.indexOf(id)+1]),true);
 }
});

const frostIds=['S31','S32','S33'], frostTypes=['orc_raider','frost_yeti','stone_giant'];
test('orc atlas is enlarged once without changing combat radius or other monsters',()=>{
 const orc=spawnMonster(createWorld({seed:42}),'orc_raider',480,400,{stageId:'S31'});
 assert.equal(atlasScale(orc),1.3*orc.sizeScale);
 assert.equal(orc.r,MONSTERS.orc_raider.r*orc.sizeScale);
 assert.equal(atlasScale({type:'frost_yeti',sizeScale:1}),1);
});
test('frost cavern opens only after ash frontier and progresses sequentially',()=>{
 const save=original();for(const id of frostIds)assert.equal(mapUnlocked(save,id),false);
 save.cleared.S30=true;assert.equal(mapUnlocked(save,'S31'),false);
 save.cleared.S20=save.cleared.S27=true;assert.equal(mapUnlocked(save,'S31'),true);
 for(let i=0;i<frostIds.length-1;i++){assert.deepEqual(MAPS[frostIds[i+1]].requires,[frostIds[i]]);save.cleared[frostIds[i]]=true;assert.equal(mapUnlocked(save,frostIds[i+1]),true)}
 assert.deepEqual(REGIONS.find(r=>r.id==='frost').maps,frostIds);
 assert.ok(REGION_EDGES.some(([a,b])=>a==='cinder'&&b==='frost'));
});
test('Orc Yeti Giant use three distinctive telegraphed action pairs and native atlas kits',()=>{
 assert.deepEqual(frostTypes.map(id=>MONSTERS[id].abilities),[['chief_charge','goblin_slash'],['wolf_dash','wolf_bite'],['guardian_crush','guardian_ring']]);
 assert.equal(MONSTERS.frost_yeti.lifeState,'beast');
 const manifest=JSON.parse(readFileSync(new URL('../assets/sprites/manifest.json',import.meta.url)));
 for(const type of frostTypes){assert.equal(ATLAS_IDS[type],type);assert.ok(SPECIES_AUDIO[type]);
  const world=createWorld({seed:11});addPlayer(world,{pid:'a',x:400,y:400,mods:{maxHp:10000}});
  const enemy=spawnMonster(world,type,490,400);enemy.spawnLeft=0;
  let acted=false;for(let t=0;t<270;t++)acted ||= step(world).some(e=>e.type==='act'&&e.id===enemy.id);
  assert.ok(acted,type+' never attacked');assert.ok(Number.isFinite(enemy.hp));
  assert.ok(rollDrops(type,11,{stageId:'S31',huntTier:4,threat:1}).gold>0);
  const atlas=manifest.find(x=>x.id===type);assert.ok(atlas);assert.deepEqual(atlas.content_ids,[type]);
  let bytes=0;const clips=new Set();for(const sheet of atlas.sheets){const meta=JSON.parse(readFileSync(new URL('../assets/sprites/'+type+'/'+sheet,import.meta.url)));bytes+=meta.meta.size.w*meta.meta.size.h*4;Object.keys(meta.animations).forEach(x=>clips.add(x))}
  assert.ok(bytes<=16*1048576,type+' decoded budget');for(const state of ['idle','run','attack','hit','death'])for(const d of ['E','SE','S','SW','W','NW','N','NE'])assert.ok(clips.has(state+'_'+d));
 }
});
test('all three frost stages have bounded actor count and actual clears persist',()=>{
 assert.ok(BIOMES.frost_cavern);assert.equal(BALANCE.stages.S33.eliteChance,1);
 for(const id of frostIds){assert.equal(biomeForStage(id),'frost_cavern');assert.ok(STAGE_XP[id]>STAGE_XP.S30);assert.ok(STAGES[id].maxConcurrent<=3);
  assert.ok(STAGES[id].spawns.every(s=>frostTypes.includes(s.monster)));
  const save=preset(id);save.cleared.S20=save.cleared.S23=save.cleared.S27=save.cleared.S30=true;
  for(const prior of frostIds.slice(0,frostIds.indexOf(id)))save.cleared[prior]=true;
  const world=createWorld({seed:11}),player=addPlayer(world,{pid:'a',mods:buildRoundMods(save)});
  let tracker=createTracker(11),kills=0;startStage(world,id);setLoad(world,'a',currentLoad(save,tracker).ratio);
  while(world.tick<18000&&world.round.state==='running'){
   const events=step(world,{a:botInput(world,player)});kills+=events.filter(e=>e.type==='kill').length;
   const out=trackRound(save,tracker,events,usedConsumables(save,player));tracker=out.tracker;setLoad(world,'a',out.load.ratio);
  }
  assert.equal(world.round.state,'clear',id+' HP '+player.hp+' kills '+kills);assert.equal(kills,STAGES[id].spawns.length);
  const out=settleRound(save,{stageId:id,terminal:player.terminal,...tracker,used:usedConsumables(save,player)});
  assert.ok(validateSave(out.save)&&out.save.cleared[id]);assert.ok(out.receipt.goldGained>0);
  if(id!=='S33')assert.equal(mapUnlocked(out.save,frostIds[frostIds.indexOf(id)+1]),true);
 }
});

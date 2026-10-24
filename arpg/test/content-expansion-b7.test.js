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

const ids=['S46','S47','S48'], types=['clock_drone','clock_walker','clock_colossus'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').slice(0,12);
test('S46–S48 follow the abyss frontier without changing old save gates',()=>{
 const save=createSave({name:'이전 영웅',answers:[0,0,0,0,0],createdAt:1});assert.ok(validateSave(save));
 for(const id of ids)assert.equal(mapUnlocked(save,id),false);
 save.cleared.S45=true;assert.equal(mapUnlocked(save,'S46'),false);
 save.cleared.S20=save.cleared.S27=save.cleared.S30=save.cleared.S33=save.cleared.S36=save.cleared.S39=true;assert.equal(mapUnlocked(save,'S46'),false);
 save.cleared.S42=true;assert.equal(mapUnlocked(save,'S46'),true);
 // Old saves that already cleared S43–S44 but not S45 keep exactly their prior map access.
 assert.equal(mapUnlocked({cleared:{S20:true,S27:true,S30:true,S33:true,S36:true,S39:true,S42:true,S43:true,S44:true}},'S46'),false);
 assert.equal(mapUnlocked({cleared:{S20:true,S27:true,S30:true,S33:true,S36:true,S39:true,S42:true}},'S43'),true);
 for(let i=0;i<2;i++){assert.deepEqual(MAPS[ids[i+1]].requires,[ids[i]]);assert.equal(mapUnlocked(save,ids[i+1]),false);save.cleared[ids[i]]=true;assert.equal(mapUnlocked(save,ids[i+1]),true)}
 assert.deepEqual(REGIONS.find(r=>r.id==='clockwork').maps,ids);
 assert.ok(REGION_EDGES.some(([a,b])=>a==='abyss'&&b==='clockwork'));
 assert.ok(BIOMES.clockwork_ruins);
 for(const id of ids){assert.equal(biomeForStage(id),'clockwork_ruins');assert.ok(STAGE_XP[id]>STAGE_XP.S45);assert.equal(STAGES[id].goal,'killAll');assert.ok(STAGES[id].maxConcurrent<=3);assert.ok(STAGES[id].spawns.every(s=>types.includes(s.monster)))}
 assert.equal(BALANCE.stages.S48.eliteChance,1);assert.equal(STAGES.S48.spawns[0].monster,'clock_colossus');
 // Append-only registries: seeded tests iterate Object.keys order.
 assert.deepEqual(Object.keys(MONSTERS).slice(Object.keys(MONSTERS).indexOf('abyss_glub'),Object.keys(MONSTERS).indexOf('clock_colossus')+1),['abyss_glub','drowned_skull','abyss_squidle',...types]);
 assert.deepEqual(Object.keys(STAGES).filter(id=>/^S4[3-8]$/.test(id)),['S43','S44','S45',...ids]);
});
test('diving claw drone, rivet-gun walker and charging colossus use distinct native rigs within atlas budgets',()=>{
 assert.deepEqual(types.map(id=>MONSTERS[id].abilities),[['wolf_dash','goblin_slash'],['sling_stone','guardian_crush'],['chief_charge','guardian_ring']]);
 for(const type of types){assert.equal(MONSTERS[type].lifeState,'construct');assert.ok(MONSTER_VARIANTS[type].speciesTags.includes('machine'))}
 // Every pair is new: no shipped monster uses the same ability set.
 for(const type of types)assert.ok(Object.entries(MONSTERS).every(([id,m])=>id===type||[...m.abilities].sort().join()!==[...MONSTERS[type].abilities].sort().join()),type);
 const manifest=JSON.parse(readFileSync(new URL('../assets/sprites/manifest.json',import.meta.url)));
 for(const type of types){assert.equal(ATLAS_IDS[type],type);assert.ok(SPECIES_AUDIO[type]);assert.equal(MONSTER_VARIANTS[type].lifeState,MONSTERS[type].lifeState);
  assert.ok(MONSTERS[type].abilities.every(id=>ABILITIES[id]));
  const world=createWorld({seed:11});addPlayer(world,{pid:'a',x:400,y:400,mods:{maxHp:10000}});
  const monster=spawnMonster(world,type,485,400);monster.spawnLeft=0;let acts=0;
  for(let t=0;t<300;t++)acts+=step(world).filter(e=>e.type==='act'&&e.id===monster.id).length;
  assert.ok(acts>0,type+' did not attack');assert.ok(rollDrops(type,11,{stageId:'S46',huntTier:4,threat:1}).gold>0);
  const entry=manifest.find(e=>e.id===type);assert.ok(entry);assert.deepEqual(entry.content_ids,[type]);
  let decoded=0,clips=new Set();for(const name of entry.sheets){const raw=readFileSync(new URL('../assets/sprites/'+type+'/'+name,import.meta.url));const json=JSON.parse(raw);decoded+=json.meta.size.w*json.meta.size.h*4;assert.equal(entry.cacheVersion,sha(raw));
   const image=new URL('../assets/sprites/'+type+'/'+json.meta.image.split('?')[0],import.meta.url);
   assert.equal(new URL(json.meta.image,'https://assets.example/').searchParams.get('v'),sha(readFileSync(image)));
   Object.keys(json.animations).forEach(k=>clips.add(k));}
  assert.ok(decoded<=16*1048576,type+' exceeds decoded 16 MiB');for(const state of ['idle','run','attack','hit','death'])for(const direction of ['E','SE','S','SW','W','NW','N','NE'])assert.ok(clips.has(state+'_'+direction));
 }
});
test('each new monster actually executes both distinct actions at the intended ranges',()=>{
 for(const [type,dx] of [['clock_drone',300],['clock_walker',250],['clock_colossus',260]]){
  const world=createWorld({seed:11});addPlayer(world,{pid:'a',x:400,y:400,mods:{maxHp:100000}});
  const monster=spawnMonster(world,type,400+dx,400);monster.spawnLeft=0;
  const used=new Set();for(let tick=0;tick<540;tick++)for(const event of step(world))if(event.type==='act'&&event.id===monster.id)used.add(event.ability);
  assert.deepEqual([...used].sort(),[...MONSTERS[type].abilities].sort(),type+' missing action');
 }
});
test('no previously shipped stage, monster or player number changed for batch 7',()=>{
 for(const id of ['S43','S44','S45'])assert.deepEqual([BALANCE.stages[id].hp,BALANCE.stages[id].damage,BALANCE.stages[id].eliteChance],{S43:[8,2.95,.18],S44:[8.1,3,.18],S45:[8.3,3.05,1]}[id]);
 assert.deepEqual([STAGE_XP.S43,STAGE_XP.S44,STAGE_XP.S45],[4020,4120,4220]);assert.deepEqual(MAPS.S43.requires,['S42']);
 assert.deepEqual([MONSTERS.abyss_squidle.hp,MONSTERS.abyss_squidle.abilities],[360,['chief_cleave','guardian_ring']]);
 assert.deepEqual(STAGES.S45.spawns.map(s=>s.monster),['abyss_squidle','abyss_glub','drowned_skull']);
});
test('recommended player clears each clockwork stage and persists real settlement',()=>{
 for(const id of ids){const save=preset(id);save.cleared.S20=save.cleared.S23=save.cleared.S27=save.cleared.S30=save.cleared.S33=save.cleared.S36=save.cleared.S39=save.cleared.S42=save.cleared.S45=true;
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
  if(id!=='S48')assert.equal(mapUnlocked(out.save,ids[ids.indexOf(id)+1]),true);
 }
});
test('14-row route map places clockwork below abyss and keeps the tapped region quest list on screen',async()=>{
 const {HubUI}=await import('../js/ui/hub.js');
 const save=createSave({name:'태엽 지도',answers:[0,0,0,0,0],createdAt:1});for(const id of Object.keys(MAPS))if(!/^S4[6-8]$/.test(id))save.cleared[id]=true;
 const previous=globalThis.innerHeight;globalThis.innerHeight=844;
 try{for(const [top,expected] of [[2100,1],[-1200,1],[120,0]]){
  let scrolled=0;const section={getBoundingClientRect:()=>({top}),scrollIntoView:o=>{assert.deepEqual(o,{block:'start'});scrolled++}};
  const hub=Object.assign(Object.create(HubUI.prototype),{save,root:{querySelector:sel=>sel==='#map-region-clockwork'?section:null},showInnPanel(title,html){this.html=html}});
  hub.action('map-region',{region:'clockwork'});
  assert.equal(hub.mapRegion,'clockwork');assert.match(hub.html,/data-region="clockwork"[^>]*grid-row:14;grid-column:1/);assert.match(hub.html,/data-route="abyss:clockwork"/);
  assert.match(hub.html,/world-map\/clockwork\.webp\?v=0139e2e7fc5b/);assert.equal(scrolled,expected,String(top));
 }}finally{globalThis.innerHeight=previous}
});

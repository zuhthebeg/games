import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,addPlayer,spawnMonster,step,emptyInput,startStage} from '../../js/sim/world.js';
import {MONSTERS,STAGES} from '../../js/content/combat.js';
import {MONSTER_VARIANTS,MONSTER_NAMES} from '../../js/content/monsters.js';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const HUMAN='undead_lab_human_melee';
const trace=()=>{const w=createWorld({seed:23});addPlayer(w,{pid:'old'});startStage(w,'S2');const out=[];for(let i=0;i<240;i++){step(w,{old:{...emptyInput(),mx:i<50?1:0,attack:i>80,dodgeEdge:i===60}});out.push(JSON.stringify(w));}return createHash('sha256').update(out.join('\n')).digest('hex');};
// Captured before source edits, exact complete serialized world on every tick.
const baseline=JSON.parse(readFileSync(new URL('baseline.json',import.meta.url)));
test('old human positions, default facing/dodge and full S2 trace are exact baseline',()=>{assert.equal(trace(),baseline.trace);const w=createWorld();const p=addPlayer(w,{pid:'old'});assert.deepEqual([p.x,p.y,p.facing],[308,430,0]);assert.equal(Object.hasOwn(p,'dodgeDisabled'),false);step(w,{old:{...emptyInput(),dodgeEdge:true}});assert.ok(p.dodge.dashLeft>0);});
test('explicit facing setup uses public APIs, opt-in dodge disabled without input mutation',()=>{const w=createWorld();const p=addPlayer(w,{pid:'skeleton',facing:Math.PI,dodgeEnabled:false});const m=spawnMonster(w,'skeleton_minion',200,430,{facing:0});assert.equal(p.facing,Math.PI);assert.equal(m.facing,0);const input=Object.freeze({...emptyInput(),dodgeEdge:true,mx:-1});step(w,{skeleton:input});assert.equal(p.dodge.dashLeft,0);assert.equal(p.bufferDodge,0);assert.equal(input.dodgeEdge,true);});
test('new human is living human with exact simple melee donor numbers/abilities',()=>{assert.ok(MONSTERS[HUMAN]);assert.deepEqual(MONSTERS[HUMAN],{...MONSTERS.skeleton_minion,lifeState:'living'});assert.equal(MONSTER_VARIANTS[HUMAN].lifeState,'living');assert.deepEqual(MONSTER_VARIANTS[HUMAN].speciesTags,['human','humanoid']);assert.match(MONSTER_NAMES[HUMAN],/인간/);assert.equal(createHash('sha256').update(JSON.stringify(STAGES)).digest('hex'),baseline.stagesSha256);});
test('strict opt-in knight setup, no stage/save/reward plumbing',async()=>{const mod=await import('./encounter.js');const {world,player,human}=mod.createEncounter();assert.equal(world.round,null);assert.equal(world.entities.length,2);assert.equal(player.weapon,'blade');assert.equal(human.type,HUMAN);assert.equal(player.facing,Math.PI);assert.equal(human.facing,0);assert.ok(player.x>world.arena.w/2&&human.x<world.arena.w/2);for(const lineage of ['human','lich','skeleton_archer','skeleton_mage','__proto__','unknown',null])assert.throws(()=>mod.createEncounter({lineage}));assert.equal(createHash('sha256').update(JSON.stringify(STAGES)).digest('hex'),baseline.stagesSha256);});
test('actual human AI approaches, attacks, hits and kills stationary skeleton via real step',async()=>{const {createEncounter}=await import('./encounter.js');const {world,player,human}=createEncounter();const x=human.x;const events=[];for(let i=0;i<2400&&!player.dead;i++)events.push(...step(world,{skeleton:emptyInput()}));assert.ok(human.x>x);assert.ok(events.some(e=>e.type==='hit'&&e.src===human.id));assert.ok(player.dead);assert.ok(player.hp<=0);});
test('actual player movement and basic inputs hit and kill human, without state writes',async()=>{const {createEncounter}=await import('./encounter.js');const {world,player,human}=createEncounter();const events=[];for(let i=0;i<1800&&!human.dead&&!player.dead;i++){const dx=human.x-player.x,dy=human.y-player.y;events.push(...step(world,{skeleton:{...emptyInput(),mx:Math.abs(dx)>55?Math.sign(dx):0,my:Math.abs(dy)>15?Math.sign(dy):0,aimX:dx,aimY:dy,attack:true}}));}assert.ok(events.some(e=>e.type==='hit'&&e.src===player.id));assert.ok(human.dead);assert.ok(!player.dead);});

test('all existing combat/identity data and six full solo/host traces are exact pinned baseline',async()=>{
 const c=await import('../../js/content/combat.js');const m=await import('../../js/content/monsters.js');
 const omit=(obj,key)=>Object.fromEntries(Object.entries(obj).filter(([k])=>k!==key));
 const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
 assert.equal(hash({...c,MONSTERS:omit(c.MONSTERS,HUMAN)}),baseline.catalog);
 assert.equal(hash({...m,MONSTER_MODELS:m.MONSTER_MODELS.filter(k=>k!==HUMAN),MONSTER_NAMES:omit(m.MONSTER_NAMES,HUMAN),MONSTER_VARIANTS:omit(m.MONSTER_VARIANTS,HUMAN),MONSTER_PALETTES:omit(m.MONSTER_PALETTES,'human')}),baseline.metadata);
 const {trace}=await import('../../test/fixtures/n3/trace.mjs');const {withoutCombos}=await import('../../test/av1-dps.mjs');const {enableGuestDodgeLag}=await import('../../js/sim/dodge-lag.js');
 assert.deepEqual(withoutCombos(()=>[trace(),trace(true,enableGuestDodgeLag),trace(true,enableGuestDodgeLag,true)]),baseline.n3);
 assert.deepEqual([trace(),trace(true,enableGuestDodgeLag),trace(true,enableGuestDodgeLag,true)],baseline.av1);
});

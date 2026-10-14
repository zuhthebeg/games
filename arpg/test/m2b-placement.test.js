import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as combat from '../js/content/combat.js';
import {BALANCE} from '../js/content/balance.js';
import {MONSTER_NAMES} from '../js/content/monsters.js';
import {rollDrops} from '../js/meta/items.js';
import {SaveStore,validateSave} from '../js/meta/save.js';
import {buildRoundMods,createTracker,trackRound,settleRound,usedConsumables} from '../js/meta/run.js';
import {createWorld,addPlayer,startStage,step,setLoad} from '../js/sim/world.js';
import {questEvents,rewardSave} from './fixtures/quest-rewards.js';
import {preset} from '../tools/balance/botsim.mjs';
import {botInput} from '../tools/balance/bot.js';
import {placementTraces} from './m2b-placement-trace.mjs';
import {NEW_MONSTER_DROPS} from '../js/content/loot.js';
import {comboWorldTraces} from './av1-world-trace.mjs';
import {masteryTraces} from './skill-mastery-trace.mjs';
import {MASTERY_SKILLS} from '../js/meta/skill-mastery.js';
const root=new URL('../../',import.meta.url),base='ded59e3';
const targets={S8:[0,'slime'],S12:[2,'goleling'],S17:[3,'demon']};
async function oldCombat(){
 let source=execFileSync('git',['show',base+':arpg/js/content/combat.js'],{cwd:root,encoding:'utf8'});
 source=source.replace(/from '([^']+)'/g,(_,p)=>'from '+JSON.stringify(new URL(p,new URL('../js/content/combat.js',import.meta.url)).href));
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
test('M2b placement exact three first-wave escort replacements preserve all encounter and XP budgets',async()=>{
 const old=await oldCombat();assert.deepEqual(Object.keys(combat),Object.keys(old));
 for(const [key,value] of Object.entries(old)) {
  if(typeof value==='function')assert.equal(combat[key].toString(),value.toString(),key);
  else if(!['MONSTERS','STAGES'].includes(key))assert.deepEqual(combat[key],value,key);
 }
 for(const [id,s] of Object.entries(old.STAGES)){
  const expected=structuredClone(s),replacement=targets[id];
  if(replacement){assert.equal(expected.spawns[replacement[0]].monster,'goblin_grunt');expected.spawns[replacement[0]].monster=replacement[1];}
  assert.deepEqual(combat.STAGES[id],expected,id);
  const xp=rows=>rows.reduce((sum,e)=>sum+combat.MONSTERS[e.monster].xp,0);
  assert.equal(xp(s.spawns),xp(combat.STAGES[id].spawns),id+' kill XP');
 }
 for(const [id,m] of Object.entries(old.MONSTERS))if(!Object.values(targets).some(v=>v[1]===id))assert.deepEqual(combat.MONSTERS[id],m,id);
 for(const [stage,[,id]] of Object.entries(targets)){
  const m=combat.MONSTERS[id],grunt=combat.MONSTERS.goblin_grunt;
  for(const k of ['hp','xp','poise','kbResist'])assert.equal(m[k],grunt[k],id+'/'+k);
  const expected={...old.MONSTERS[id],hp:62,poise:30,kbResist:0,xp:8};
  if(id!=='slime'){expected.speed=118;expected.keepRange=[40,70];}
  assert.deepEqual(m,expected,id+' exact approved escort stat delta');
  assert.deepEqual(m.abilities,old.MONSTERS[id].abilities,id+' ability gate');
  assert.ok(m.speed<=grunt.speed);assert.equal(combat.STAGES[stage].spawns.filter(s=>s.monster===id).length,1);
  assert.ok(BALANCE.stages[stage].huntTier>=2,'explicit hunt tier avoids NEW_MONSTER_DROPS default-tier inflation');
 }
 assert.equal(MONSTER_NAMES.goleling,'고링');
});
test('M2b frozen source/art/atlas/HUD/sim/net and objective/tuning/economy bytes; only content and tests differ',()=>{
 const paths=execFileSync('git',['diff','--name-only',base,'--','arpg'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
 const allowed=new Set(['arpg/js/content/combat.js','arpg/js/content/loot.js','arpg/index.html']);
 for(const p of paths)assert.ok(allowed.has(p)||p.startsWith('arpg/test/'),p);
 // If the parent stamps later, require the exact generated stamp result, never arbitrary index edits.
 const original=execFileSync('git',['show',base+':arpg/index.html'],{cwd:root,encoding:'utf8'});
 const current=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 let stamped=original;
 for(const p of ['js/content/combat.js','js/content/loot.js']){
  const hash=createHash('sha256').update(readFileSync(new URL('../'+p,import.meta.url))).digest('hex').slice(0,10);
  stamped=stamped.replace(new RegExp('(\\./'+p.replaceAll('.','\\.')+'\\?v=)[a-f0-9]{10}'),'$1'+hash);
 }
 assert.ok(current===original||current===stamped);
});
test('M2b loot adds exactly three grunt-equivalent tables and preserves every original table',async()=>{
 const source=execFileSync('git',['show',base+':arpg/js/content/loot.js'],{cwd:root,encoding:'utf8'});
 const old=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const current=await import('../js/content/loot.js');
 assert.deepEqual(Object.keys(current),Object.keys(old));
 for(const [key,value] of Object.entries(old))if(key!=='NEW_MONSTER_DROPS')assert.deepEqual(current[key],value,key);
 const added=['demon','goleling','slime'];
 assert.deepEqual(Object.keys(NEW_MONSTER_DROPS).filter(k=>!added.includes(k)),Object.keys(old.NEW_MONSTER_DROPS));
 for(const [id,table] of Object.entries(old.NEW_MONSTER_DROPS))assert.deepEqual(NEW_MONSTER_DROPS[id],table,id);
 for(const id of added)assert.deepEqual(NEW_MONSTER_DROPS[id],{gold:[3,6],stacks:[{id:'scrap',count:1,chance:.6},{id:'fang',count:1,chance:.4},{id:'potion',count:1,chance:.15}],items:[{id:'goblin_cleaver',chance:.06}]});
});
test('M2b seeded raw drops equal grunt byte-for-byte: gold, stacks, legacy gear, ordinary gear, stones and scrolls',()=>{
 for(const [stage,[,id]] of Object.entries(targets))for(const threat of [1,2,3])for(const elite of [false,true])for(const bonus of [0,20])for(let seed=0;seed<256;seed++){
  const ctx={stageId:stage,huntTier:BALANCE.stages[stage].huntTier,threat,elite,goldBonus:bonus,materialBonus:bonus,dropLuck:bonus/100};
  assert.deepEqual(rollDrops(id,seed,ctx),rollDrops('goblin_grunt',seed,ctx),`${id}/${seed}/${threat}/${elite}/${bonus}`);
 }
});
test('M2b full encounter reward/settlement budget equals previous roster for all threats and first/repeat rounds',()=>{
 for(const stage of Object.keys(targets))for(const threat of [1,2,3])for(let seed=1;seed<=40;seed++)for(const repeat of [false,true]){
  const s=rewardSave(stage,threat);if(repeat)s.cleared[stage]=true;
  const events=questEvents(stage,seed,threat).map(e=>({...e,xp:combat.MONSTERS[e.monster].xp}));
  const old=events.map(e=>({...e,monster:Object.values(targets).some(v=>v[1]===e.monster)?'goblin_grunt':e.monster}));
  const a=trackRound(s,createTracker(seed),events).tracker,b=trackRound(s,createTracker(seed),old).tracker;
  assert.deepEqual(a,b);assert.ok(a.gearAwarded<=a.gearBudget&&a.gearBudget<=2);
  const result=settleRound(s,{stageId:stage,terminal:'clear',...a});
  assert.deepEqual(result,settleRound(s,{stageId:stage,terminal:'clear',...b}));assert.ok(validateSave(result.save));
 }
});
for(const [stage,[,id]] of Object.entries(targets))test(`M2b ${stage}: recommended-level gear bot kills actual ${id}, deposits and settles valid roundtrip save`,()=>{
 for(const seed of [1,11,79]){
  const s=preset(stage),w=createWorld({seed}),p=addPlayer(w,{pid:'a',mods:buildRoundMods(s)});startStage(w,stage);
  let tracker=createTracker(seed),kills=0,newKills=0;
  for(let t=0;t<18000&&w.round.state==='running';t++){
   const events=step(w,{a:botInput(w,p)});kills+=events.filter(e=>e.type==='kill').length;newKills+=events.filter(e=>e.type==='kill'&&e.monster===id).length;
   const out=trackRound(s,tracker,events,usedConsumables(s,p));tracker=out.tracker;setLoad(w,'a',out.load.ratio);
  }
  assert.equal(w.round.state,'clear',stage+'/'+seed+' hp='+p.hp);assert.equal(newKills,1);assert.equal(kills,combat.STAGES[stage].spawns.length);
  assert.ok(tracker.tempLoot.gold>0);const out=settleRound(s,{stageId:stage,terminal:p.terminal,...tracker,used:usedConsumables(s,p)});
  assert.ok(validateSave(out.save));assert.ok(out.save.cleared[stage]);assert.ok(out.receipt.lootKept.items.length<=2);
  const map=new Map(),store=new SaveStore({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});store.save(out.save);assert.deepEqual(store.load(),out.save);
 }
});
test('M2b 243 current host traces: all 216 non-target traces identical, exactly 27 target traces changed',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'arpg-m2b-traces-'));
 try{
  const archive=execFileSync('git',['archive',base,'arpg/js','package.json'],{cwd:root,maxBuffer:10*1024*1024});
  execFileSync('tar',['-x','-C',dir],{input:archive});
  const before=await placementTraces(pathToFileURL(dir+'/')),after=await placementTraces(root);
  assert.equal(before.length,243);assert.equal(after.length,243);let changed=0;
  for(let i=0;i<before.length;i++)if(targets[before[i].stage]){assert.notEqual(after[i].sha256,before[i].sha256);changed++;}else assert.deepEqual(after[i],before[i],before[i].stage);
  assert.equal(changed,27);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('M2b actual roster retains every non-target AV1 and mastery fixture, with differences confined to the three target maps',()=>{
 const comboBaseline=JSON.parse(readFileSync(new URL('./fixtures/av1-enabled-world-traces.json',import.meta.url)));
 const masteryBaseline=JSON.parse(readFileSync(new URL('./fixtures/skill-mastery-traces.json',import.meta.url)));
 const actuals=[['combo',comboWorldTraces(),comboBaseline],
  ['mastery empty',masteryTraces(),masteryBaseline],
  ['mastery max',masteryTraces(Object.fromEntries(MASTERY_SKILLS.map(id=>[id,500]))),masteryBaseline]];
 for(const [name,actual,baseline] of actuals){
  assert.deepEqual(Object.keys(actual.traces),Object.keys(baseline.traces),name);
  let changed=0,identical=0;
  for(const [key,value] of Object.entries(baseline.traces)){
   if(targets[key.split('/')[0]]){assert.notDeepEqual(actual.traces[key],value,name+'/'+key);changed++;}
   else {assert.deepEqual(actual.traces[key],value,name+'/'+key);identical++;}
  }
  assert.equal(changed,9,name);assert.equal(identical,72,name);
 }
});

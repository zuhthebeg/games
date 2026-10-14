import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {STAGES,MONSTERS} from '../js/content/combat.js';
import {createWorld,addPlayer,startStage,step,emptyInput} from '../js/sim/world.js';
import {createSave,validateSave,SaveStore} from '../js/meta/save.js';
import {createTracker,trackRound,settleRound,buildRoundMods,usedConsumables} from '../js/meta/run.js';
import {placementTraces} from './m2b-placement-trace.mjs';
const root=new URL('../../',import.meta.url),base='d38de8f';
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:16*1024*1024});

test('approved S1 change removes only training_dragon spawn; all other combat bytes and parent HP/damage/prices survive',()=>{
 const before=git('show',base+':arpg/js/content/combat.js').toString();
 const removed="    spawns: [{ monster: 'scarecrow', at: 0, fx: 0.62, fy: 0.5 },\n      { monster: 'training_dragon', at: 0, fx: 0.82, fy: 0.5 }],";
 assert.equal(before.split(removed).length,2);assert.equal(readFileSync(new URL('../js/content/combat.js',import.meta.url),'utf8'),before.replace(removed,"    spawns: [{ monster: 'scarecrow', at: 0, fx: 0.62, fy: 0.5 }],"));
 assert.equal(MONSTERS.training_dragon.invulnerable,true);assert.equal(MONSTERS.training_dragon.hp,1);assert.equal(MONSTERS.training_dragon.xp,0);
 assert.deepEqual(STAGES.S1.spawns,[{monster:'scarecrow',at:0,fx:.62,fy:.5}]);assert.equal(STAGES.S1.timerMs,30000);assert.equal(STAGES.S1.goal,'timer');assert.equal(STAGES.S1.maxConcurrent,2);assert.equal(STAGES.TD1.spawns[0].monster,'throne_dragon');
 for(const p of ['arpg/js/content/balance.js','arpg/js/meta/items.js'])assert.deepEqual(readFileSync(new URL(p,root)),git('show','66a7b5b:'+p));
 for(const p of git('ls-tree','-r','--name-only',base,'arpg/assets/sprites/dragon','arpg/assets/sprites/throne-dragon').toString().trim().split('\n'))assert.deepEqual(readFileSync(new URL(p,root)),git('show',base+':'+p),p);
});

test('S1 one retained target runs exact900 ticks, takes no deaths/loot, pays unchanged50XP and persists valid level2 save',()=>{
 const save=createSave({name:'S1-check',answers:[0,0,0,0,0],weapon:'blade',createdAt:11});const w=createWorld({seed:11}),p=addPlayer(w,{pid:'a',mods:buildRoundMods(save)});startStage(w,'S1');let tracker=createTracker(11);
 for(let t=0;t<900;t++){
  const events=step(w,{a:{...emptyInput(),autoAttack:true}});tracker=trackRound(save,tracker,events,usedConsumables(save,p)).tracker;
  assert.deepEqual(w.entities.filter(e=>e.kind==='monster').map(e=>e.type),['scarecrow']);assert.equal(w.entities.find(e=>e.type==='scarecrow').dead,false);
  if(t<899)assert.equal(w.round.state,'running');
 }
 assert.equal(w.round.t,900);assert.equal(w.round.state,'clear');assert.equal(p.terminal,'clear');assert.equal(tracker.killIndex,0);assert.equal(tracker.depositedXp,0);assert.deepEqual(tracker.tempLoot,{gold:0,items:[],stacks:{}});
 const out=settleRound(save,{stageId:'S1',terminal:'clear',...tracker,used:usedConsumables(save,p)});assert.equal(out.receipt.stageXp,50);assert.equal(out.receipt.xpGained,50);assert.equal(out.save.level,2);assert.ok(out.save.cleared.S1);assert.ok(validateSave(out.save));
 const map=new Map(),store=new SaveStore({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});store.save(out.save);assert.deepEqual(store.load(),out.save);
});

test('S1 current final module graph differs only in9 S1 traces from merged d38de8f checkpoint; all234 other traces unchanged',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'arpg-s1-removal-'));
 try{execFileSync('tar',['-x','-C',dir],{input:git('archive',base,'arpg/js','package.json')});const before=await placementTraces(pathToFileURL(dir+'/')),after=await placementTraces(root);assert.equal(before.length,243);let changed=0;
 for(let i=0;i<before.length;i++)if(before[i].stage==='S1'){assert.notEqual(after[i].sha256,before[i].sha256);changed++;}else assert.deepEqual(after[i],before[i],before[i].stage);
 assert.equal(changed,9);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

import { writeFileSync,readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createWorld,addPlayer,startStage,step,setLoad,emptyInput } from '../../js/sim/world.js';
import { SIM_HZ } from '../../js/sim/core.js';
import { createSave,validateSave } from '../../js/meta/save.js';
import { allocateStats,cap } from '../../js/meta/stats.js';
import { buildRoundMods,createTracker,trackRound,usedConsumables,currentLoad } from '../../js/meta/run.js';
import { ITEMS,instance } from '../../js/meta/items.js';
import { ECONOMY } from '../../js/meta/economy.js';
import { gearPrice } from '../../js/meta/shop.js';
import { botInput } from './bot.js';

export const LIMITATION='봇은 정확한 경고 도형과 모든 적 위치를 읽으며 사람보다 낙관적이다. 200ms 판단 간격에도 터치·시야·실수·폰 성능을 재현하지 않는다. S1은 무적 허수아비 30초 계약으로 사망/3~6분 목표의 예외다.';
export function preset(stageId,{level,rarity='fine',enhance=0,weapon='blade',stats='balanced'}={}) {
  const s=Number(stageId.slice(1));
  const save=createSave({name:'봇',answers:[0,0,0,0,0],weapon,createdAt:1});
  save.level=level??[1,2,3,4,5,5,6][s-1];save.statPoints=3*(save.level-1);
  const allocation={};let left=save.statPoints;
  const keys=stats==='agile'?['agi','str','wis']:['str','agi','wis','int','cha'];
  while(left) for(const key of keys) if(left && save.stats[key]+(allocation[key]||0)<cap(save.level)) {
    allocation[key]=(allocation[key]||0)+1;left--;
  }
  const next=allocateStats(save,allocation);
  if(s!==1) {
    const tier=save.level>=5?2:1;
    const bases={weapon:tier===2?{blade:'rune_blade',bow:'pack_bow',focus:'altar_staff'}[weapon]:{blade:'iron_sword',bow:'hunter_bow',focus:'ember_wand'}[weapon],
      body:tier===2?'woven_armor':'leather_vest',head:`head_medium_fine_t${tier}`,hands:`hands_medium_fine_t${tier}`,feet:`feet_medium_fine_t${tier}`};
    next.items=[];
    for(const [slot,base] of Object.entries(bases)) {
      const id=ITEMS[base].rarity===rarity?base:`${base}_${rarity}`;
      const item=instance(`preset:${slot}`,id,1,[]);item.enhance=enhance;
      next.items.push(item);next.equipped[slot]=item.uid;
    }
  }
  if(!validateSave(next)) throw new Error('Invalid level/gear preset');
  return next;
}
export function simulate({stage='S2',threat=1,seed=1,maxTicks=30*60*10,...options}={}) {
  const save=preset(stage,options);save.threat=threat;
  const world=createWorld({seed,threat});
  const player=addPlayer(world,{pid:'bot',weapon:options.weapon||'blade',mods:buildRoundMods(save)});
  startStage(world,stage);
  let tracker=createTracker(seed),input=emptyInput(),kills=0,elites=0,potions=0;
  setLoad(world,'bot',currentLoad(save,tracker).ratio);
  while(world.round.state==='running' && world.tick<maxTicks) {
    if(world.tick%6===0) input=botInput(world,player);
    const events=step(world,{bot:input});
    // Edge buttons are consumed once, not held until the next policy decision.
    input={...input,skillEdge:false,dodgeEdge:false,potionEdge:false};
    potions+=events.filter(e=>e.type==='potion').length;
    const killed=events.filter(e=>e.type==='kill');kills+=killed.length;elites+=killed.filter(e=>e.elite).length;
    if(killed.length || events.some(e=>e.type==='potion')) {
      const result=trackRound(save,tracker,events,usedConsumables(save,player));tracker=result.tracker;
      setLoad(world,'bot',result.load.ratio);
    }
  }
  const clear=world.round.state==='clear',death=player.terminal==='death';
  const loot=tracker.tempLoot,gear={common:0,fine:0,rare:0,epic:0};
  for(const item of loot.items) gear[ITEMS[item.id].rarity]++;
  const stones=[1,2,3].map(i=>loot.stacks[`enhance_stone_${i}`]||0);
  const sale=loot.items.reduce((sum,item)=>sum+Math.floor(gearPrice(item)*ECONOMY.sellFraction),0);
  return {seed,state:world.round.state,ticks:world.tick,minutes:world.tick/SIM_HZ/60,clear,death,timeout:!clear&&!death,
    potions,kills,elites,generatedGold:loot.gold,gold:clear?loot.gold:0,gear:clear?gear:{common:0,fine:0,rare:0,epic:0},
    stones:clear?stones:[0,0,0],skipped:tracker.skipped,
    // Liquid value only: retained gold + gear vendor price - consumed HP potion replacement cost.
    // Stones/materials have no gold sale contract and are reported separately, never invented prices.
    expectedValue:(clear?loot.gold+sale:0)-potions*ITEMS.potion.price};
}
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2:null;};
export function summarize(runs) {
  const clears=runs.filter(r=>r.clear);
  return {n:runs.length,clearRate:mean(runs.map(r=>+r.clear)),deathRate:mean(runs.map(r=>+r.death)),timeoutRate:mean(runs.map(r=>+r.timeout)),
    meanClearTicks:mean(clears.map(r=>r.ticks)),medianClearTicks:median(clears.map(r=>r.ticks)),
    meanClearMinutes:mean(clears.map(r=>r.minutes)),medianClearMinutes:median(clears.map(r=>r.minutes)),
    potions:mean(runs.map(r=>r.potions)),kills:mean(runs.map(r=>r.kills)),elites:mean(runs.map(r=>r.elites)),gold:mean(runs.map(r=>r.gold)),
    gear:Object.fromEntries(['common','fine','rare','epic'].map(k=>[k,mean(runs.map(r=>r.gear[k]))])),
    stones:[0,1,2].map(i=>mean(runs.map(r=>r.stones[i]))),expectedValue:mean(runs.map(r=>r.expectedValue)),skipped:mean(runs.map(r=>r.skipped))};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [k,v]=a.replace(/^--/,'').split('=');return [k,v];}));
  const n=Number(args.n||200),threat=Number(args.threat||1),firstSeed=Number(args.seed||1);
  if(!Number.isSafeInteger(n)||n<1||!Number.isInteger(threat)||threat<1||threat>3) throw new Error('Invalid n/threat');
  const config={rarity:args.rarity||'fine',enhance:Number(args.enhance||0),weapon:args.weapon||'blade',stats:args.stats||'balanced',...(args.level?{level:Number(args.level)}:{})};
  console.error('stage threat clear% death% mean/median(min) potions kills gold gear(C/F/R/E) stones(L/M/H) netValue');
  const rows=(args.stage?[args.stage]:['S1','S2','S3','S4','S5','S6','S7']).map(stage=>{
    const runs=Array.from({length:n},(_,i)=>simulate({stage,threat,seed:firstSeed+i,...config}));
    const row={stage,threat,preset:config,...summarize(runs),runs};
    console.error(`${stage} T${threat} ${(row.clearRate*100).toFixed(1)} ${(row.deathRate*100).toFixed(1)} ${row.meanClearMinutes?.toFixed(2)??'—'}/${row.medianClearMinutes?.toFixed(2)??'—'} ${row.potions.toFixed(2)} ${row.kills.toFixed(2)} ${row.gold.toFixed(1)} ${Object.values(row.gear).map(v=>v.toFixed(2)).join('/')} ${row.stones.map(v=>v.toFixed(2)).join('/')} ${row.expectedValue.toFixed(1)}`);return row;
  });
  const sourceHashes=Object.fromEntries(['js/sim/core.js','js/sim/world.js','js/content/combat.js','js/content/balance.js','js/meta/economy.js','js/meta/items.js','js/meta/run.js','js/meta/stats.js','js/meta/save.js','tools/balance/bot.js','tools/balance/botsim.mjs'].map(file=>[file,createHash('sha256').update(readFileSync(new URL('../../'+file,import.meta.url))).digest('hex')]));
  const result={schema:1,sourceHashes,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),seeds:{first:firstSeed,n},limitation:LIMITATION,valueDefinition:'retained kill-drop gold + vendor gear value - HP potion cost; stones/materials reported separately; one-time first-chief pity and XP excluded',rows};
  const json=JSON.stringify(result,null,2)+'\n';if(args.out)writeFileSync(args.out,json);else console.log(json);
}

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createWorld, addPlayer, startStage, step, setLoad, emptyInput } from '../../js/sim/world.js';
import { createSave, validateSave } from '../../js/meta/save.js';
import { allocateStats } from '../../js/meta/stats.js';
import { buildRoundMods, createTracker, trackRound, usedConsumables, currentLoad } from '../../js/meta/run.js';
import { applyAutoUse, autoUseSettings } from '../../js/meta/auto-use.js';

// Fresh human starter equipment; Lv2 spends its eight points evenly, with no gear upgrades.
export function fixture(level, weapon) {
  let save = createSave({name:'장벽측정', answers:[0,0,0,0,0], weapon, createdAt:1});
  if (level === 2) {
    save.level = 2; save.statPoints = 8;
    save = allocateStats(save, {str:2, agi:2, wis:2, int:1, cha:1});
  }
  if (!validateSave(save)) throw new Error('Invalid starter fixture');
  return save;
}
export function measure(stage, weapon, level, seed) {
  const save = fixture(level, weapon), world = createWorld({seed, threat:1});
  const player = addPlayer(world, {pid:'bot', weapon, mods:buildRoundMods(save)});
  startStage(world, stage);
  let tracker = createTracker(seed), input = emptyInput(), potions = 0;
  const hash = createHash('sha256');
  setLoad(world, 'bot', currentLoad(save, tracker).ratio);
  while (world.round.state === 'running' && world.tick < 18000) {
    if (world.tick % 6 === 0) {
      // Existing bot.js spacing thresholds/cadence; omit its telegraph-aware dodge and skills.
      // Auto attack and the real default auto-use policy supply ordinary input edges.
      const target = world.entities.filter(e=>e.kind==='monster'&&!e.dead&&!e.spawnLeft)
        .sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0];
      input = {...emptyInput(), autoAttack:true};
      if (target) {
        const dx=target.x-player.x, dy=target.y-player.y, d=Math.hypot(dx,dy)||1;
        const lo=weapon==='blade'?0:220, hi=weapon==='blade'?65:310;
        const direction=d<lo?-1:d>hi?1:0;
        input.mx=dx/d*direction; input.my=dy/d*direction;
        input.aimX=dx; input.aimY=dy;
      }
    }
    applyAutoUse(input, player, autoUseSettings(save));
    const events = step(world, {bot:input});
    hash.update(JSON.stringify(events));
    input = {...input, potionEdge:false, manaEdge:false, scrollEdge:false};
    potions += events.filter(e=>e.type==='potion').length;
    if(events.some(e=>e.type==='kill'||e.type==='potion'||e.type==='manaPotion')) {
      const result=trackRound(save,tracker,events,usedConsumables(save,player));
      tracker=result.tracker; setLoad(world,'bot',result.load.ratio);
    }
  }
  return {stage,weapon,level,seed,clear:world.round.state==='clear',death:player.terminal==='death',
    recall:player.terminal==='return_scroll',state:world.round.state,terminal:player.terminal,
    seconds:world.tick/30,potions,kills:tracker.killIndex,gold:tracker.tempLoot.gold,
    trace:hash.digest('hex')};
}
export function aggregate(runs) {
  const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
  const clears=runs.filter(r=>r.clear);
  return {n:runs.length,clearRate:mean(runs.map(r=>+r.clear)),clearSeconds:mean(clears.map(r=>r.seconds)),
    deathRate:mean(runs.map(r=>+r.death)),recallRate:mean(runs.map(r=>+r.recall)),
    timeoutRate:mean(runs.map(r=>+(!r.clear&&!r.death&&!r.recall))),
    meanSeconds:mean(runs.map(r=>r.seconds)),potions:mean(runs.map(r=>r.potions)),
    gold:mean(runs.map(r=>r.gold)),kills:mean(runs.map(r=>r.kills))};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const rows=[];
  for(const stage of ['S1','S2','S3','S4']) for(const weapon of ['blade','bow','focus']) for(const level of [1,2]) {
    const runs=Array.from({length:10},(_,i)=>measure(stage,weapon,level,i+1));
    rows.push({stage,weapon,level,...aggregate(runs),runs});
  }
  writeFileSync(process.argv[2],JSON.stringify({seeds:[1,10],maxSeconds:600,rows},null,2)+'\n');
  console.log(JSON.stringify(rows.map(({runs,...row})=>row)));
}

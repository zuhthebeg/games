// Bounded 20-seed actual simulation: fixed stationary builds, not human balance acceptance.
const S=require('../js/sim.js'),D=require('../js/data.js');
const rng=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
const rows=[];
for(const wave of [1,21])for(const tier of [1,6])for(const slots of [1,6]){
 const samples=[];
 for(let seed=1;seed<=20;seed++){
  const w=S.createWorld({wave,endless:true,rng:rng(seed)}),p=w.players.solo;p.weapons=Array.from({length:slots},()=>['shield',tier]);p.stats.maxHp=p.maxHp=p.hp=wave===1?12:120;p.stats.regen=0;p.stats.armor=0;
  w.spawnClock=-1e9;w.looterRolled=true;w.bossSpawned=true;w.tm=90;
  const e=S.spawn(w,wave===1?'tank':'boss_1',p.x+70,p.y);e.summon=-1e9;e.hp=e.maxHp=1e6;
  const initial=p.hp,armor=S.effectiveStats(p).armor;let firstDamage=null;
  for(let tick=0;tick<2700&&p.alive;tick++){S.step(w);w.fx.length=0;if(firstDamage===null&&p.hp<initial)firstDamage=initial-p.hp;}
  samples.push({seed,armor,firstDamage,alive:p.alive,hp:p.hp,ticks:w.tick,statsArmor:p.stats.armor,regen:p.stats.regen});
 }
 rows.push({wave,tier,slots,dead:samples.filter(s=>!s.alive).length,censored:samples.filter(s=>s.alive).length,maxTicks:Math.max(...samples.map(s=>s.ticks)),samples});
}
if(rows.some(r=>r.samples.some(s=>!(s.firstDamage>0)||s.statsArmor!==0||s.regen!==0)))throw Error('damage/derived armor regression');
console.log(JSON.stringify({seeds:20,capSeconds:90,stationary:true,regen:0,noImmortalityClaim:true,rows},null,2));

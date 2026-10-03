const {test}=require('node:test'),a=require('node:assert/strict');
const D=require('../js/data.js'),S=require('../js/sim.js');
test('early W2 preserves starter pistol one-shot blob rather than halving kill income',()=>{
 const w=S.createWorld({wave:2,rng:()=>.99}),p=w.players.solo;
 const e=S.spawn(w,'blob',p.x+100,p.y),before=e.hp;S.weaponHit(w,p,'pistol',1,e,0);
 // Pistol projectiles resolve through the actual simulation, not a fake damage formula.
 w.spawnClock=-1e9;p.cool=[1e9];for(let i=0;i<30&&e.hp===before;i++)S.step(w);
 a.ok(e.hp<=0,'starter shot must still kill W2 blob');
});
test('early enemy-strength ramp starts at baseline, reaches requested +15/+10 at W20, never changes speed/count',()=>{
 for(const wave of [1,2,5,10,19,20,21,30,100])for(const n of [1,4])for(const type of Object.keys(D.enemies)){
  const st=S.enemyStats(type,wave,n),e=D.enemies[type],k=D.curve,t=Math.min(1,Math.max(0,(wave-1)/19)),late=S.lateScale(wave);
  a.ok(Math.abs(st.hp/(e.hp*(1+k.hpPerWave*(wave-1))*(1+k.mpHp*(n-1))*late.hp*(1+.15*t))-1)<1e-12);
  a.ok(Math.abs(st.dmg-e.dmg*(1+k.dmgPerWave*(wave-1))*(1+k.mpDmg*(n-1))*late.dmg*(1+.1*t))<1e-6);
  a.equal(st.speed,e.speed);
 }
});

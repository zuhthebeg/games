const {test}=require('node:test'),a=require('node:assert/strict');const D=require('../js/data.js'),S=require('../js/sim.js');
const make=wave=>{const w=S.createWorld({wave,endless:true,rng:()=>.99});w.spawnClock=-1e9;w.looterRolled=true;w.players.solo.immune=1e9;w.players.solo.cool=[1e9];return w;};
for(const wave of [20,21,22,25,30,60,100])test('endless required exactly one boss, timer cannot skip, boss kill advances '+wave,()=>{
 const w=make(wave);S.step(w);a.equal(w.enemies.filter(e=>e.type.startsWith('boss_')).length,1);const b=w.enemies.find(e=>e.type.startsWith('boss_'));a.ok(Number.isFinite(b.hp)&&Number.isFinite(b.dmg));w.tm=0;for(let i=0;i<10;i++)S.step(w);a.equal(w.ended,false);a.equal(w.enemies.filter(e=>e.type.startsWith('boss_')).length,1);b.hp=0;S.kill(w,b,'solo');S.kill(w,b,'solo');a.equal(w.bossKills,1);S.step(w);a.equal(w.ended,true);a.equal(w.win,false);a.equal(w.players.solo.pendingCrates.filter(v=>v.bossReward).length,1);
});
test('late HP2/damage1.5 then 1.18/1.12 replaces old compounding, finite throughwave100',()=>{
 for(const wave of [18,20,21,25,30,60,100])for(const n of [1,4]){const st=S.enemyStats('boss_2',wave,n),e=D.enemies.boss_2,k=D.curve;const exp=Math.min(80,Math.max(0,wave-20));
 const hp=e.hp*(1+k.hpPerWave*(wave-1))*(1+k.mpHp*(n-1))*(1+.15*Math.min(1,(wave-1)/19))*(wave>=20?2*1.18**exp:1);
 const dmg=e.dmg*(1+k.dmgPerWave*(wave-1))*(1+k.mpDmg*(n-1))*(1+.1*Math.min(1,(wave-1)/19))*(wave>=20?1.5*1.12**exp:1);
 a.ok(Math.abs(st.hp/hp-1)<1e-12);a.ok(Math.abs(st.dmg/dmg-1)<1e-12);a.equal(st.speed,e.speed);a.ok(Number.isFinite(st.hp));}
});
test('full legacy cap cannot falsely mark boss spawned; retry once slot free, no duplicate',()=>{
 const w=make(21);w.bossSpawned=true;for(let i=0;i<220;i++)S.spawn(w,'tank',0,0);w.bossSpawned=false;S.step(w);a.equal(w.bossSpawned,false);a.equal(w.ended,false);w.enemies.pop();S.step(w);a.equal(w.bossSpawned,true);a.equal(w.enemies.filter(e=>e.type.startsWith('boss_')).length,1);S.step(w);a.equal(w.enemies.filter(e=>e.type.startsWith('boss_')).length,1);
});
test('endless boss wait dies/loses immediately, normal20 keeps win and defeat exit',()=>{
 const w=make(25);S.step(w);w.players.solo.alive=false;S.step(w);a.equal(w.ended,true);a.equal(w.win,false);
 const n=make(20);n.endless=false;S.step(n);const b=n.enemies.find(e=>e.type==='boss_2');b.hp=0;S.kill(n,b,'solo');S.step(n);a.equal(n.win,true);
});
test('required boss state round-trips solo checkpoint; killed boss never respawns',()=>{
 const w=make(22),m=new Map(),st={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};S.step(w);const b=w.enemies.find(e=>e.type.startsWith('boss_'));b.hp=0;S.kill(w,b,'solo');a.equal(S.soloSave.save(st,{mode:'wave',world:w,offers:[]},1000),true);const r=S.soloSave.load(st,1001).world;S.step(r);a.equal(r.ended,true);a.equal(r.enemies.length,0);a.equal(r.bossKills,1);
});

test('legacy falsely-spawned boss checkpoint repairs only missing boss, retains other state',()=>{
 const w=make(25);w.bossSpawned=true;w.players.solo.lvl=12;w.players.solo.xp=91;
 const m=new Map(),st={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};
 S.soloSave.save(st,{mode:'wave',world:w,offers:[]},1000);const r=S.soloSave.load(st,1001).world;
 a.equal(r.bossSpawned,false);a.equal(r.players.solo.lvl,12);a.equal(r.players.solo.xp,91);S.step(r);a.equal(r.enemies.filter(e=>e.type.startsWith('boss_')).length,1);
});

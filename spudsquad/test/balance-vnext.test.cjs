const {test}=require('node:test');
const a=require('node:assert/strict');
const D=require('../js/data.js'), S=require('../js/sim.js');
const rng=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
test('vnext explicit separate caps, XP and enemy ramp multipliers',()=>{
 a.equal(D.MAX_WEAPON_TIER,6);a.equal(D.MAX_ITEM_TIER,4);
 for(let l=1;l<=100;l++)for(const char of Object.keys(D.chars))a.equal(S.needXp(l,char),Math.ceil(Math.ceil((l+3)**2*(D.chars[char].xpNeed||1))*1.25));
 for(const type of Object.keys(D.enemies))for(const w of [1,10,20,30])for(const n of [1,4]){
 const s=S.enemyStats(type,w,n),e=D.enemies[type],k=D.curve;
 a.ok(Math.abs(s.hp-e.hp*(1+k.hpPerWave*(w-1))*(1+k.mpHp*(n-1))*(w>=20?2*1.18**Math.min(80,w-20):1)*(1+.15*Math.min(1,(w-1)/19)))<1e-6);
 a.ok(Math.abs(s.dmg-e.dmg*(1+k.dmgPerWave*(w-1))*(1+k.mpDmg*(n-1))*(w>=20?1.5*1.12**Math.min(80,w-20):1)*(1+.1*Math.min(1,(w-1)/19)))<1e-6);
 }
});
test('T4/T5 merge, T6 ceiling, invalid offer7 rejected, items stay T4',()=>{
 const p=S.createPlayer('x');p.mats=1e9;
 for(const t of [4,5]){p.weapons=[['pistol',t],['pistol',t]];a.equal(S.merge(p,0),true);a.deepEqual(p.weapons,[['pistol',t+1]]);}
 p.weapons=[['pistol',6],['pistol',6]];a.equal(S.merge(p,0),false);
 a.equal(S.buy(p,{weapon:true,id:'pistol',tier:7,price:1}),false);
 a.equal(S.buy(p,{weapon:false,id:'clover',tier:5,price:1}),false);
 p.items=['anvil'];p.weapons=[['pistol',5]];S.enterShop(p,()=>0);a.equal(p.weapons[0][1],6);a.equal(S.enterShop(p,()=>0),null);
});
test('100k owner-mean weapon rolls each, strict greater and monotone rarity',()=>{
 for(const [mean,tiers] of [[1,[1]],[1.5,[1,2]],[2,[2]],[3.9,[3,4,4,4,4,4,4,4,4,4]],[5,[5]],[6,[6]]]){
 const p=S.createPlayer('x');p.weapons=tiers.map(t=>['pistol',t]);const w={rng:rng(222),wave:1};const counts=Array(7).fill(0);
 for(let i=0;i<100000;i++){const t=S.rollWeaponTier(w,p);a.ok(t>mean||mean===6&&t===6);a.ok(t<=6);counts[t]++;}
 const min=Math.min(6,Math.floor(mean)+1);for(let t=min+1;t<=6;t++)a.ok(counts[t-1]>counts[t]);
 }
});
test('100k item rarity per wave/luck, normalized gates, caps and boss floor',()=>{
 for(const wave of [1,4,8,10])for(const luck of [0,100,10000,-100]){
 const p=S.createPlayer('x');p.stats.luck=luck;const w={wave,rng:rng(55)};const counts=Array(5).fill(0),cap=wave>=10?4:wave>=8?3:wave>=4?2:1;
 for(let i=0;i<100000;i++){const t=S.rollItemTier(w,p);a.ok(t<=cap);counts[t]++;}
 for(let t=2;t<=cap;t++)a.ok(counts[t-1]>counts[t]);
 if(wave===10&&luck===0)[75,20,4.5,.5].forEach((pct,i)=>a.ok(Math.abs(counts[i+1]/1000-pct)<.6));
 for(let i=0;i<100;i++)a.ok((D.items[S.rollCrateItem(w,p,2)].tier||1)>=2);
 }
});

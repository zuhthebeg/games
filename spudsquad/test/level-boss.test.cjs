const {test}=require('node:test'),a=require('node:assert/strict');
const S=require('../js/sim.js'),D=require('../js/data.js'),N=require('../js/net.js');
const world=(wave=10,players={solo:{char:'basic'}})=>{const w=S.createWorld({wave,players,rng:()=>.99,endless:wave>20});w.spawnClock=-1e6;w.bossSpawned=true;for(const p of Object.values(w.players)){p.cool=[1e6];p.immune=1e6;}return w;};
const slay=(w,type='boss_1',owner=Object.keys(w.players)[0])=>{const e=S.spawn(w,type,100,100);e.hp=0;S.kill(w,e,owner);return e;};
const adapter=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('owner level adds linear 5% to items only; wave ceil then discounts and final ceil',()=>{
 for(const char of ['basic','mutant'])for(const lvl of [1,2,3,20,100])for(const wave of [1,4,10,21]){
  const w=world(wave,{solo:{char,lvl,items:['potato_crown','potato_crown']}}),p=w.players.solo;
  const offers=S.shop(w,p);a.ok(offers.every(o=>!o.weapon));
  for(const o of offers)a.equal(o.price,Math.ceil(S.price(D.items[o.id].price,wave)*(1+.05*(lvl-1))*(D.chars[char].priceMult||1)*(D.items.potato_crown.priceMult**2)));
  w.rng=()=>0;const weapons=S.shop(w,p);a.ok(weapons.every(o=>o.weapon));
  for(const o of weapons)a.equal(o.price,Math.ceil(S.price(D.weapons[o.id].price,wave)*o.tier*(D.chars[char].priceMult||1)*(D.items.potato_crown.priceMult**2)));
  a.equal(S.rerollCost(wave,2),Math.ceil((1+wave+2)*1.2));
 }
});
test('quoted and legacy locked prices stay frozen on level/discount change and save restore; buy deducts quote',()=>{
 const w=world(4,{solo:{char:'basic',lvl:2,mats:10000}}),p=w.players.solo,offers=S.shop(w,p);offers[0].locked=true;
 const quoted=offers[0].price;a.equal(quoted,Math.ceil(S.price(D.items[offers[0].id].price,4)*1.05));p.lvl=5;S.grantItem(p,'potato_crown');
 const st=adapter();w.ended=w.reported=true;a.equal(S.soloSave.save(st,{mode:'shop',world:w,offers,cratesRemaining:0,shopRolls:2},1000),true);
 const r=S.soloSave.load(st,1001);a.equal(r.offers[0].price,quoted);a.equal(r.offers[0].locked,true);const before=r.world.players.solo.mats;
 a.equal(S.buy(r.world.players.solo,r.offers[0]),true);a.equal(before-r.world.players.solo.mats,quoted);
 r.offers[1].price=7;a.equal(S.buy(r.world.players.solo,r.offers[1]),true); // legacy quote has no new metadata
});
test('boss reward bypasses occupied normal cap and duplicate kill cannot create twice; ordinary cap unchanged',()=>{
 for(const [wave,type]of [[10,'boss_1'],[20,'boss_2'],[30,'boss_1'],[30,'boss_2']]){
  const w=world(wave);S.createCrate(w,20,20);S.createCrate(w,30,30);const e=slay(w,type);S.kill(w,e,'solo');
  a.equal(w.crateCount,2);a.equal(w.crates.length,3);a.equal(S.createCrate(w,40,40),null);
  const c=w.crates.find(c=>c.bossReward);a.ok(c);a.equal(c.minTier,2);a.equal(c.owner,'solo');
  a.equal(N.encode(w).cr.find(r=>r[0]===c.id)[3],1);
  for(let i=0;i<20;i++){w.rng=()=>.5;const id=S.rollCrateItem(w,w.players.solo,2);a.ok(D.items[id].tier>=2);}
 }
});
test('normal crate probability and normal T1 floor remain unchanged',()=>{
 const w=world(1);slay(w,'blob');a.equal(w.crates.length,0);w.rng=()=>0;slay(w,'blob');a.equal(w.crates.length,1);a.equal(w.crates[0].bossReward,undefined);
 a.equal(D.items[S.rollCrateItem(w,w.players.solo)].tier||1,1);
 w.rng=()=>.5;a.ok(S.shop(w,w.players.solo).some(o=>!o.weapon&&o.tier===1));
});
test('missed boss gem settles once to eligible survivors; normal unpicked crates unchanged',()=>{
 const w=world(10,{host:{char:'basic'},guest:{char:'basic'}});w.players.host.alive=false;slay(w,'boss_1','host');S.createCrate(w,1,1,'host');w.tm=-1;S.step(w);
 a.equal(w.ended,true);a.equal(w.players.guest.pendingCrates.length,1);a.equal(w.players.guest.pendingCrates[0].minTier,2);a.equal(w.players.guest.pendingCrates[0].bossReward,true);a.equal(w.crates.length,1);
 S.step(w);a.equal(w.players.guest.pendingCrates.length,1);
});
test('boss pickup metadata survives solo save, replay queue and host WAVE_END payload',()=>{
 const w=world();slay(w);const c=w.crates[0];w.players.solo.x=c.x;w.players.solo.y=c.y;S.step(w);a.equal(w.players.solo.pendingCrates[0].minTier,2);
 const st=adapter();a.equal(S.soloSave.save(st,{mode:'wave',world:w,offers:[],cratesRemaining:0,shopRolls:0},1000),true);
 a.equal(S.soloSave.load(st,1001).world.players.solo.pendingCrates[0].bossReward,true);
 let action;const host=new N.Session({uid:'solo',host:'solo',onAction:x=>action=x});host.world=w;host.wave=10;host.phase='wave';w.tm=-1;host.update(1/30);
 a.equal(action.type,'WAVE_END');a.equal(action.payload.players.solo.crateRewards[0].minTier,2);
});
test('all-dead loss grants no boss item; final win auto grants T2+ instead of losing reward without a shop',()=>{
 const lost=world();slay(lost);lost.players.solo.alive=false;S.step(lost);a.equal(lost.players.solo.items.length,0);
 const win=world(20);slay(win,'boss_2');win.tm=-1;S.step(win);a.equal(win.win,true);a.equal(win.players.solo.items.length,1);a.ok(D.items[win.players.solo.items[0]].tier>=2);
});
test('exhausted selected unique tier falls back only within eligible T2+ pools',()=>{
 const w=world(),p=w.players.solo;for(const [id,d]of Object.entries(D.items))if(d.unique||d.max)for(let i=0;i<(d.max||1);i++)S.grantItem(p,id);
 w.rng=()=>0;const id=S.rollCrateItem(w,p,2);a.ok(D.items[id]?.tier>=2);a.equal(S.grantItem(p,id),true);
});
test('boss snapshot carries reward owner and floor while legacy ordinary snapshot row remains unchanged',()=>{
 const w=world();const normal=S.createCrate(w,1,2);slay(w);const c=w.crates.find(c=>c.bossReward),packet=N.encode(w);
 a.deepEqual(packet.cr.find(r=>r[0]===normal.id),[normal.id,1,2]);a.deepEqual(packet.cr.find(r=>r[0]===c.id),[c.id,100,100,1,'solo',2]);
});
test('save rejects corrupted boss metadata and level but accepts legacy absent reward/lvl fields',()=>{
 const w=world();slay(w);const st=adapter();S.soloSave.save(st,{mode:'wave',world:w,offers:[],cratesRemaining:0,shopRolls:0},1000);const raw=JSON.parse(st.getItem(S.soloSave.key));
 for(const mutate of [s=>s.world.crates[0].minTier=1,s=>s.world.crates[0].bossReward='yes',s=>s.world.players.solo.lvl=-5,s=>s.world.players.solo.pendingCrates=[{id:1,bossReward:true,minTier:2,itemId:'bandana'}]]){
  const copy=structuredClone(raw);mutate(copy);st.setItem(S.soloSave.key,JSON.stringify(copy));a.equal(S.soloSave.load(st,1001),null);
 }
 const old=structuredClone(raw);old.world.crates=[{id:1,x:3,y:4,owner:null}];delete old.world.players.solo.lvl;st.setItem(S.soloSave.key,JSON.stringify(old));const r=S.soloSave.load(st,1001);a.equal(r.world.players.solo.lvl,1);a.equal(r.world.crates[0].bossReward,undefined);
});
test('selected tier exhaustion falls back to eligible floor without returning undefined',()=>{
 const w=world(),p=w.players.solo,changed=[];
 try{for(const [id,d]of Object.entries(D.items))if(d.tier===4){changed.push([d,d.unique]);d.unique=true;p.items.push(id);}w.rng=()=>0;a.ok(D.items[S.rollCrateItem(w,p,2)]?.tier>=2);}finally{for(const[d,unique]of changed){if(unique===undefined)delete d.unique;else d.unique=unique;}}
});
test('multiple unowned missed boss rewards distribute fairly; owner pickup queue consumes exactly once',()=>{
 const w=world(30,{a:{char:'basic'},b:{char:'basic'}});slay(w,'boss_1','missing');slay(w,'boss_2','missing');w.tm=0;S.step(w);
 a.equal(w.players.a.pendingCrates.length,1);a.equal(w.players.b.pendingCrates.length,1);a.notEqual(w.players.a.pendingCrates[0].id,w.players.b.pendingCrates[0].id);
 const pick=world();slay(pick);const c=pick.crates[0];pick.players.solo.x=c.x;pick.players.solo.y=c.y;S.step(pick);pick.tm=0;S.step(pick);a.equal(pick.players.solo.pendingCrates.length,1);
});
test('JSON host/guest transport retains owner XP level and boss queue; guest READY keeps host progression',()=>{
 let host,guest,end;const roster={players:[{user:'host'},{user:'guest'}],hostUser:'host'};
 host=new N.Session({uid:'host',host:'host',rng:()=>.99,sendAction:a=>guest.receive(JSON.parse(JSON.stringify(a)))});
 guest=new N.Session({uid:'guest',host:'host',onAction:a=>{if(a.type==='WAVE_END')end=a;},sendAction:a=>host.receive(JSON.parse(JSON.stringify(a)))});
 host.roster(roster);guest.roster(roster);host.start(10);const w=host.world;w.spawnClock=-1e9;w.bossSpawned=true;w.players.guest.lvl=7;w.players.guest.xp=12;
 for(const p of Object.values(w.players))p.immune=1e9;slay(w,'boss_1','guest');w.tm=0;host.update(1/30);
 a.equal(guest.phase,'shop');const payload=end.payload.players.guest;a.equal(payload.lvl,w.players.guest.lvl);a.equal(payload.xp,w.players.guest.xp);a.equal(payload.crateRewards[0].minTier,2);
 const gp=S.createPlayer('guest','basic',{lvl:payload.lvl,xp:payload.xp,mats:10000});
 const id=S.rollCrateItem({wave:10,rng:()=>.99},gp,payload.crateRewards[0].minTier);a.ok(D.items[id].tier>=2);a.equal(S.grantItem(gp,id),true);
 guest.local({type:'READY',payload:{uid:'guest',loadout:{items:gp.items,stats:gp.stats,mats:gp.mats}}});a.deepEqual(w.players.guest.items,gp.items);a.equal(w.players.guest.lvl,payload.lvl);
 const offers=S.shop({wave:10,rng:()=>.99},gp);for(const o of offers)a.equal(o.price,Math.ceil(S.price(D.items[o.id].price,10)*(1+.05*(gp.lvl-1))));
});
test('changed feature scripts use a new cache key, unchanged shared scripts stay untouched',()=>{
 const html=require('node:fs').readFileSync(require.resolve('../index.html'),'utf8');for(const name of ['sim','net','render','ui','main'])a.ok(html.includes(`js/${name}.js?v=20261003levelboss1`),name);
 a.ok(html.includes('/lib/shared-wallet.js?v=20260809pf2'));a.ok(html.includes('js/fx.js?v=20261001ult1'));
});

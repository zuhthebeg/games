const { test } = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const D = require('../js/data.js'), S = require('../js/sim.js'), N = require('../js/net.js'), C = require('../js/collection.js');
const weapons = ['boomerang', 'hoe', 'potato_cannon', 'frost_wand'];
const items = ['salt_shaker', 'raincoat', 'birdseed', 'ice_pack', 'seed_potato', 'smoke_bomb', 'boomerang_strap', 'frost_crown', 'shrapnel', 'harvest_sickle', 'potato_crown', 'phoenix_feather'];
function world(opts = {}) {
  const w = S.createWorld({ rng: () => .99, ...opts });
  w.spawnClock = -10000; w.bossSpawned = true;
  for (const p of Object.values(w.players)) { p.cool = [999,999,999,999,999,999]; p.stats.regen = 0; }
  return w;
}
const give = (p, id) => a.ok(S.grantItem(p, id), id);
function dummy(w, type = 'tank', x = 1000, y = 600) {
  const e = S.spawn(w, type, x, y); e.hp = e.maxHp = 10000; e.speed = 0; e.dmg = 0; return e;
}
const ticks = (w, n) => { for (let i = 0; i < n; i++) S.step(w, 1/30); };

test('v4 schema: 4 tier-ready weapons and 12 tradeoff items', () => {
  a.equal(Object.keys(D.weapons).length, 18); a.equal(Object.keys(D.items).length, 75);
  for (const id of weapons) {
    const v = D.weapons[id]; a.ok(v, id); a.equal(v.muzzle.length, 2); a.ok(Number.isFinite(v.artAngle));
    a.ok(['melee','ranged'].includes(v.kind)); a.ok(v.classes.length); a.ok(v.price > 0);
    for (let t=1;t<=4;t++) a.ok(S.weaponSummary(S.createPlayer('solo'), id, t).damage > 0);
  }
  const tiers = [1,1,1,2,2,2,2,3,3,3,4,4];
  items.forEach((id,i) => { const d=D.items[id]; a.ok(d,id); a.equal(d.tier||1, tiers[i]);
    a.ok(d.price>0); a.ok((Object.values(d.stats).some(v=>v<0) || d.priceMult>1),id);
    for (const [k,v] of Object.entries(d.stats)) { a.ok(k in D.stats,k); a.ok(Number.isFinite(v)); }
  });
});

test('boomerang returns at maximum range, hits same enemy exactly twice and strap buffs only return', () => {
  for (const strap of [false,true]) {
    const w=world(),p=w.players.solo; p.weapons=[['boomerang',1]];
    if(strap) give(p,'boomerang_strap');
    const e=dummy(w); S.weaponHit(w,p,'boomerang',1,e,0); ticks(w,40);
    a.ok(Math.abs((10000-e.hp)-D.weapons.boomerang.damage*(strap?2.3:2))<1e-7, String(10000-e.hp));
    a.equal(w.projectiles.length,0);
  }
});

test('potato cannon splits into three 35% projectiles, fragments cannot explode or split again', () => {
  const w=world(),p=w.players.solo; p.weapons=[['potato_cannon',1]];
  const e=dummy(w); S.weaponHit(w,p,'potato_cannon',1,e,0); ticks(w,8);
  const children=w.projectiles.filter(b=>b.fragment); a.equal(children.length,3);
  for(const b of children) a.ok(Math.abs(b.power-D.weapons.potato_cannon.damage*.35)<1e-9);
  a.equal(w.fx.filter(f=>f[0]==='ex').length,1);
  for(const b of children) dummy(w,'tank',b.x+b.vx/700*12,b.y+b.vy/700*12);
  ticks(w,20); a.equal(w.projectiles.length,0); a.equal(w.fx.filter(f=>f[0]==='ex').length,1);
});

test('chill slows normal movement 35%, bosses half, expires without DOT and does not stack', () => {
  for(const type of ['blob','charger','boss_1','boss_2']) {
    const w=world(), e=dummy(w,type,1100,600); e.speed=100;
    if(type==='boss_2') e.charge=1;
    S.applyStatus(w,e,'chill','solo'); S.applyStatus(w,e,'chill','solo');
    const x=e.x; S.step(w,.1);
    a.ok(Math.abs(x-e.x-(type.startsWith('boss')?8.25:6.5))<1e-9,type);
    ticks(w,60); a.equal(e.status.chill,undefined); a.equal(e.hp,10000);
  }
});

test('frost wand applies chill and scales with elemental, not ranged', () => {
  const w=world(), p=w.players.solo, e=dummy(w); p.weapons=[['frost_wand',1]]; p.stats.elemental=5; p.stats.ranged=100;
  a.equal(S.weaponSummary(p,'frost_wand').damage,14);
  S.weaponHit(w,p,'frost_wand',1,e,0); ticks(w,8); a.ok(e.status?.chill); a.equal(10000-e.hp,14);
});

test('ice pack exact 10% hit chance, including explosion hits; DOT does not refresh itself', () => {
  const w=world(),p=w.players.solo,e=dummy(w); give(p,'ice_pack');
  for(const [r,yes] of [[.099,true],[.10,false],[.99,false]]) {
    e.status={}; w.rng=()=>r; S.hurtEnemy(w,e,1,'solo'); a.equal(!!e.status.chill,yes);
  }
  w.rng=()=>.05; S.explode(w,e.x,e.y,40,1,'solo'); a.ok(e.status.chill);
  e.status={}; S.applyStatus(w,e,'burn','solo',1); ticks(w,70); a.equal(e.status.chill,undefined);
});

test('frost crown multiplies damage only for currently chilled targets', () => {
  const w=world(),p=w.players.solo,e=dummy(w); give(p,'frost_crown');
  S.hurtEnemy(w,e,10,'solo'); a.equal(10000-e.hp,10);
  S.applyStatus(w,e,'chill','solo'); S.hurtEnemy(w,e,10,'solo'); a.equal(10000-e.hp,22);
  e.status.chill.left=0; S.hurtEnemy(w,e,10,'solo'); a.equal(10000-e.hp,32);
  a.equal(S.grantItem(p,'frost_crown'),false);
});

test('shrapnel emits three 20% fragments per explosion with no recursive explosions', () => {
  const w=world(),p=w.players.solo; give(p,'shrapnel');
  S.explode(w,1100,600,50,10,'solo'); a.equal(w.projectiles.length,3);
  for(const b of w.projectiles) { a.equal(b.power,2); a.equal(b.fragment,true); dummy(w,'tank',b.x+b.vx/700*10,b.y+b.vy/700*10); }
  ticks(w,20); a.equal(w.projectiles.length,0); a.equal(w.fx.filter(f=>f[0]==='ex').length,1);
});

test('hoe and harvest sickle add one currency drop on qualifying kills, not on nonlethal hits', () => {
  for(const id of ['hoe','harvest_sickle']) {
    const w=world(),p=w.players.solo,e=dummy(w,'blob',900,600); w.rng=()=>.1;
    if(id==='hoe') { p.weapons=[['hoe',1]]; S.weaponHit(w,p,'hoe',1,e,0); a.equal(w.drops.length,0); }
    else give(p,id);
    w.rng=()=>.01; e.hp=1;
    if(id==='hoe') S.weaponHit(w,p,'hoe',1,e,0); else S.hurtEnemy(w,e,2,'solo');
    a.equal(w.drops.filter(d=>d.gold===1).length,3);
  }
});

test('seed potato grows max HP after waves and respects handcuffs', () => {
  for(const cuff of [false,true]) {
    const w=world(),p=w.players.solo; give(p,'seed_potato'); if(cuff) give(p,'handcuffs');
    const hp=p.stats.maxHp; w.tm=.001; S.step(w); a.equal(p.stats.maxHp,hp+(cuff?0:1));
    const next=S.createWorld({wave:2,players:{solo:p}}); a.equal(next.players.solo.maxHp,hp+(cuff?0:1));
  }
});

test('phoenix revives at 50% HP, immune 0.8s, only once per wave; normal co-op down state after second death', () => {
  const w=world({players:{host:{char:'muscle'},guest:{char:'basic'}}}),p=w.players.host;
  give(p,'phoenix_feather'); const hp=p.maxHp; S.hurtPlayer(w,p,10000,null);
  a.equal(p.alive,true); a.equal(p.hp,hp*.5); a.equal(p.immune,.8);
  S.hurtPlayer(w,p,10000,null); a.equal(p.alive,true);
  p.immune=0; S.hurtPlayer(w,p,10000,null); a.equal(p.alive,false);
  const packet=N.encode(w); a.equal(packet.pl.find(v=>v[0]==='host')[5],false);
  S.step(w); a.equal(w.ended,false); w.tm=.001; S.step(w); a.equal(p.alive,true);
  const next=S.createWorld({wave:2,players:{host:p,guest:w.players.guest},rng:()=>.99});
  S.hurtPlayer(next,next.players.host,10000,null); a.equal(next.players.host.alive,true);
  a.equal(next.players.host.hp,next.players.host.maxHp*.5);
});

test('phoenix max HP penalty is safely clamped even for starter spud', () => {
  const p=S.createPlayer('solo'); give(p,'phoenix_feather'); a.equal(p.maxHp,1); a.equal(p.hp,1);
});

test('potato crown raises item and weapon shop prices 20%, multiplies mutant cost, unique', () => {
  for(const char of ['basic','mutant']) {
    const w=world({players:{solo:{char}}}),p=w.players.solo; w.wave=15;
    const before=S.shop(w,p); give(p,'potato_crown'); const after=S.shop(w,p);
    for(let i=0;i<4;i++) { a.equal(before[i].id,after[i].id); a.equal(after[i].price,Math.ceil(S.price((before[i].weapon?D.weapons:D.items)[before[i].id].price,w.wave)*(before[i].weapon?before[i].tier:1)*(char==='mutant'?1.5:1)*1.2)); }
    a.equal(S.grantItem(p,'potato_crown'),false);
  }
});

test('all v4 catalogue entries roll in shops and have collection records and complete 3-language names/descriptions', () => {
  const window={SPUD:{data:D},navigator:{language:'ko'}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/i18n.js'),'utf8'),{window,navigator:window.navigator,document:{documentElement:{lang:'ko'}}});
  const I=window.SPUD.i18n;
  for(let lang=0;lang<3;lang++) {
    for(const id of weapons) { a.ok(I.name('weapons',id)); a.notEqual(I.name('weapons',id),id); a.notEqual(I.feature(id),id); }
    for(const id of items) { a.ok(I.name('items',id)); a.notEqual(I.name('items',id),id); a.ok(I.itemEffect(id).length>0); }
    I.toggle();
  }
  let seed=142; const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const w=world({wave:20,rng}),p=w.players.solo,seen=new Set();
  for(let i=0;i<5000;i++) for(const o of S.shop(w,p)) seen.add(o.id);
  for(const id of [...weapons,...items]) a.ok(seen.has(id),id);
  const col=C.record(C.empty(),{char:'basic',wave:20,weapons,items});
  a.deepEqual(col.w,weapons); a.deepEqual(col.i,items);
});

test('v4 in-flight return/fragment and phoenix-used state survive solo checkpoint; co-op wire unchanged', () => {
  const w=world(),p=w.players.solo;p.weapons=[['boomerang',1]];p.items=['phoenix_feather'];p.revived=true;
  const e=dummy(w); S.weaponHit(w,p,'boomerang',1,e,0); ticks(w,16);
  const store={v:null,setItem(k,v){this.v=v;},getItem(){return this.v;},removeItem(){this.v=null;}};
  a.ok(S.soloSave.save(store,{world:w,mode:'wave',offers:[],shopRolls:0},100));
  const loaded=S.soloSave.load(store,200); a.ok(loaded); a.equal(loaded.world.players.solo.revived,true);
  a.equal(loaded.world.projectiles[0].returning,true); a.ok(loaded.world.projectiles[0].hit instanceof Set);
  for(let i=0;i<220;i++) S.spawn(w,'blob',i*7,10); w.fx=[];
  const snap=N.encode(w); a.ok(Buffer.byteLength(JSON.stringify(snap))<8192);
  a.deepEqual(Object.keys(snap),['t','k','tm','e','d','cr','pl','fx']);
});

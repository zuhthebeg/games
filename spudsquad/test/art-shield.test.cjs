'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../js/data.js'),S=require('../js/sim.js'),N=require('../js/net.js');
const guns=['pistol','smg','shotgun','rocket','potato_cannon','crossbow','laser','flamethrower'];
test('art calibration covers every firing art tier; source bore maps to aim and upright grip',()=>{
 for(const id of guns)for(let t=1;t<=6;t++){
  const art=D.weapons[id].art[Math.min(4,t)-1];a.ok(art,id);const m=S.weaponGeometry(id,t);a.ok(m.size>0);
  const bore=art.axis+m.rotation;a.ok(Math.abs(Math.sin(bore))<1e-9);a.ok(Math.cos(bore)>.999);
  if(art.flipY)a.equal(m.flipY,true);
 }
});
test('six slots all aim quadrants: actual projectile and FX use transformed raster muzzle',()=>{
 for(const id of guns)for(const tier of [1,2,3,4,5,6])for(let slot=0;slot<6;slot++)for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI, -Math.PI/2,-3*Math.PI/4]){
  const w=S.createWorld({rng:()=>.5}),p=w.players.solo;p.weapons=Array.from({length:6},()=>[id,tier]);
  const pose=S.weaponPose(p,id,slot,angle,tier),g=S.weaponGeometry(id,tier),art=D.weapons[id].art[Math.min(4,tier)-1];
  let x=(art.muzzle[0]-128)/256*g.size,y=(art.muzzle[1]-128)/256*g.size;
  const rx=x*Math.cos(g.rotation)-y*Math.sin(g.rotation);y=x*Math.sin(g.rotation)+y*Math.cos(g.rotation);x=rx;
  if(g.flipY)y=-y;y+=g.anchorY||0;if(Math.cos(angle)<0)y=-y;
  a.ok(Math.abs(pose.muzzleX-(pose.x+x*Math.cos(angle)-y*Math.sin(angle)))<1e-8);
  a.ok(Math.abs(pose.muzzleY-(pose.y+x*Math.sin(angle)+y*Math.cos(angle)))<1e-8);
  const e=S.spawn(w,'tank',pose.muzzleX+Math.cos(angle)*250,pose.muzzleY+Math.sin(angle)*250);e.hp=1e6;
  S.weaponHit(w,p,id,tier,e,angle,slot);const sh=w.fx.find(v=>v[0]==='sh');a.equal(sh[4],pose.muzzleX|0);a.equal(sh[5],pose.muzzleY|0);a.equal(sh[6],angle);
  if(D.weapons[id].behavior==='projectile')for(const b of w.projectiles){a.equal(b.x,pose.muzzleX);a.equal(b.y,pose.muzzleY);}
 }
});
test('shield appended ID: tier defense is derived per slot, never persistent or compounded',()=>{
 a.equal(Object.keys(D.weapons).at(-1),'shield');const p=S.createPlayer('s');const original=structuredClone(p.stats);
 p.weapons=[['shield',1],['shield',6]];for(let i=0;i<200;i++)a.equal(S.effectiveStats(p).armor,11);a.deepEqual(p.stats,original);
 p.weapons=[['shield',6]];a.equal(S.effectiveStats(p).armor,8);p.weapons=[];a.equal(S.effectiveStats(p).armor,0);
 for(let t=1;t<=6;t++){p.weapons=[['shield',t]];a.equal(S.weaponSummary(p,'shield',t).armor,t+2);a.ok(S.damageTaken(100,S.effectiveStats(p).armor)>0);}
});
test('shield bash hits forward narrow line only; no projectiles/invulnerability/reflection',()=>{
 const w=S.createWorld({rng:()=>.99}),p=w.players.solo;p.weapons=[['shield',1]];
 const front=S.spawn(w,'tank',p.x+80,p.y),side=S.spawn(w,'tank',p.x+80,p.y+80);front.hp=side.hp=1e4;
 S.weaponHit(w,p,'shield',1,front,0);a.ok(front.hp<1e4);a.equal(side.hp,1e4);a.equal(w.projectiles.length,0);a.ok(!p.immune);a.equal(D.weapons.shield.damage,5);a.equal(D.weapons.shield.cool,1.8);
});
test('shield legal shop merge anvil save/load host READY and WAVE_START',()=>{
 const w=S.createWorld({rng:()=>.99}),p=w.players.solo;p.mats=10000;p.weapons=[['shield',5],['shield',5]];a.ok(S.merge(p,0));a.deepEqual(p.weapons,[['shield',6]]);
 p.weapons=[['shield',5]];p.items=['anvil'];S.enterShop(p,()=>.5);a.deepEqual(p.weapons,[['shield',6]]);
 a.ok(S.buy(p,{weapon:true,id:'shield',tier:1,price:20}));a.equal(S.effectiveStats(p).armor,11);
 const store=new Map(),st={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 a.ok(S.soloSave.save(st,{mode:'wave',world:w,offers:[]},1000));const r=S.soloSave.load(st,1001);a.deepEqual(r.world.players.solo.weapons,p.weapons);a.equal(S.effectiveStats(r.world.players.solo).armor,11);
 const h=new N.Session({uid:'host',host:'host'});h.players={host:{},guest:{}};h.wave=4;h.world=S.createWorld({wave:4,players:{host:{char:'basic'},guest:{char:'basic'}}});
 h.receive({type:'READY',payload:{uid:'guest',loadout:{weapons:[['shield',6]]}}});a.deepEqual(h.world.players.guest.weapons,[['shield',6]]);h.start(5);a.deepEqual(h.lastPlayers.guest.weapons,[['shield',6]]);
 const guest=new N.Session({uid:'guest',host:'host'});guest.receive(JSON.parse(JSON.stringify({type:'WAVE_START',payload:{w:5,players:h.lastPlayers}})));a.deepEqual(guest.lastPlayers.guest.weapons,[['shield',6]]);
});
test('shield 3-language collection/name/description and four on-disk lossless sprites',()=>{
 for(const lang of ['ko','en','zh-TW']){const window={SPUD:{data:D},navigator:{language:lang}};vm.runInNewContext(fs.readFileSync(require.resolve('../js/i18n.js'),'utf8'),{window,navigator:window.navigator,document:{documentElement:{},getElementById:()=>null}});a.notEqual(window.SPUD.i18n.name('weapons','shield'),'shield');a.notEqual(window.SPUD.i18n.feature('shield'),'shield');}
 for(const id of ['shield','stick'])for(let t=1;t<=4;t++)a.ok(fs.statSync(require.resolve('../assets/weapon_'+id+(t===1?'':'_t'+t)+'.webp')).size>500);
});
test('settings button next sibling of stats in HUD, not absolute field control',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');a.match(html,/id="statsBtn"[^>]*>[^<]*<\/button>\s*<button[^>]*id="settingsBtn"/);a.match(html,/#settingsBtn\s*\{\s*position:\s*static/);
});

test('shield wave-end, collection, natural shop stock and finite damage through six slots',()=>{
 const C=require('../js/collection.js');a.ok(C.record(C.empty(),{char:'basic',wave:1,weapons:[['shield',6]]}).w.includes('shield'));
 const seq=[.1,.1,.999];let i=0;const w=S.createWorld({rng:()=>seq[(i++)%3]}),p=w.players.solo;const offers=S.shop(w,p);a.ok(offers.every(o=>o.weapon&&o.id==='shield'&&o.tier===2));
 p.weapons=[['shield',6]];w.tm=0;w.spawnClock=-1e9;w.enemies=[];S.step(w);a.equal(w.ended,true);a.equal(p.stats.armor,0);a.equal(S.effectiveStats(p).armor,8);
 p.weapons=Array.from({length:6},()=>['shield',6]);a.equal(S.effectiveStats(p).armor,52);a.ok(S.damageTaken(10,52)>2);
 for(const char of Object.keys(D.chars))a.notEqual(D.chars[char].weapon,'shield');
});

test('original gun grip reference points remain below bore for both horizontal aim directions',()=>{
 const grips={pistol:[[112,213],[212,211],[212,211],[212,211]],smg:[[225,195],[224,193],[224,193],[224,193]],shotgun:[[218,174],[230,156],[230,156],[224,193]],potato_cannon:[[185,201],[196,197],[203,188],[204,207]]};
 for(const [id,points]of Object.entries(grips))for(let tier=1;tier<=6;tier++)for(const angle of [0,Math.PI]){
  const g=S.weaponGeometry(id,tier),[gx,gy]=points[Math.min(4,tier)-1];let x=(gx-128)*g.size/256,y=(gy-128)*g.size/256;let yy=x*Math.sin(g.rotation)+y*Math.cos(g.rotation);if(g.flipY)yy=-yy;yy+=g.anchorY||0;if(Math.cos(angle)<0)yy=-yy;yy*=Math.cos(angle);a.ok(yy>0,id+' T'+tier+' upright grip');
  a.equal(S.weaponGeometry(id,tier),g);a.ok(Object.isFrozen(g));
 }
});

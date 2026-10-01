const { test } = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const D = require('../js/data.js'), S = require('../js/sim.js'), N = require('../js/net.js');
function world(id = 'pistol', multi = false) {
  const w = S.createWorld({ wave: 4, rng: () => .5, players: { hero: { char: 'basic', weapons: [[id, 1]] }, ...(multi ? { ally: { char: 'basic' } } : {}) } });
  w.spawnClock = -1e9; w.bossSpawned = true;
  for (const p of Object.values(w.players)) { p.cool = [1e9]; p.immune = 1e9; }
  return w;
}
function dummy(w, type = 'blob', x = 1000, y = 600) {
  const e = S.spawn(w, type, x, y); e.hp = e.maxHp = 1e6; e.speed = e.dmg = 0; return e;
}
for (const multi of [false, true]) for (const [id, v] of Object.entries(D.weapons).filter(([, v]) => !['thrust','sweep','slam'].includes(v.behavior))) {
  test(`${multi ? 'multi' : 'solo'} ${id}: actual hit and displacement follows explicit kb`, () => {
    const w = world(id, multi), p = w.players.hero, e = dummy(w), start = e.x;
    S.weaponHit(w, p, id, 1, e, 0);
    for (let i = 0; i < 8; i++) S.step(w, 1/30);
    a.ok(e.hp < 1e6, 'actual hit');
    if (v.kb > 0) a.ok(e.x > start, `kb${v.kb} must move enemy, got ${e.x-start}`);
    else a.equal(e.x, start, 'explicit zero kb retained');
  });
}
test('zero-kb DoT and fragments cannot erase a weapon impulse before actual movement', () => {
  const w = world(), p = w.players.hero, e = dummy(w);
  S.hurtEnemy(w, e, 1, p.uid, false, '', 80);
  const before = e.kx;
  S.hurtEnemy(w, e, 1, p.uid, false, '', 0);
  a.equal(e.kx, before);
  e.status = { burn: { left: 2, tick: .99, owner: p.uid, power: 2 } };
  S.step(w, 1/30); a.ok(e.x > 1000); a.ok(e.kx > 0);
});
test('boss resistance, shield reduction, player knockback scaling remain exact', () => {
  const w = world(), p = w.players.hero; p.stats.knockback = 50;
  const boss = dummy(w, 'boss_1'), shield = dummy(w, 'shielder', 1080), normal = dummy(w, 'blob', 1000, 710);
  for (const e of [boss, normal]) S.hurtEnemy(w, e, 20, p.uid, false, '', 80);
  a.equal(boss.hp, 1e6 - 10); a.equal(normal.hp, 1e6 - 10);
  a.equal(Math.hypot(boss.kx,boss.ky), 30); a.ok(Math.abs(Math.hypot(normal.kx,normal.ky)-120)<1e-8);
  S.step(w, 1/30); a.ok(boss.x > 1000); a.ok(normal.x > 1000); a.ok(w.enemies.includes(shield));
});
test('swept piercing projectile cannot hit same enemy twice or stack repeated impulse', () => {
  const w = world(), p = w.players.hero; p.items = ['fracture_round', 'piercing_prism'];
  const e = dummy(w), next = dummy(w, 'blob', 1070);
  S.weaponHit(w, p, 'pistol', 1, e, 0);
  for (let i=0;i<14;i++) S.step(w,1/30);
  a.equal(1e6-e.hp, D.weapons.pistol.damage); a.ok(Math.abs(1e6-next.hp-D.weapons.pistol.damage*.9)<1e-8);
});
test('base HP +20% only: character additives, ghost rounding, half starts, clamps and upgrades', () => {
  a.equal(D.stats.maxHp, 12);
  for (const [char,c] of Object.entries(D.chars)) {
    const p = S.createPlayer('x',char), expected = char === 'ghost' ? Math.round((12+(c.stats.maxHp||0))*.5) : 12+(c.stats.maxHp||0);
    a.equal(p.maxHp,Math.max(1,expected),char);
    a.equal(p.hp,char==='vampire'?Math.ceil(p.maxHp*.5):p.maxHp,char);
  }
  const p = S.createPlayer('x'); S.grantItem(p,'heart_jar'); a.equal(p.maxHp,18);
  const panel={innerHTML:'',style:{},setAttribute(){},classList:{add(){},remove(){},toggle(){}}}, win={SPUD:{data:D,sim:{...S,rollUpgrades:()=>[{id:'maxHp',value:3,tier:1}]},i18n:{t:x=>x,stat:x=>x,grade:x=>x},main:{session:{wave:1}}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/ui.js'),'utf8'),{window:win,document:{getElementById:()=>panel,body:panel},requestAnimationFrame:fn=>fn()}); p.levelUps=1;win.SPUD.ui.upgrades(p,()=>{});panel.onclick({target:{closest:()=>({dataset:{act:'pick0'}})}});a.equal(p.maxHp,21);
  const next = S.createWorld({wave:2,players:{x:p}}).players.x; a.equal(next.maxHp,21); a.equal(next.hp,21);
  S.grantItem(next,'handcuffs'); const before = next.maxHp; S.grantItem(next,'heart_jar'); a.equal(next.maxHp,before);
  const clamped = S.createPlayer('x','basic',{stats:{maxHp:-3}}); a.equal(clamped.maxHp,1);
});
test('legacy and new checkpoint restore do not inflate stats or heal current HP', () => {
  for (const baseline of [10,12]) for (const mode of ['wave','shop']) {
    const w = S.createWorld({players:{solo:{char:'basic',stats:{...D.stats,maxHp:baseline}}}});
    w.players.solo.hp = 3.5; if(mode==='shop') w.ended=w.reported=true;
    const map=new Map(), storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
    a.equal(S.soloSave.save(storage,{mode,world:w,offers:[],cratesRemaining:0,shopRolls:0},1000),true);
    for(let i=0;i<3;i++) { const save=S.soloSave.load(storage,1001); a.equal(save.world.players.solo.hp,3.5); a.equal(save.world.players.solo.maxHp,baseline); a.equal(save.world.players.solo.stats.maxHp,baseline); a.equal(S.soloSave.save(storage,save,1001),true); }
  }
});
function sessions() {
  const h = new N.Session({uid:'host',host:'host'}), packets=[];
  const g = new N.Session({uid:'guest',host:'host',sendRt:p=>packets.push(p)});
  for(const s of [h,g]) { s.players={host:{},guest:{}}; s.wave=4; s.phase='wave'; }
  h.world=S.createWorld({wave:4,players:{host:{char:'basic'},guest:{char:'basic'}}});
  h.world.players.guest.alive=false; h.world.players.guest.hp=0;
  g.buffer.push(N.encode(h.world),1000);
  return {h,g,packets};
}
test('revive sender/wave authority: reject stale/missing/forged/terminal requests, new wave can revive once', () => {
  for(const phase of ['select','shop','end']) {
    const {h,g,packets}=sessions(); h.phase=g.phase=phase;
    a.equal(g.requestRevive(),false); a.equal(packets.length,0); h.rt('guest',{t:'rv',w:4}); a.equal(h.world.players.guest.alive,false);
  }
  for(const data of [{t:'rv',w:3},{t:'rv'},{t:'rv',w:4,uid:'host'}]) {
    const {h}=sessions(); h.rt('guest',data); a.equal(h.world.players.guest.alive,false);
  }
  const {h,g,packets}=sessions(); a.equal(g.requestRevive(),true); a.deepEqual(packets,[{t:'rv',w:4}]);
  h.rt('departed',packets[0]); a.equal(h.world.players.guest.alive,false);
  h.rt('guest',packets[0]); a.equal(h.world.players.guest.alive,true); a.equal(h.world.players.guest.hp,6);
  h.world.players.guest.alive=false; h.rt('guest',packets[0]); a.equal(h.world.players.guest.alive,false);
  h.world.reported=true; a.equal(S.shakeRevive(h.world,'guest'),false);
});
function mainHarness(permission) {
  const events = new Map(), nodes = new Map(); let now=1000;
  const add=(key,cb)=>{if(!events.has(key)) events.set(key,new Set());events.get(key).add(cb);};
  const node=id=>{ if(!nodes.has(id)) nodes.set(id,{hidden:true,style:{},classList:{add(){},remove(){}},addEventListener(){},getBoundingClientRect:()=>({left:0,top:0})});return nodes.get(id);};
  const ui={t:x=>x,title(){},result(){},closeSheet(){},choose(){},hide(){},show(){},crates(){},shop(){}};
  const window={addEventListener:(k,c)=>add('w:'+k,c),removeEventListener:(k,c)=>events.get('w:'+k)?.delete(c)};
  const document={hidden:false,getElementById:node,addEventListener:(k,c)=>add(k,c)};
  window.SPUD={data:D,sim:S,net:N,ui};
  const text=fs.readFileSync(require.resolve('../js/main.js'),'utf8').replace('  P.main = {',`  P.test = { updateRevive, onMotion, startShake, finish, reset, beginSolo, connect, handleAction, onRosterChanged, shake, set(s){session=s; uid='guest';mode='wave';lobby={};}, mode(v){mode=v;}, getSession:()=>session };\n  P.main = {`);
  vm.runInNewContext(text,{window,document,location:{search:''},localStorage:{getItem(){},setItem(){},removeItem(){}},URLSearchParams,performance:{now:()=>now},navigator:{vibrate(){}},matchMedia:()=>({matches:true}),DeviceMotionEvent:permission?{requestPermission:permission}:{},requestAnimationFrame(){},setTimeout(){},setInterval(){},clearTimeout(){},clearInterval(){},console,MultiplayerLobby:class {constructor(){} }});
  const t=window.SPUD.test, {h}=sessions(); h.uid='guest'; h.isHost=false; h.buffer.push(N.encode(h.world),1001); t.set(h);
  const view={players:h.world.players};
  return {t,h,view,btn:node('reviveBtn'),node,document,events,motion(){now+=221;for(const cb of events.get('w:devicemotion')||[]) cb({acceleration:{x:20,y:0,z:0}});}};
}
for(const ending of ['win','loss','reset','newgame','waveEnd','hostLeave','lobby','pagehide']) test(`shake UI cleanup immediately on ${ending}; late sensors never revive`, () => {
  const q=mainHarness(); q.t.updateRevive(q.view); a.equal(q.btn.hidden,false); q.motion(); a.equal(q.t.shake.count,1);
  if(ending==='win'||ending==='loss') q.t.finish({win:ending==='win',wave:4});
  else if(ending==='reset') q.t.reset();
  else if(ending==='newgame') q.t.beginSolo();
  else if(ending==='waveEnd') q.t.handleAction({type:'WAVE_END',payload:{w:4,players:{}}});
  else if(ending==='hostLeave') {q.h.host='old';q.t.onRosterChanged({players:['guest'],hostUser:'new'});}
  else if(ending==='lobby') q.t.connect();
  else for(const cb of q.events.get('w:pagehide')||[]) cb();
  a.equal(q.btn.hidden,true); a.equal(q.t.shake.on,false); a.equal(q.t.shake.count,0); a.equal(q.events.get('w:devicemotion')?.size||0,0);
  q.t.onMotion({acceleration:{x:99,y:0,z:0}}); a.equal(q.t.shake.count,0);
});
test('late iOS permission resolution cannot reattach in terminal or replaced session',async()=>{
  for(const replace of [false,true]) { let resolve; const q=mainHarness(()=>new Promise(r=>resolve=r)); q.t.updateRevive(q.view); q.t.startShake();
    if(replace) q.t.beginSolo();else q.t.finish({win:false,wave:4}); resolve('granted'); await Promise.resolve();
    a.equal(q.t.shake.on,false);a.equal(q.btn.hidden,true);a.equal(q.events.get('w:devicemotion')?.size||0,0);
  }
});

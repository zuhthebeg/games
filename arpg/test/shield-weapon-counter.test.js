import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,addPlayer,spawnMonster,step,emptyInput} from '../js/sim/world.js';
import {ABILITIES,PLAYER_BASE as PB} from '../js/content/combat.js';
import {ticks} from '../js/sim/core.js';
import {predictPlayerTick} from '../js/net/player-prediction.js';
import {encodeSnapshot,decodeSnapshot} from '../js/net/protocol.js';
const fixture=(weapon='blade',mods={})=>{const w=createWorld(),p=addPlayer(w,{pid:'p',weapon,x:500,y:400,mods:{mpRegen:0,...mods}});return {w,p};};
const mob=(w,x=550,y=400)=>{const m=spawnMonster(w,'ghoul',x,y,{hpMult:100});m.spawnLeft=0;m.thinkLeft=100000;return m;};
const shot=(w,owner,p,damage=100,fromX=550,fromY=400,extra={})=>{w.projectiles.push({id:w.nextId++,ownerId:owner.id,ownerKind:owner.kind,ownerType:owner.type,team:owner.team,abilityId:'sling_stone',def:{...ABILITIES.sling_stone,damage,knockback:0},x:fromX,y:fromY,vx:(p.x-fromX)*30,vy:(p.y-fromY)*30,r:3,travelled:0,range:500,pierce:0,hit:[],dmgMult:1,poiseMult:1,...extra});return step(w,{p:{...emptyInput(),dodgeHeld:p.shieldGuard?.left>0}});};
const start=(w,p,input={})=>step(w,{p:{...emptyInput(),aimX:1,dodgeEdge:true,dodgeHeld:p.offhand==='shield',...input}});
test('physical guard is stationary while held, aim facing and shared cooldown with host/prediction/snapshot parity',()=>{
 const {w,p}=fixture('blade',{offhand:'shield'}),before=structuredClone(p),inp={...emptyInput(),mx:1,aimX:1,dodgeEdge:true,dodgeHeld:true};
 const pred=predictPlayerTick(before,inp,{arena:w.arena,tick:w.tick});step(w,{p:inp});
 assert.equal(p.x,500);assert.equal(p.dodge.iframeLeft,0);assert.equal(p.dodge.dashLeft,0);assert.ok(p.shieldGuard.left===1);assert.equal(pred.x,p.x);assert.deepEqual(pred.shieldGuard,p.shieldGuard);
 const cd=p.dodge.cdLeft;for(let i=0;i<5;i++)step(w,{p:{...emptyInput(),mx:1,aimY:1,dodgeHeld:true,attack:true,skillEdge:true}});assert.equal(p.x,500);assert.equal(p.facing,Math.PI/2);assert.equal(p.act,null);assert.equal(p.dodge.cdLeft,cd-5);
 w.round={stageId:'S1',state:'running',pending:[]};const copy=decodeSnapshot(encodeSnapshot(w),'p').entities[0];assert.equal(copy.offhand,'shield');assert.deepEqual(copy.shieldGuard,p.shieldGuard);
});
test('guard front 120deg including boundary reduces real direct damage only, min1 and passive guard compose once',()=>{
 for(const [angle,blocked] of [[0,true],[Math.PI/3,true],[Math.PI/3+.01,false],[Math.PI/2,false],[Math.PI,false]]) {
  const {w,p}=fixture('blade',{offhand:'shield',maxHp:1000}),m=mob(w,900);start(w,p);for(let i=0;i<20;i++)step(w,{p:{...emptyInput(),dodgeHeld:true}});const x=p.x+50*Math.cos(angle),y=p.y+50*Math.sin(angle);const hp=p.hp;shot(w,m,p,100,x,y);assert.equal(hp-p.hp,blocked?24:80,`${angle}`);
 }
 const {w,p}=fixture('blade',{offhand:'shield'}),m=mob(w,900);start(w,p);for(let i=0;i<20;i++)step(w,{p:{...emptyInput(),dodgeHeld:true}});shot(w,m,p,1);assert.equal(p.hp,99);
});
test('genuine perfect front block pays one shield bash, back attack never pays',()=>{
 for(const front of [true,false]) {
  const {w,p}=fixture('blade',{offhand:'shield',maxHp:1000}),m=mob(w,front?550:450);const ev=start(w,p);ev.push(...shot(w,m,p,10,front?550:450));
  p.hurtInvuln=0;ev.push(...shot(w,m,p,10,front?550:450));for(let i=0;i<45;i++)ev.push(...step(w));
  assert.equal(ev.filter(e=>e.type==='perfectDodge'&&e.id===p.id).length,front?1:0);assert.equal(ev.filter(e=>e.type==='act'&&e.ability==='shield_bash').length,front?1:0);assert.equal(ev.some(e=>e.type==='counter'&&e.ability==='slash'),false);
 }
});
test('focus perfect contact blinks total1.6x original dodge distance, arena clamp, skill-only reset once per8seconds and no basic counter',()=>{
 const {w,p}=fixture('focus',{skills:['ember_bolt','frost_lance','healing_light']}),m=mob(w,900);m.frozenUntil=10000;p.cds={ember_bolt:100,frost_lance:100,healing_light:100,slash:100};const before=p.x;start(w,p);
 shot(w,m,p,10,p.x+25,p.y);assert.equal(p.x,before+PB.dodge.distance*1.6);assert.equal(p.dodge.dashLeft,0);assert.equal(p.pendingCounter,null);assert.equal(p.cds.ember_bolt,0);assert.ok(p.cds.slash>0);assert.ok(p.focusResetUntil>w.tick);
 p.cds.ember_bolt=100;p.dodge.cdLeft=0;p.dodge.iframeLeft=0;p.x=500;start(w,p);shot(w,m,p,10,p.x+25,p.y);assert.ok(p.cds.ember_bolt>0);assert.equal(p.pendingCounter,null);
 while(w.tick<p.focusResetUntil)step(w);p.cds.ember_bolt=100;p.x=w.arena.w-p.r-80;p.dodge.cdLeft=0;p.dodge.iframeLeft=0;start(w,p);shot(w,m,p,10,p.x+25,p.y);assert.equal(p.x,w.arena.w-p.r);assert.equal(p.cds.ember_bolt,0);
});

test('bow counter is guaranteed1.8x critical with no random crit stacking or RNG consumption',()=>{
 for(const critChance of [0,1]) {
  const {w,p}=fixture('bow',{critChance,critMult:99}),m=mob(w,550);m.frozenUntil=10000;p.pendingCounter={attackerId:m.id,dodgeTick:0,expiresTick:100};const rng=w.rng,events=[];
  for(let i=0;i<25;i++)events.push(...step(w));const hits=events.filter(e=>e.type==='hit'&&e.dst===m.id);assert.equal(hits.length,1);assert.equal(hits[0].crit,true);assert.equal(hits[0].dmg,Math.round(ABILITIES.arrow.damage*2.2*1.8));assert.equal(w.rng,rng);
 }
});
test('sword has two once-only counter strikes, second70% actual first damage; blunt retains one',()=>{
 for(const form of [undefined,'blunt']) {
  const {w,p}=fixture('blade',{weaponForm:form}),m=mob(w,550);m.frozenUntil=10000;p.pendingCounter={attackerId:m.id,dodgeTick:0,expiresTick:100};const ev=[];
  for(let i=0;i<60;i++) {m.x=550;m.kx=0;m.ky=0;ev.push(...step(w));}
  const hits=ev.filter(e=>e.type==='hit'&&e.dst===m.id);assert.equal(hits.length,form==='blunt'?1:2);if(!form)assert.equal(hits[1].dmg,Math.round(hits[0].dmg*.7));
 }
});
test('sword followup never fires after interrupt, death or target leaving range',()=>{
 for(const mode of ['interrupt','death','range']) {
  const {w,p}=fixture('blade'),m=mob(w,550);m.frozenUntil=10000;p.pendingCounter={attackerId:m.id,dodgeTick:0,expiresTick:100};const ev=[];
  while(!ev.some(e=>e.type==='hit'&&e.src===p.id))ev.push(...step(w));
  if(mode==='death'){p.dead=true;p.hp=0;}else if(mode==='range'){m.x=1200;}else {p.dodge.cdLeft=0;ev.push(...start(w,p));}
  for(let i=0;i<60;i++)ev.push(...step(w));assert.equal(ev.filter(e=>e.type==='hit'&&e.src===p.id).length,1,mode);
 }
});
test('late physical guard fully refunds one perfect frontal direct contact, never back or periodic damage; duplicate presses do not repay',async()=>{
 const {enableGuestDodgeLag}=await import('../js/sim/dodge-lag.js');
 for(const front of [true,false]) {
  const {w,p}=fixture('blade',{offhand:'shield',maxHp:1000}),m=mob(w,900);enableGuestDodgeLag(w,'p');
  const before=p.hp;shot(w,m,p,100,front?550:450);assert.equal(before-p.hp,80);
  const ev=start(w,p,{viewTick:0});assert.equal(before-p.hp,front?0:80);assert.equal(p.dodge.iframeLeft,0);assert.equal(ev.find(e=>e.type==='dodgeRewind')?.heal,front?80:undefined);
  step(w,{p:{...emptyInput(),dodgeHeld:true,dodgeEdge:true,viewTick:0}});assert.equal(before-p.hp,front?0:80);
 }
});

test('physical block never stops periodic poison and magical protective shield remains separate one-hit absorption',()=>{
 const {w,p}=fixture('blade',{offhand:'shield',maxHp:1000}),m=mob(w,900);start(w,p);
 p.poison={left:10,next:1,interval:10,hit:{srcId:m.id,srcKind:'monster',periodic:true,abilityId:'spider_puddle',def:{damage:10,knockback:0},mult:1,fromX:550,fromY:400}};
 const hp=p.hp;step(w,{p:{...emptyInput(),dodgeHeld:true}});assert.equal(p.hp,hp-10);assert.equal(p.dodge.perfectPaid,false);
 p.shieldUntil=w.tick+100;const before=p.hp;shot(w,m,p,100,450,400);assert.equal(p.hp,before);assert.equal(p.shieldUntil,undefined);assert.equal(p.dodge.perfectPaid,false);
});
test('guard initial aim wins over movement and updates held aim while attack/skill presses cannot bypass it',()=>{
 const {w,p}=fixture('blade',{offhand:'shield'});const inp={...emptyInput(),mx:1,aimY:1,dodgeHeld:true,dodgeEdge:true};const pred=predictPlayerTick(structuredClone(p),inp,{arena:w.arena});step(w,{p:inp});assert.equal(p.facing,Math.PI/2);assert.equal(pred.facing,p.facing);
 for(let i=0;i<10;i++)step(w,{p:{...emptyInput(),aimX:-1,dodgeHeld:true,attack:true,skillEdge:true}});assert.equal(p.facing,Math.PI);assert.equal(p.x,500);assert.equal(p.act,null);assert.equal(p.mp,100);
});
test('focus late contact refunds ordinary hit then blinks from corrected original origin once; no client contact reward',async()=>{
 const {enableGuestDodgeLag}=await import('../js/sim/dodge-lag.js');const {w,p}=fixture('focus',{skills:['ember_bolt','frost_lance','healing_light']}),m=mob(w,900);m.frozenUntil=10000;enableGuestDodgeLag(w,'p');
 shot(w,m,p,10,525,400);p.cds.ember_bolt=100;const before=structuredClone(p),inp={...emptyInput(),mx:1,dodgeHeld:true,dodgeEdge:true,viewTick:0};
 const predicted=predictPlayerTick(before,inp,{arena:w.arena,tick:w.tick});assert.ok(predicted.cds.ember_bolt>0);assert.equal(predicted.focusResetUntil,undefined);
 const events=step(w,{p:inp});assert.equal(p.hp,100);assert.equal(p.x,500+PB.dodge.distance*1.6);assert.equal(p.cds.ember_bolt,0);assert.equal(events.filter(e=>e.type==='perfectDodge').length,1);assert.equal(p.pendingCounter,null);
});
test('host owns remote physical guard and sends actual equipment/guard state without an iframe',async()=>{
 const [{CoopSession},{createMemoryTransport}]=await Promise.all([import('../js/net/session.js'),import('../js/net/loopback.js')]);const net=createMemoryTransport(),sessions={};
 for(const uid of ['host','guest']) {const transport=net.connect(uid,(from,p)=>p.t==='action'?sessions[uid].action(p.action):sessions[uid].rt(from,p));sessions[uid]=new CoopSession({uid,host:'host',players:['host','guest'],config:{stageId:'S1',seed:1,threat:1},profile:{name:uid,level:1,weapon:'blade',mods:{offhand:'shield'},threats:{S1:1}},...transport});}
 sessions.guest.update(34,emptyInput());const w=sessions.host.world;w.round.pending=[];const p=w.entities.find(e=>e.pid==='guest'),x=p.x;
 sessions.guest.update(34,{...emptyInput(),mx:1,dodgeHeld:true,dodgeEdge:true});sessions.host.update(34,emptyInput());assert.equal(p.x,x);assert.equal(p.offhand,'shield');assert.ok(p.shieldGuard.left>0);assert.equal(p.dodge.iframeLeft,0);assert.equal(sessions.guest.world,null);
 sessions.host.broadcast();w.tick++;sessions.host.broadcast();const shown=sessions.guest.view().entities.find(e=>e.pid==='guest');assert.equal(shown.offhand,'shield');assert.ok(shown.shieldGuard.left>0);
});

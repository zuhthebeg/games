import test from 'node:test';
import assert from 'node:assert/strict';
import {Graphics,Container} from '../vendor/pixi-8.22.0.min.mjs';
import {SkillVfx} from '../js/render/skill-vfx.js';
import {createWorld,addPlayer,startStage,step,emptyInput,spawnMonster} from '../js/sim/world.js';
import {MONSTERS} from '../js/content/combat.js';
import {encodeSnapshot,decodeSnapshot} from '../js/net/protocol.js';
import {whirlTimeline,whirlFrame,nextWhirlFrame} from '../js/sim/whirl-evolution.js';
import {CoopSession} from '../js/net/session.js';
import {createMemoryTransport} from '../js/net/loopback.js';
import {createSave,validateSave} from '../js/meta/save.js';
import {createTracker,trackRound,settleRound} from '../js/meta/run.js';
import {buildRoundMods} from '../js/meta/run.js';
const input=cast=>({...emptyInput(),aimX:1,skillEdge:!!cast});
function setup(){const w=createWorld({seed:4});const p=addPlayer(w,{pid:'p',x:300,y:400,skillMasteryLevels:{whirl:20},mods:{skills:['whirl'],mpRegen:0}});startStage(w,'S2');w.entities=[p];Object.assign(w.round,{pending:[],goal:'timer',timerTicks:100000});return {w,p};}
function mob(w,type='goblin_grunt'){const g=spawnMonster(w,type,320,400);Object.assign(g,{spawnLeft:0,r:1,hp:100000,maxHp:100000,speed:0,thinkLeft:100000});return g;}
const saved=count=>{const rewardSave=createSave({name:'whirl',weapon:'blade',answers:[0,0,0,0,0],createdAt:1});rewardSave.cleared.S1=true;rewardSave.skillMastery.whirl=count;return {weapon:'blade',level:1,lineage:'human',role:'hunter',rewardSave,mods:{...buildRoundMods(rewardSave),skills:['whirl'],mpRegen:0}};};
function session(profiles){const net=createMemoryTransport(),s={};for(const uid of ['h','g']){const tr=net.connect(uid,(from,d)=>d.t==='action'?s[uid].action(d.action):s[uid].rt(from,d));s[uid]=new CoopSession({uid,host:'h',players:['h','g'],profile:profiles[uid],config:{stageId:'S2',seed:1,threat:1},...tr});}s.g.update(34,emptyInput());assert.equal(s.h.phase,'running');return s;}
test('admission 499/500 and reversed host guest, live display differs without upgrading, bare maps forbidden',()=>{for(const swap of [false,true])for(const bare of [false,true]){const s=session({h:bare?{weapon:'blade',skillMasteryLevels:{whirl:30}}:saved(swap?500:499),g:saved(swap?499:500)});const [h,g]=['h','g'].map(id=>s.h.world.entities.find(e=>e.pid===id));assert.equal(!!h.whirl20,!bare&&swap);assert.equal(!!g.whirl20,!swap);s.h.setMastery({whirl:30});s.g.setMastery({whirl:30});assert.equal(h.skillMasteryLevels.whirl,30);assert.equal(g.skillMasteryLevels.whirl,30);assert.equal(!!h.whirl20,!bare&&swap);assert.equal(!!g.whirl20,!swap);}});
test('combat3 rejects old and unknown protocol metadata explicitly',()=>{const s=new CoopSession({uid:'h',host:'h',players:['h','g'],profile:{weapon:'blade'},config:{stageId:'S2',threat:1}});for(const version of [undefined,1,2,4])assert.equal(s.negotiate({h:s.profile,g:{weapon:'blade',combatVersion:version}}),false);});
test('full window timelines including odd and extreme n1 with no pause',()=>{for(const [n,expected] of [[1,[1,1]],[2,[1,1]],[3,[2,1]],[4,[2,2]],[5,[3,2]],[7,[4,3]]]){const {first,second,total}=whirlTimeline(n);assert.deepEqual([first,second],expected);const a={phaseTicks:{windup:7,lock:0,active:total},left:total,elapsed:7};const next=[],completed=[];for(let i=0;i<total;i++){next.push(nextWhirlFrame(a).segment);a.elapsed++;a.left--;completed.push(whirlFrame(a).segment);}assert.deepEqual(next,[...Array(first).fill(1),...Array(second).fill(2)]);assert.deepEqual(completed,next);a.elapsed++;assert.equal(whirlFrame(a).segment,0);}});
test('explicit rate1 timeline fixture phases7/4/9 and actual contacts7/9; duplicate edge pays once',()=>{const {w,p}=setup(),g=mob(w);const hitTicks=[],acts=[];for(let i=0;i<20;i++){g.x=p.x+20;g.kx=g.ky=0;const es=step(w,{p:input(i<9)});hitTicks.push(...es.filter(e=>e.type==='hit').map(()=>i));acts.push(...es.filter(e=>e.type==='act'));if(i===0){Object.assign(p.act,{rate:1,phaseTicks:{windup:7,lock:0,active:4,recovery:9},left:6,total:7});}}assert.deepEqual(hitTicks,[7,9]);assert.equal(acts.length,1);assert.equal(p.mp,p.maxMp-20);assert.equal(p.cds.whirl,180);});
test('real circle boundary includes r, two windows on current center not frozen origin',()=>{const {w,p}=setup();const gs=[137.5,137.501,20].map(()=>mob(w));const hits=[];for(let i=0;i<32;i++){if(i===3)p.kx=25;gs.forEach((g,j)=>{g.x=p.x+[137.5,137.501,20][j];g.y=p.y;g.kx=g.ky=0;});hits.push(...step(w,{p:input(i===0)}).filter(e=>e.type==='hit'));if(p.act)assert.equal(p.act.ox,300);}assert.equal(hits.filter(e=>e.dst===gs[0].id).length,2);assert.equal(hits.filter(e=>e.dst===gs[1].id).length,0);assert.equal(hits.filter(e=>e.dst===gs[2].id).length,2);assert.ok(p.x>300);});
test('first stagger does not reamplify budget and boss poise/KB split remains30/200',()=>{for(const type of ['goblin_grunt','goblin_chief']){const {w,p}=setup(),g=mob(w,type);g.poise=type==='goblin_grunt'?1:10000;g.maxPoise=0;let impulse=0;const hits=[];for(let i=0;i<32;i++){g.x=p.x+20;g.y=p.y;g.kx=g.ky=0;const es=step(w,{p:input(i===0)});for(const e of es.filter(e=>e.type==='hit')){hits.push(e);impulse+=Math.hypot(g.kx,g.ky);}}assert.deepEqual(hits.map(e=>e.dmg),[22,22]);assert.ok(Math.abs(impulse-200*(1-MONSTERS[type].kbResist)/30*2.2*.82)<1e-8);if(type==='goblin_chief')assert.equal(g.poise,9970);}});
test('codec relation mutations every phase boundary and host cache excluded from wire',()=>{const {w,p}=setup(),g=mob(w);for(let i=0;i<32;i++){g.x=p.x+20;g.kx=g.ky=0;step(w,{p:input(i===0)});const good=encodeSnapshot(w);assert.ok(decodeSnapshot(good,'p'));if(!p.act)continue;assert.equal(good.entities[0].act.whirlBudgets,undefined);for(const mutate of [a=>a.elapsed++,a=>a.castTick++,a=>a.rate*=2,a=>a.left++,a=>a.phaseTicks.recovery++,a=>a.oy=Infinity,a=>a.id='lunge']){const bad=structuredClone(good);mutate(bad.entities[0].act);assert.equal(decodeSnapshot(bad,'p'),null);}}});
test('actual actor completed geometry and static reduced cue at first/last/second/recovery frames',()=>{for(const n of [2,3,4,5])for(const reduced of [false,true]){const {w,p}=setup(),vfx=new SkillVfx(Graphics,new Container());vfx.requestSkill=()=>null;const seen=[];step(w,{p:input(true)});p.act.phaseTicks.active=n;for(let i=0;i<32;i++){step(w,{p:emptyInput()});if(!p.act)continue;vfx.actor(p,w.tick,reduced);const slot=vfx.actors.find(s=>s.id===p.id),frame=whirlFrame(p.act);assert.ok(slot);assert.equal(slot.node.visible,!!frame.segment);if(frame.segment){seen.push(frame.segment);assert.equal(slot.node.x,p.x);assert.equal(slot.node.y,p.y);assert.equal(slot.node.scale.x,1);assert.ok(slot.node.context.bounds.maxX<=136.501);if(reduced)assert.equal(slot.node.rotation,p.act.facing);}}assert.deepEqual(seen,[...Array(Math.ceil(n/2)).fill(1),...Array(Math.floor(n/2)).fill(2)]);}});
test('round end reset and both boundaries cancel remaining contact with no pending objects',()=>{for(const boundary of [0,1,2])for(const reason of ['state','reset','dead','terminal','channel','staggerLeft']){const {w,p}=setup();step(w,{p:input(true)});while(p.act?.phase!=='active'||nextWhirlFrame(p.act).segment<Math.max(1,boundary))step(w,{p:emptyInput()});if(reason==='state')w.round.state='clear';else if(reason==='reset')startStage(w,'S2');else p[reason]=['dead','terminal'].includes(reason)?true:10;step(w,{p:emptyInput()});assert.equal(p.act,null);assert.equal(w.projectiles.length,0);assert.equal(w.zones?.length||0,0);}});
test('100 casts four players bounded caches reclaimed; misses have no mastery',()=>{const {w,p}=setup(),ps=[p,...[1,2,3].map(i=>addPlayer(w,{pid:'p'+i,x:300,y:400,skillMasteryLevels:{whirl:20},mods:{skills:['whirl'],mpRegen:0,maxMp:10000}}))],gs=[mob(w),mob(w)];ps.forEach(p=>p.mp=p.maxMp=10000);for(let cast=0;cast<100;cast++){for(let i=0;i<35;i++){gs.forEach(g=>{g.x=320;g.y=400;g.kx=g.ky=0;});step(w,Object.fromEntries(ps.map(p=>[p.pid,input(i===0)])));for(const q of ps)if(q.act)assert.ok(Object.keys(q.act.whirlBudgets).length<=gs.length);}for(const q of ps){assert.equal(q.act,null);q.cds.whirl=0;}}});
test('real journal kill once and settlement reload mastery+1, miss0',()=>{for(const miss of [false,true]){const {w,p}=setup(),g=mob(w);g.hp=g.maxHp=40;let tracker=createTracker(4),kills=0;const save=saved(500).rewardSave;for(let i=0;i<32;i++){g.x=miss?900:p.x+20;g.y=p.y;g.kx=g.ky=0;const es=step(w,{p:input(i===0)});kills+=es.filter(e=>e.type==='kill').length;tracker=trackRound(save,tracker,es,{},w,'p').tracker;}assert.equal(kills,miss?0:1);assert.equal(tracker.skillMastery?.whirl||0,miss?0:1);const settled=settleRound(save,{stageId:'S2',terminal:'return_scroll',depositedXp:tracker.depositedXp,tempLoot:tracker.tempLoot,skillMastery:tracker.skillMastery});const reloaded=JSON.parse(JSON.stringify(settled.save));assert.ok(validateSave(reloaded));assert.equal(reloaded.skillMastery.whirl,miss?500:501);}});

import {shieldDamage} from '../js/sim/movement.js';
import {enableGuestDodgeLag} from '../js/sim/dodge-lag.js';
import {enableGuestAttackLag} from '../js/sim/attack-lag.js';
function duel({damage=45,shield=false,slow=false,hold=null,protect=false,charges=0,guardChange=null}={}){
 const {w,p}=setup();p.dmgMult.blade=damage/44;
 const q=addPlayer(w,{pid:'q',x:340,y:400,mods:{maxHp:10000,mpRegen:0,...(shield?{offhand:'shield',shieldModel:{v:1,type:'buckler'}}:{})}});q.team=1;q.r=1;if(protect)q.hurtInvuln=100;
 if(charges){q.shieldUntil=1000;q.shieldCharges=charges;}
 const hits=[],events=[];let impulse=0;
 for(let i=0;i<70;i++){
  q.x=p.x+40;q.y=p.y;q.kx=q.ky=0;
  if(guardChange)q.guard=guardChange(p.act);
  const es=step(w,{p:input(i===0),q:{...emptyInput(),aimX:-1,dodgeHeld:hold?hold(p.act):shield}});
  if(i===0&&slow){p.act.phaseTicks.active=18;} // Explicit slow contact fixture, not reachable unbuffed speed tuning.
  events.push(...es);for(const e of es.filter(e=>e.type==='hit'&&e.ability==='whirl'&&e.dst===q.id)){hits.push(e);impulse+=Math.hypot(q.kx,q.ky);}
 }
 return {hits,events,impulse,q,p,w};
}
test('PvP iframe remains260ms, normal second blocked, protected untouched; slow fixture expires naturally',()=>{
 const normal=duel();assert.deepEqual(normal.hits.map(e=>e.dmg),[18]);assert.equal(normal.q.hp,9982);assert.ok(Math.abs(normal.impulse-100/30*2.2*.82)<1e-9);
 const protectedTarget=duel({protect:true});assert.equal(protectedTarget.hits.length,0);assert.equal(protectedTarget.q.hp,10000);
 const slow=duel({slow:true});assert.deepEqual(slow.hits.map(e=>e.dmg),[18,18]);assert.equal(slow.q.hp,9964);
});
test('defended final rounding B1 remains0+1; odd budgets and guard activation/release cannot inflate',()=>{
 for(const damage of [1,2,3,5,7,11,45,79]){const {hits,q}=duel({damage,shield:true,slow:true});const B=shieldDamage(Math.max(1,Math.round(damage*.8)),{v:1,type:'buckler'});assert.deepEqual(hits.map(e=>e.dmg),[Math.floor(B/2),Math.ceil(B/2)]);assert.equal(q.hp,10000-B);}
 const second=a=>a?.phase==='active'&&a.phaseTicks.active-a.left>=Math.ceil(a.phaseTicks.active/2)-1;
 const on=duel({shield:true,slow:true,hold:second});assert.ok(on.hits.reduce((n,e)=>n+e.dmg,0)<36);
 const off=duel({shield:true,slow:true,hold:a=>!second(a)});assert.equal(off.hits.reduce((n,e)=>n+e.dmg,0),shieldDamage(36,{v:1,type:'buckler'}));
 const guardOn=duel({slow:true,guardChange:a=>second(a)?.4:.8});assert.deepEqual(guardOn.hits.map(e=>e.dmg),[18,9]);
 const guardOff=duel({slow:true,guardChange:a=>second(a)?.8:.4});assert.deepEqual(guardOff.hits.map(e=>e.dmg),[9,9]);
});
test('shield charges and perfect guard remain existing per-contact protections',()=>{
 const charge=duel({charges:1});assert.equal(charge.events.filter(e=>e.type==='shieldBreak').length,1);assert.equal(charge.hits.length,1);assert.equal(charge.hits[0].dmg,18); // first absorbed, second does not gain first share.
 const {w,p}=setup(),q=addPlayer(w,{pid:'q',x:340,y:400,mods:{offhand:'shield',mpRegen:0,maxHp:10000}});q.team=1;
 let perfect=0;for(let i=0;i<28;i++){q.x=p.x+40;q.y=p.y;q.kx=q.ky=0;const edge=p.act?.phase==='windup'&&p.act.left===1;const es=step(w,{p:input(i===0),q:{...emptyInput(),aimX:-1,dodgeHeld:true,dodgeEdge:edge}});perfect+=es.filter(e=>e.type==='perfectDodge'&&e.id===q.id).length;}assert.equal(q.hp,9994);assert.equal(perfect,1); // One perfect reward; second window keeps ordinary shield mitigation.
});
test('target crit RNG draws once not per rotation even after exposure changes',()=>{
 const {w,p}=setup(),g=mob(w);p.critChance=.5;const changes=[];
 for(let i=0;i<32;i++){g.x=p.x+20;g.y=p.y;g.kx=g.ky=0;const old=w.rng;const es=step(w,{p:input(i===0)});if(es.some(e=>e.type==='hit'))changes.push([old,w.rng]);}
 assert.equal(changes.length,2);assert.notEqual(changes[0][0],changes[0][1]);assert.equal(changes[1][0],changes[1][1]);
});
test('late accepted dodge rewinds only first actual share; contact cause uses actual center',()=>{
 const {w,p}=setup(),q=addPlayer(w,{pid:'q',x:340,y:400,mods:{maxHp:10000,mpRegen:0}});q.team=1;enableGuestDodgeLag(w,'q');let hitTick;
 for(let i=0;i<20;i++){q.x=p.x+40;q.y=p.y;q.kx=q.ky=0;const es=step(w,{p:input(i===0),q:emptyInput()});if(es.some(e=>e.type==='hit'&&e.dst===q.id)){hitTick=w.tick-1;break;}}
 assert.equal(q.hp,9983);const es=step(w,{p:emptyInput(),q:{...emptyInput(),dodgeEdge:true,aimX:1,viewTick:hitTick}});assert.equal(q.hp,10000);assert.equal(es.filter(e=>e.type==='dodgeRewind').length,1);
 const pair=setup(),victim=addPlayer(pair.w,{pid:'v',x:500,y:400,mods:{maxHp:1,mpRegen:0}});victim.team=1;step(pair.w,{p:input(true)});const origin=pair.p.act.ox;pair.p.kx=20;let contactCenter;for(let i=0;i<25&&!victim.dead;i++){victim.x=pair.p.x+40;victim.y=pair.p.y;contactCenter=pair.p.x;step(pair.w,{p:emptyInput(),v:emptyInput()});}assert.ok(victim.dead);assert.notEqual(victim.deathCause.ox,origin);assert.equal(victim.deathCause.ox,contactCenter);
});
test('evolved repeating windows do not reuse guest attack pose rewind',()=>{
 const {w,p}=setup(),g=mob(w);enableGuestAttackLag(w,'p');
 // Maintain in-range history, then place target just outside for both windows.
 for(let i=0;i<6;i++)step(w,{p:emptyInput()});
 const poseTick=w.tick;const hits=[];for(let i=0;i<32;i++){g.x=p.x+150;g.y=p.y;g.kx=g.ky=0;hits.push(...step(w,{p:{...input(i===0),poseTick,skillPoseTicks:{skillEdge:poseTick}}}).filter(e=>e.type==='hit'));}assert.equal(hits.length,0);
});
test('same host suspend resume retains target budget identity and duplicate packet once transaction',()=>{
 const s=session({h:saved(500),g:saved(500)}),w=s.h.world,p=w.entities.find(e=>e.pid==='g');w.entities=w.entities.filter(e=>e.kind==='player');Object.assign(w.round,{pending:[],goal:'timer',timerTicks:10000});p.skills=['whirl',null,null];p.mpRegen=0;const g=mob(w);let resumed=false,acts=0,hits=0;
 const packet=s.g.sender.packet(input(true),w.tick,0);for(let i=0;i<20;i++)s.h.rt('g',packet);
 for(let i=0;i<40;i++){g.x=p.x+40;g.y=p.y;g.kx=g.ky=0;s.h.update(34,emptyInput());acts+=w.events.filter(e=>e.type==='act'&&e.id===p.id).length;hits+=w.events.filter(e=>e.type==='hit'&&e.src===p.id).length;if(!resumed&&p.act?.whirlBudgets[g.id]){const cache=p.act.whirlBudgets;s.h.suspend();s.h.resume();assert.equal(p.act.whirlBudgets,cache);resumed=true;}}
 assert.ok(resumed);assert.equal(acts,1);assert.equal(hits,2);assert.ok(Math.abs(p.mp-(p.maxMp-20))<1e-9);assert.equal(p.act,null);
});

import {ticks} from '../js/sim/core.js';
test('explicit n1/n2/n3/odd rate fixtures execute both contacts and codec every completed frame',()=>{for(const rate of [3,1.8,1.2,.7]){const {w,p}=setup(),g=mob(w);step(w,{p:input(true)});const raw=Math.max(1,ticks(120/rate));const phaseTicks={windup:Math.max(1,ticks(220/rate)),lock:0,active:Math.max(1,Math.ceil(raw/2))+Math.max(1,Math.floor(raw/2)),recovery:Math.max(1,ticks(300/rate))};Object.assign(p.act,{rate,phaseTicks,left:phaseTicks.windup-1,total:phaseTicks.windup});const contacts=[];for(let i=1;i<40;i++){g.x=p.x+40;g.y=p.y;g.kx=g.ky=0;const es=step(w,{p:emptyInput()});contacts.push(...es.filter(e=>e.type==='hit').map(()=>i));assert.ok(decodeSnapshot(encodeSnapshot(w),'p'));}assert.deepEqual(contacts,[phaseTicks.windup,phaseTicks.windup+Math.ceil(phaseTicks.active/2)]);assert.equal(phaseTicks.active,raw===1?2:raw);}});
test('rejected MP gear slot terminal and ended round inputs cannot spend or create evolved cast',()=>{for(const why of ['mp','gear','slot','terminal','ended']){const {w,p}=setup();if(why==='mp')p.mp=19;if(why==='gear')p.weapon='bow';if(why==='slot')p.skills=[null,null,null];if(why==='terminal')p.terminal='return_scroll';if(why==='ended')w.round.state='clear';const mp=p.mp;const es=step(w,{p:input(true)});assert.equal(p.act,null);assert.equal(p.mp,mp);assert.equal(p.cds.whirl,undefined);assert.equal(es.some(e=>e.type==='act'&&e.ability==='whirl'),false);}});

test('snapshot even from host cannot invent or erase frozen whirl admission; other senders rejected',()=>{
 const s=session({h:saved(499),g:saved(500)}),w=s.h.world;
 assert.ok(Object.isFrozen(s.g.whirlCapabilities));assert.deepEqual(s.g.whirlCapabilities,{h:false,g:true});s.h.setMastery({whirl:30});s.g.setMastery({whirl:1});
 const before=s.g.buffer.frames.map(f=>f.world.tick);
 for(const mutate of [packet=>packet.entities.find(e=>e.pid==='h').whirl20=true,packet=>delete packet.entities.find(e=>e.pid==='g').whirl20]){const packet=encodeSnapshot(w);packet.tick=w.tick+10;mutate(packet);s.g.rt('h',packet);assert.deepEqual(s.g.buffer.frames.map(f=>f.world.tick),before);}
 const forged=encodeSnapshot(w);forged.tick=w.tick+20;s.g.rt('g',forged);assert.deepEqual(s.g.buffer.frames.map(f=>f.world.tick),before);
 assert.deepEqual(s.g.whirlCapabilities,{h:false,g:true});
});

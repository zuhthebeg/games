import test from 'node:test';
import assert from 'node:assert/strict';
import {Graphics,Container} from '../vendor/pixi-8.22.0.min.mjs';
import {SkillVfx} from '../js/render/skill-vfx.js';
import {createWorld,addPlayer,startStage,step,emptyInput} from '../js/sim/world.js';
import {CoopSession} from '../js/net/session.js';
import {encodeSnapshot,decodeSnapshot} from '../js/net/protocol.js';
import {lungeFrame,nextLungeFrame} from '../js/sim/lunge-evolution.js';
const fixture=(speed=0)=>{const w=createWorld();const p=addPlayer(w,{pid:'p',x:300,y:400,skillMasteryLevels:{lunge:20},mods:{attackSpeedBonus:speed,mpRegen:0}});startStage(w,'S2');w.entities=[p];Object.assign(w.round,{pending:[],goal:'timer',timerTicks:10000});return {w,p};};
test('unvalidated self/guest profiles cannot claim evolution; legacy lunge remains usable',()=>{
 for(const invalid of [undefined,{},null]){
  const profile={combatVersion:8,weapon:'blade',skillMasteryLevels:{lunge:30},...(invalid!==undefined?{rewardSave:invalid}:{})};
  const s=new CoopSession({uid:'h',host:'h',players:['h','g'],profile,config:{stageId:'S2',threat:1,seed:1}});
  s.rt('g',{t:'profile',profile});
  if(s.world){for(const p of s.world.entities)assert.notEqual(p.lunge20,true);const h=s.world.entities[0];s.world.round.pending=[];s.update(34,{...emptyInput(),skillEdge:true});assert.equal(h.act?.id,'lunge');assert.notEqual(h.act?.lunge20,true);}
  else assert.equal(s.phase,'prepare');
 }
});
test('codec requires both markers and exact phase/elapsed/left/total relationships at every boundary',()=>{
 const {w}=fixture();for(let i=0;i<30;i++){
  step(w,{p:{...emptyInput(),skillEdge:i===0}});const good=encodeSnapshot(w);assert.ok(decodeSnapshot(good,'p'));
  if(!good.entities[0].act)continue;
  for(const mutate of [e=>delete e.act.lunge20,e=>delete e.lunge20,e=>e.act.elapsed++,e=>e.act.left++,e=>e.act.total++,e=>e.act.phase='windup']){
   const packet=structuredClone(good);const before=JSON.stringify(packet);mutate(packet.entities[0]);if(JSON.stringify(packet)!==before)assert.equal(decodeSnapshot(packet,'p'),null);
  }
 }
});
test('completed actor static cue matches actual contacts at normal and one-tick segments, including reduced motion',()=>{
 for(const speed of [0,6])for(const reduced of [false,true]){
  const {w,p}=fixture(speed),vfx=new SkillVfx(Graphics,new Container());vfx.requestSkill=()=>null;let contacts=0;
  for(let i=0;i<30;i++){
   const x=p.x;step(w,{p:{...emptyInput(),aimX:1,skillEdge:i===0}});if(!p.act)continue;
   // Explicit extreme timeline fixture: one tick per segment, not a new speed buff.
   if(i===0 && speed===6)p.act.phaseTicks.active=5;
   vfx.actor(p,w.tick,reduced);const frame=lungeFrame(p.act),moved=p.x>x;
   assert.equal(frame.segment!==0,moved);if(moved)contacts++;
   const slot=vfx.actors.find(s=>s.id===p.id);assert.ok(slot);
   const afterWindup=p.act.elapsed>p.act.phaseTicks.windup+p.act.phaseTicks.lock;
   if(afterWindup)assert.equal(slot.node.visible,moved,'renderer must show completed segment even first recovery tick');
   if(p.act.phase==='active')assert.ok([0,1,2].includes(nextLungeFrame(p.act).segment));
  }
  assert.equal(contacts,speed===6?2:7);
 }
});
import {shieldDamage} from '../js/sim/movement.js';
function pvp({damage=53,shield=false,slow=false,invuln=false,hold=null}={}){
 const {w,p}=fixture();p.dmgMult.blade=damage/52;if(slow)p.armorWeight=1000;
 const q=addPlayer(w,{pid:'q',x:400,y:400,mods:{maxHp:10000,mpRegen:0,...(shield?{offhand:'shield',shieldModel:{v:1,type:'buckler'}}:{})}});q.team=1;q.r=1;if(invuln)q.hurtInvuln=100;
 const hits=[];let impulse=0;for(let i=0;i<100;i++){
  const frame=p.act?.phase==='active'?nextLungeFrame(p.act):{distance:0};q.x=p.x+frame.distance+20;q.y=p.y;q.kx=q.ky=0;
  const es=step(w,{p:{...emptyInput(),aimX:1,skillEdge:i===0},q:{...emptyInput(),aimX:-1,dodgeHeld:hold ? hold(p.act) : shield}});
  for(const e of es)if(e.type==='hit'&&e.ability==='lunge'&&e.dst===q.id){hits.push(e);impulse+=Math.hypot(q.kx,q.ky);}
 }
 return {hits,impulse,q,p};
}
test('evolved PvP preserves hurtInvuln: normal second contact blocked, existing protected target untouched',()=>{
 const normal=pvp();assert.equal(normal.hits.length,1);const B=Math.round(53*(normal.q.guard??1));assert.equal(normal.hits[0].dmg,Math.floor(B/2));assert.equal(normal.q.hp,10000-Math.floor(B/2));
 assert.ok(Math.abs(normal.impulse-130/30*2.2*.82)<1e-9);
 const protectedTarget=pvp({invuln:true});assert.equal(protectedTarget.hits.length,0);assert.equal(protectedTarget.q.hp,10000);assert.equal(protectedTarget.impulse,0);
 const slow=pvp({slow:true});assert.equal(slow.hits.length,2);assert.equal(slow.hits.reduce((n,e)=>n+e.dmg,0),Math.round(53*(slow.q.guard??1)));assert.ok(Math.abs(slow.impulse-260/30*2.2*.82)<1e-9);
});
test('same target held shield split rounds once, never exceeds defended cast budget even after iframe expires',()=>{
 for(const damage of [1,2,3,5,7,11,53,79]){
  const {hits,q}=pvp({damage,shield:true,slow:true});assert.equal(hits.length,2);
  const total=hits.reduce((n,e)=>n+e.dmg,0),budget=shieldDamage(Math.max(1,Math.round(damage*(q.guard??1))),{v:1,type:'buckler'});
  assert.equal(total,budget,'shield rounding budget '+damage);assert.equal(q.hp,10000-budget);
 }
});
test('newly held shield protects the second contact without raising frozen cast total',()=>{
 // Hold/release during the pause: existing ordered player stepping must stay intact.
 const second=a=>a?.phase==='active' && nextLungeFrame(a).segment!==1;
 const entering=pvp({shield:true,slow:true,hold:second});
 assert.equal(entering.hits.length,2);assert.equal(entering.hits[0].dmg,21);assert.equal(entering.hits[1].dmg,10);
 const leaving=pvp({shield:true,slow:true,hold:a=>!second(a)});
 assert.equal(leaving.hits.length,2);assert.equal(leaving.hits.reduce((n,e)=>n+e.dmg,0),19);
});

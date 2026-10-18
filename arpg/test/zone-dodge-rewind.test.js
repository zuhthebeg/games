import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,addPlayer,step,emptyInput} from '../js/sim/world.js';
import {enableGuestDodgeLag,recordGuestHit,rewindGuestDodge} from '../js/sim/dodge-lag.js';
import {enableMultiplayerDodge} from '../js/sim/dodge-policy.js';
function run(id,dodgeAt=null,viewTick=null) {
 const w=createWorld({seed:123});
 addPlayer(w,{pid:'caster',weapon:id==='rain_arrow'?'bow':'focus',x:300,y:400,mods:{skills:[id],mpRegen:0}});
 const p=addPlayer(w,{pid:'guest',weapon:'bow',x:500,y:400,mods:{maxHp:1000,mpRegen:0}});p.team=3;
 enableMultiplayerDodge(w);enableGuestDodgeLag(w,'guest');
 const events=[];
 for(let i=0;i<50;i++) {
  const inp={caster:{...emptyInput(),skillEdge:i===0,aimX:200,aimY:0}};
  if(i===dodgeAt)inp.guest={...emptyInput(),dodgeEdge:true,viewTick,my:1};
  events.push(...step(w,inp).map(e=>({...e,tick:i})));
  if(dodgeAt!==null && i>=dodgeAt)break;
  if(dodgeAt===null && events.some(e=>e.type==='hit'&&e.dst===p.id))break;
 }
 return {hp:p.hp,events};
}
for(const id of ['meteor','firewall','rain_arrow'])test(`${id}: same timestamp guest dodge refunds on-time contact despite three tick arrival delay`,()=>{
 const first=run(id),tick=first.events.find(e=>e.type==='hit').tick;
 const ontime=run(id,tick,tick),late=run(id,tick+3,tick);
 assert.equal(ontime.hp,1000);assert.equal(late.hp,1000);
 assert.ok(late.events.some(e=>e.type==='dodgeRewind'));assert.ok(late.events.some(e=>e.type==='perfectDodge'));
});

test('ordinary poison and burn damage remains outside rewind history',()=>{
 for(const abilityId of ['poison','burn']){
 const w=createWorld({seed:1}),p=addPlayer(w,{pid:'guest',weapon:'bow',mods:{maxHp:1000}});enableMultiplayerDodge(w);enableGuestDodgeLag(w,'guest');p.hp=900;
 recordGuestHit(w,p,{periodic:true,abilityId,srcId:99,srcKind:'monster',def:{}},100,0,0);
 w.tick=3;rewindGuestDodge(w,p,{...emptyInput(),dodgeEdge:true,viewTick:0},()=>{throw Error('DoT cannot award perfect dodge');});assert.equal(p.hp,900);
 }
});

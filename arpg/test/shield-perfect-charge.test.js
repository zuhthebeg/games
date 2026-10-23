import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,addPlayer,spawnMonster,step,emptyInput} from '../js/sim/world.js';
import {ABILITIES} from '../js/content/combat.js';
import {BALANCE} from '../js/content/balance.js';
import {ticks} from '../js/sim/core.js';

const fixture=(monsterX=700)=>{const w=createWorld(),p=addPlayer(w,{pid:'p',x:500,y:400,mods:{offhand:'shield',maxHp:10000,mpRegen:0}}),m=spawnMonster(w,'ghoul',monsterX,400,{hpMult:100});m.spawnLeft=0;m.thinkLeft=100000;m.frozenUntil=100000;return {w,p,m};};
const hold=(extra={})=>({...emptyInput(),dodgeHeld:true,aimX:1,...extra});
function incoming(w,p,m){w.projectiles.push({id:w.nextId++,ownerId:m.id,ownerKind:'monster',ownerType:m.type,team:m.team,abilityId:'sling_stone',def:{...ABILITIES.sling_stone,damage:100,knockback:0},x:550,y:400,vx:(p.x-550)*30,vy:0,r:3,travelled:0,range:500,pierce:0,hit:[],dmgMult:1,poiseMult:1});return step(w,{p:hold()});}

test('shield perfect guard window is wider than the 150ms dodge window and still closes',()=>{
  const wide=ticks(BALANCE.shield.perfectMs);
  assert.ok(wide>ticks(150));
  for(const[delay,perfect]of[[ticks(150)+2,true],[wide-1,true],[wide+3,false]]){
    const{w,p,m}=fixture();step(w,{p:hold({dodgeEdge:true})});
    for(let i=0;i<delay-1;i++)step(w,{p:hold()});
    const hp=p.hp,events=incoming(w,p,m);
    assert.equal(events.some(e=>e.type==='perfectDodge'),perfect,'delay '+delay);
    if(perfect)assert.equal(p.hp,hp);else assert.ok(hp-p.hp>0);
  }
});

test('perfect guard counter is a long charge that reaches a distant attacker and hits hard',()=>{
  const{w,p,m}=fixture(700);step(w,{p:hold({dodgeEdge:true})});
  const events=incoming(w,p,m),x0=p.x;
  for(let i=0;i<30;i++)events.push(...step(w,{p:hold()}));
  assert.ok(p.x-x0>120,'charged '+(p.x-x0));
  assert.ok(p.x<=m.x-p.r-m.r+.01,'stops at contact');
  const hit=events.find(e=>e.type==='hit'&&e.src===p.id&&e.dst===m.id);
  assert.ok(hit&&hit.dmg>=40,'counter damage '+hit?.dmg);
});

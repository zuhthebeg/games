import test from 'node:test';
import assert from 'node:assert/strict';
import {CoopSession} from '../js/net/session.js';
import {InputSender} from '../js/net/protocol.js';
import {spawnMonster,emptyInput} from '../js/sim/world.js';
import {ABILITIES} from '../js/content/combat.js';

// Real session + real jitter queue: newest held can precede its accepted press.
function contactBeforeEdge(mode, edge = true, status = false) {
  const profiles = {host:{combatVersion:8,weapon:'blade',level:1,mods:{}},
    guest:{combatVersion:8,weapon:'blade',level:1,mods:{offhand:'shield',mpRegen:0}}};
  const config = {stageId:'S2',seed:1,threat:1}, events = [];
  const session = new CoopSession({uid:'host',host:'host',players:['host','guest'],
    profile:profiles.host,config,onFrame:(_w,e)=>events.push(...e)});
  session.begin({profiles,config,seed:1});
  const w = session.world, sender = new InputSender(), queue = session.latches.guest;
  w.entities = w.entities.filter(e=>e.kind==='player');
  w.round.pending=[];w.round.goal='timer';w.round.timerTicks=100000;
  const p=w.entities.find(e=>e.pid==='guest');p.x=500;p.y=400;
  w.entities.find(e=>e.pid==='host').x=100;
  const m=spawnMonster(w,'ghoul',620,400,{hpMult:100});m.spawnLeft=0;m.frozenUntil=10000;
  if (mode !== 'priming') {
    session.rt('guest',sender.packet(emptyInput()));
    session.rt('guest',sender.packet(emptyInput()));
    session.update(34,emptyInput());
    assert.equal(queue.primed,true);
    if (mode === 'starved') {
      session.update(34,emptyInput());session.update(34,emptyInput());
      assert.equal(queue.primed,false);assert.equal(queue.queue.length,0);
    }
  }
  // Arrive just before a sim boundary, too young to prime an empty queue.
  session.update(32-session.tickLeft,emptyInput());
  const viewTick=w.tick, hp=p.hp;
  session.rt('guest',sender.packet({...emptyInput(),dodgeHeld:true,dodgeEdge:edge,aimX:1,viewTick}));
  w.projectiles.push({id:w.nextId++,ownerId:m.id,ownerKind:'monster',team:m.team,abilityId:'sling_stone',
    def:{...ABILITIES.sling_stone,damage:100,knockback:status?160:0,
      ...(status?{poison:{durationMs:3000,intervalMs:1000,damage:2}}:{})},
    x:550,y:400,vx:-1500,vy:0,r:3,travelled:0,range:500,pierce:0,hit:[],dmgMult:1,poiseMult:1});
  session.update(2,emptyInput());
  assert.equal(hp-p.hp,24,'held bypass initially applies exactly ordinary ×0.3');
  assert.equal(events.filter(e=>e.type==='perfectDodge').length,0);
  assert.equal(p.dodge.startedTick,-9999,'edge has not been accepted yet');
  if (status) {assert.ok(p.poison);assert.notEqual(p.kx,0);}
  session.update(34,emptyInput());
  return {session,w,p,events,hp,viewTick,queue};
}
for (const mode of ['priming','primed','starved']) {
  test(`CoopSession ${mode}: delayed accepted perfect edge refunds only applied block damage and earns one real bash`,()=>{
    const {session,p,events,hp,viewTick,queue}=contactBeforeEdge(mode);
    assert.equal(hp-p.hp,0);
    assert.equal(p.dodge.startedTick,viewTick,'historical edge timestamp survives queue');
    const rewind=events.filter(e=>e.type==='dodgeRewind');
    assert.equal(rewind.length,1);assert.equal(rewind[0].heal,24);
    assert.equal(rewind[0].hitTick,viewTick);assert.equal(rewind[0].dodgeTick,viewTick);
    for(let i=0;i<20;i++)session.update(34,emptyInput());
    assert.equal(hp-p.hp,0);assert.equal(p.dodge.iframeLeft,0);
    assert.equal(events.filter(e=>e.type==='perfectDodge'&&e.id===p.id).length,1);
    assert.equal(events.filter(e=>e.type==='act'&&e.ability==='shield_bash'&&e.id===p.id).length,1);
    assert.equal(events.filter(e=>e.type==='hit'&&e.src===p.id).length,1);
    assert.ok(p.x>500,'authoritative bash actually rushes');
    assert.ok(queue.queue.length<=30);
  });
  test(`CoopSession ${mode}: no press edge leaves ordinary block at ×0.3, no perfect or bash`,()=>{
    const {session,p,events,hp}=contactBeforeEdge(mode,false);
    for(let i=0;i<20;i++)session.update(34,emptyInput());
    assert.equal(hp-p.hp,24);assert.equal(p.x,500);
    assert.equal(events.filter(e=>e.type==='perfectDodge'||e.type==='dodgeRewind'||e.type==='act'&&e.ability==='shield_bash').length,0);
  });
  test(`CoopSession ${mode}: earned late perfect undoes blocked contact knock, displacement, poison and hurt iframe`,()=>{
    const {p,hp}=contactBeforeEdge(mode,true,true);
    assert.equal(p.hp,hp);assert.equal(p.kx,0);assert.equal(p.ky,0);
    assert.equal(p.x,500);assert.equal(p.poison,null);assert.equal(p.hurtInvuln,0);
  });
}

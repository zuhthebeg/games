import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, startStage, step, emptyInput } from '../js/sim/world.js';
import { trackMastery, masteryLevel, validMastery } from '../js/meta/skill-mastery.js';
import { createSave, SaveStore, validateSave } from '../js/meta/save.js';
import { createTracker, trackRound, settleRound } from '../js/meta/run.js';
import { CoopSession } from '../js/net/session.js';
import { createMemoryTransport } from '../js/net/loopback.js';

const ability = 'healing_light';
const fresh = () => createSave({ name:'healer', weapon:'focus', answers:[0,0,0,0,0], createdAt:1 });
const fixture = () => {
  const world = createWorld();
  const p = addPlayer(world, { pid:'caster', weapon:'focus', x:500, y:400, mods:{ skill:ability, mpRegen:0 } });
  // Pure unit fixture: no encounter enemies; actual unmodified step/ability authority.
  startStage(world,'S1');
  world.round.pending = [];
  return { world, p };
};
const cast = (world, pid='caster') => {
  const events = [];
  for (let i=0; i<80; i++) events.push(...step(world, { [pid]:{ ...emptyInput(), skillEdge:i===0 } }));
  return events;
};
const count = tracker => tracker.skillMastery?.[ability] || 0;
const act = () => ({ type:'act', id:1, ability });
const heal = (extra={}) => ({ type:'heal', src:1, dst:2, pid:'recipient', ability, heal:1, ...extra });
const journalWorld = { round:{stageId:'S1'}, entities:[{id:1,kind:'player',pid:'caster'},{id:2,kind:'player',pid:'recipient'}] };

test('actual positive self-heal cast earns one mastery (regression)', () => {
  const {world,p} = fixture(); p.hp=10;
  const events=cast(world), tracker={};
  assert.equal(events.filter(e=>e.type==='act' && e.ability===ability).length,1);
  assert.equal(events.filter(e=>e.type==='heal').length,1);
  assert.equal(p.hp,40); assert.equal(p.mp,72);
  trackMastery(tracker,events,world,'caster');
  assert.equal(count(tracker),1);
});

test('actual multi-target heal credits source only once across split ticks, unrelated acts and next cast', () => {
  const {world,p}=fixture(); p.hp=10;
  const ally=addPlayer(world,{pid:'recipient',x:550,y:400}); ally.hp=20;
  const ally2=addPlayer(world,{pid:'recipient2',x:500,y:450}); ally2.hp=30;
  const events=cast(world), t={}, dst={}, heals=events.filter(e=>e.type==='heal');
  assert.equal(heals.length,3); assert.equal(heals[1].pid,'recipient');
  trackMastery(t,events.filter(e=>e.type!=='heal'),world,'caster'); assert.equal(count(t),0);
  trackMastery(t,[heals[0]],world,'caster');
  trackMastery(t,[{type:'act',id:p.id,ability:'ember_bolt'},...heals.slice(1),...heals],world,'caster');
  trackMastery(dst,events,world,'recipient'); assert.equal(count(dst),0); assert.equal(count(t),1);
  while(p.cds[ability]>0) step(world);
  trackMastery(t,cast(world),world,'caster'); assert.equal(count(t),2);
  const other=fixture(), recipient=addPlayer(other.world,{pid:'recipient',x:550,y:400}); recipient.hp=20;
  const allyOnly=cast(other.world), sourceTracker={}, recipientTracker={};
  assert.deepEqual(allyOnly.filter(e=>e.type==='heal').map(e=>e.dst),[recipient.id]);
  trackMastery(sourceTracker,allyOnly,other.world,'caster'); trackMastery(recipientTracker,allyOnly,other.world,'recipient');
  assert.equal(count(sourceTracker),1); assert.equal(count(recipientTracker),0);
});

test('full HP, insufficient MP, cooldown, canceled cast and actual potion produce no heal mastery', () => {
  for (const mode of ['full','mp','cooldown','cancel','potion']) {
    const {world,p}=fixture(); if(mode!=='full') p.hp=10;
    if(mode==='mp') p.mp=27;
    if(mode==='cooldown') p.cds[ability]=100;
    let events;
    if(mode==='potion') events=step(world,{caster:{...emptyInput(),potionEdge:true}});
    else if(mode==='cancel') {
      events=step(world,{caster:{...emptyInput(),skillEdge:true}});
      events.push(...step(world,{caster:{...emptyInput(),dodgeEdge:true}}));
      for(let i=0;i<80;i++) events.push(...step(world));
      assert.ok(events.some(e=>e.type==='actCancel'));
    } else events=cast(world);
    assert.equal(events.some(e=>e.type==='heal'),false,mode);
    if(['mp','cooldown'].includes(mode)) assert.equal(events.some(e=>e.type==='act'),false,mode);
    if(mode==='full') assert.ok(events.some(e=>e.type==='healCast'));
    if(mode==='potion') assert.ok(events.some(e=>e.type==='potion'));
    const t={}; trackMastery(t,events,world,'caster'); assert.equal(count(t),0,mode);
  }
});

test('heal predicate rejects invalid amounts, wrong caster/ability, potions and no outstanding act', () => {
  for(const event of [heal({heal:NaN}),heal({heal:Infinity}),heal({heal:-1}),heal({heal:0}),heal({heal:'1'}),
    heal({src:2}),heal({masteryPid:'recipient'}),heal({ability:'unknown'}),heal({ability:'ember_bolt'}),
    heal({type:'potion'}),{type:'healCast',id:1,ability}]) {
    const t={}; trackMastery(t,[act(),event],journalWorld,'caster'); assert.deepEqual(t.skillMastery,{});
  }
  const t={}; trackMastery(t,[heal()],journalWorld,'caster'); assert.equal(count(t),0);
  trackMastery(t,[act(),heal()],{...journalWorld,round:{}},'caster'); assert.equal(count(t),0);
});

test('actual fractional effective healing counts once; mastery counters stay safe integers', () => {
  const {world,p}=fixture(); p.hp=p.maxHp-.25;
  const events=cast(world); assert.equal(events.find(e=>e.type==='heal').heal,.25);
  const t={}; trackMastery(t,events,world,'caster'); assert.equal(count(t),1); assert.ok(validMastery(t.skillMastery));
  assert.equal(validMastery({[ability]:.25}),false);
  assert.throws(()=>settleRound({...fresh(),skillMastery:{[ability]:Number.MAX_SAFE_INTEGER}}, {stageId:'S1',terminal:'clear',skillMastery:{[ability]:1}}),/total/);
});

test('actual guest ordered full journal preserves heal fields and deduplicates repeated snapshots', () => {
  const net=createMemoryTransport(), sessions={}, trackers={}, received={host:[],guest:[]};
  const saves={host:fresh(),guest:fresh()};
  for(const uid of ['host','guest']) {
    trackers[uid]=createTracker(1);
    const transport=net.connect(uid,(from,data)=>data.t==='action'?sessions[uid].action(data.action):sessions[uid].rt(from,data));
    sessions[uid]=new CoopSession({uid,host:'host',players:['host','guest'],config:{stageId:'S1',seed:1,threat:1},
      profile:{name:uid,level:1,weapon:'focus',mods:{skill:ability,mpRegen:0},threats:{S1:1}},...transport,
      onFrame:(world,events)=>{received[uid].push(...events);trackers[uid]=trackRound(saves[uid],trackers[uid],events,{},world,uid).tracker;}});
  }
  sessions.guest.update(34,emptyInput());
  const world=sessions.host.world, h=world.entities.find(e=>e.pid==='host'), g=world.entities.find(e=>e.pid==='guest');
  h.hp=10; g.hp=20;
  const send=sessions.host.sendRt, packets=[];
  sessions.host.sendRt=packet=>packets.push(structuredClone(packet));
  sessions.guest.update(34,{...emptyInput(),skillEdge:true});
  for(let i=0;i<40;i++) sessions.host.update(34,emptyInput());
  assert.equal(h.hp,40); assert.equal(g.hp,50); assert.equal(g.mp,72);
  assert.equal(count(trackers.host),0); assert.equal(count(trackers.guest),0);
  sessions.host.broadcast(); const packet=packets.at(-1);
  const rows=packet.events.filter(r=>r.event.type==='heal'); assert.equal(rows.length,2);
  for(const {event} of rows) {
    assert.equal(event.src,g.id); assert.equal(event.ability,ability); assert.equal(event.heal,30);
    assert.ok(Number.isFinite(event.hp) && Number.isFinite(event.maxHp));
  }
  sessions.guest.rt('host',packet,100); sessions.guest.rt('host',packet,100);
  sessions.guest.rt('host',{...packet,tick:packet.tick+1},134);
  assert.equal(count(trackers.guest),1); assert.equal(count(trackers.host),0);
  assert.equal(received.guest.filter(e=>e.type==='heal').length,2);
  assert.equal(sessions.guest.eventAck,packet.eventSeq);
  assert.deepEqual(received.guest.filter(e=>e.type==='heal'),rows.map(r=>r.event));
  assert.equal(sessions.guest.world,null); sessions.host.sendRt=send;
});

test('actual heal count settles on clear/return/death, persists Lv30 boundary and preserves raw old anchors', () => {
  const {world,p}=fixture(); p.hp=10;
  const tracker=trackRound(fresh(),createTracker(1),cast(world),{},world,'caster').tracker;
  assert.equal(count(tracker),1);
  for(const terminal of ['clear','return_scroll','death']) {
    const save={...fresh(),skillMastery:{[ability]:1499,ember_bolt:250}};
    const result=settleRound(save,{stageId:'S1',terminal,skillMastery:tracker.skillMastery});
    assert.equal(result.save.skillMastery[ability],1500); assert.equal(masteryLevel(1500),30);
    assert.equal(result.save.skillMastery.ember_bolt,250);
    assert.deepEqual(result.receipt.masteryRises,[{id:ability,level:30}]); assert.ok(validateSave(result.save));
    const mem=new Map(),store=new SaveStore({getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)});
    store.save(result.save); assert.equal(store.load().skillMastery[ability],1500);
    assert.equal(save.skillMastery[ability],1499);
  }
  for(const [raw,level] of [[0,1],[30,5],[100,10],[250,15],[500,20]]) {
    const result=settleRound({...fresh(),skillMastery:{[ability]:raw}},{stageId:'S1',terminal:'return_scroll'});
    assert.equal(result.save.skillMastery[ability],raw); assert.equal(masteryLevel(raw),level);
  }
});

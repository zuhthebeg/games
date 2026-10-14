import test from 'node:test';
import assert from 'node:assert/strict';
import { Graphics, Container } from '../vendor/pixi-8.22.0.min.mjs';
import { MasterySkillVfx } from '../js/render/mastery-vfx.js';
import { ABILITIES } from '../js/content/combat.js';
import { createWorld, addPlayer, startStage, spawnMonster, step, emptyInput } from '../js/sim/world.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
const freeze = o => { for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v); return Object.freeze(o); };
assert.equal(ABILITIES.heavy_cleave.name, '내려찍기');
assert.equal(ABILITIES.ground_slam.name, '대지 강타');
for (const ability of ['heavy_cleave', 'ground_slam']) for (const level of [1,5,10,15,20,25,30]) for (const guest of [false,true]) {
  test(`${ability} Lv${level} ${guest?'guest':'host'}: actual enemy-hit journal with frozen snapshots never stops presentation`, () => {
    const world = createWorld({seed:11});
    const caster = addPlayer(world, {pid:'h',weapon:'blade',x:400,y:400,mods:{skills:[ability,null,null],weaponForm:'blunt',maxMp:200}});
    startStage(world,'S2'); world.round.pending=[]; world.round.goal='timer'; world.round.timerTicks=1e6;
    const target=spawnMonster(world,'scarecrow',470,400); target.spawnLeft=0; target.thinkLeft=1e6; target.hp=target.maxHp=10000;
    const vfx = new MasterySkillVfx(Graphics,new Container());
    const profiles = {h:{skillMasteryLevels:{[ability]:level}}};
    if (!guest) vfx.setMastery('h',profiles.h.skillMasteryLevels);
    let hits=0,active=false,contact=false;
    for(let tick=0;tick<60;tick++) {
      const events=step(world,{h:{...emptyInput(),skillEdge:tick===0,aimX:1}});
      const view=freeze(guest?decodeSnapshot(encodeSnapshot(world,null,profiles),'h'):structuredClone(world));
      const before=JSON.stringify(view),simBefore=JSON.stringify(world);
      for(const event of events) {
        if(event.type==='hit'&&event.ability===ability) hits++;
        assert.doesNotThrow(()=>vfx.event(freeze(structuredClone(event)),view),`${ability} Lv${level} ${event.type}: ${JSON.stringify(event)}`);
        if(event.type==='hit'&&ability==='heavy_cleave'&&level>=10) {
          const hit=vfx.effects.find(s=>s.left>0&&s.radius===16);
          assert.ok(hit,'bounded contact glow retained');
          assert.ok(hit.node.getLocalBounds().maxX<24,'contact glow is not a full-range cone at target');
          contact=true;
        }
      }
      vfx.update(view,1,1/30,false);
      active ||= ability==='heavy_cleave'&&vfx.effects.some(s=>s.left>0&&s.radius===0);
      assert.equal(JSON.stringify(view),before); assert.equal(JSON.stringify(world),simBefore);
      for(const s of [...vfx.effects,...vfx.actors,...vfx.particles]) {
        for(const value of [s.node.x,s.node.y,s.node.scale.x,s.node.scale.y,s.node.alpha]) assert.ok(Number.isFinite(value));
      }
    }
    assert.equal(hits,1); assert.equal(caster.act,null);
    if(ability==='heavy_cleave') {assert.ok(active);if(level>=10)assert.ok(contact);}
    assert.ok(vfx.effects.every(s=>!s.node.visible&&!s.wave.visible));
  });
}

// The guest consumes the deduplicated host journal, not prediction-generated hits.
import { CoopSession } from '../js/net/session.js';
import { createMemoryTransport } from '../js/net/loopback.js';
import { trackMastery } from '../js/meta/skill-mastery.js';
for (const ability of ['heavy_cleave','ground_slam']) test(`${ability}: loopback host/guest real casts preserve per-caster Lv1~30 and one-hit mastery`,()=>{
  for(const level of [1,5,10,15,20,25,30]) {
    const sessions={},presenters={},trackers={h:{},g:{}},net=createMemoryTransport();
    for(const uid of ['h','g']) {
      presenters[uid]=new MasterySkillVfx(Graphics,new Container());
      const transport=net.connect(uid,(from,data)=>data.t==='action'?sessions[uid].action(data.action):sessions[uid].rt(from,data));
      sessions[uid]=new CoopSession({uid,host:'h',players:['h','g'],profile:{level:15,weapon:'blade',mods:{skills:[ability,null,null],weaponForm:'blunt',maxMp:200},threats:{S2:1},skillMasteryLevels:{[ability]:uid==='h'?1:level}},config:{stageId:'S2',seed:42,threat:1},...transport,onFrame:(world,events)=>{
        const view=freeze(structuredClone(world)),before=JSON.stringify(view);
        trackMastery(trackers[uid],events,view,uid);
        for(const event of events)presenters[uid].event(freeze(structuredClone(event)),view);
        presenters[uid].update(view,1,1/30,false);assert.equal(JSON.stringify(view),before);
      }});
    }
    sessions.g.update(34,emptyInput());assert.equal(sessions.h.phase,'running');
    const w=sessions.h.world;w.round.pending=[];w.round.goal='timer';w.round.timerTicks=1e6;
    for(const p of w.entities.filter(e=>e.kind==='player')){p.x=400;p.y=400;}
    const target=spawnMonster(w,'scarecrow',470,400);target.spawnLeft=0;target.thinkLeft=1e6;target.hp=target.maxHp=10000;
    for(let n=0;n<65;n++) {const input={...emptyInput(),skillEdge:n===0,aimX:1};sessions.g.update(34,input);sessions.h.update(34,input);}
    assert.equal(trackers.h.skillMastery[ability],1);assert.equal(trackers.g.skillMastery[ability],1);
    const view=sessions.g.view();assert.equal(view.entities.find(e=>e.pid==='g').skillMasteryLevels[ability],level);assert.equal(view.entities.find(e=>e.pid==='h').skillMasteryLevels[ability],1);
    assert.equal(sessions.g.world,null);assert.ok(sessions.g.eventAck>0);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,addPlayer,startStage,step,emptyInput} from '../js/sim/world.js';
import {encodeSnapshot,decodeSnapshot} from '../js/net/protocol.js';

for (const [direction,mx,my] of [['forward',1,0],['backward',-1,0],['perpendicular',0,1]]) {
  test('ember20 exact560 immutable origin through moving '+direction+' windup, pending, latejoin and impact',()=>{
    const w=createWorld({seed:8});
    const p=addPlayer(w,{pid:'p',weapon:'focus',x:300,y:400,skillMasteryLevels:{ember_bolt:20},mods:{mpRegen:0}});
    startStage(w,'S2');w.entities=[p];w.round.pending=[];w.round.goal='timer';w.round.timerTicks=10000;
    let release,impact,pendingTicks=0,latejoinTicks=0,windupMoves=0,impacts=0;
    const phases=new Set();
    for(let i=0;i<45;i++) {
      const events=step(w,{p:{...emptyInput(),skillEdge:i===0,aimX:560,mx:i?mx:0,my:i?my:0}});
      if(p.act?.ember20) {
        phases.add(p.act.phase);
        assert.equal(p.act.ox,300,'origin x tick '+w.tick);
        assert.equal(p.act.oy,400,'origin y tick '+w.tick);
        assert.deepEqual(p.act.zonePoint,{x:860,y:400});
        if(p.act.phase==='windup'&&(p.x!==300||p.y!==400))windupMoves++;
      }
      const packet=encodeSnapshot(w),decoded=decodeSnapshot(packet,'p');
      assert.ok(decoded,'normal roundtrip tick '+w.tick);
      if(p.act?.ember20) {
        assert.equal(decoded.entities[0].act.ox,300);
        assert.equal(decoded.entities[0].act.oy,400);
        assert.deepEqual(decoded.entities[0].act.zonePoint,{x:860,y:400});
      }
      for(const z of w.zones||[]) {
        pendingTicks++;
        assert.deepEqual([z.ox,z.oy,z.x,z.y],[300,400,860,400]);
        const remote=decoded.zones.find(q=>q.id===z.id);
        assert.deepEqual([remote.ox,remote.oy,remote.x,remote.y],[300,400,860,400]);
        // A late join needs only the authoritative pending zone, not a cast act.
        const detached=structuredClone(packet);detached.entities[0].act=null;
        const joined=decodeSnapshot(detached,'p');assert.ok(joined,'latejoin tick '+w.tick);
        assert.deepEqual([joined.zones[0].ox,joined.zones[0].oy,joined.zones[0].x,joined.zones[0].y],[300,400,860,400]);
        if(!p.act)latejoinTicks++;
      }
      if(events.some(e=>e.type==='zoneCast'))release=w.tick-1;
      for(const e of events.filter(e=>e.type==='explode'&&e.ability==='ember_bolt')) {
        impact=w.tick-1;impacts++;assert.deepEqual([e.x,e.y],[860,400]);
      }
    }
    assert.ok(windupMoves>0);assert.ok(latejoinTicks>0);
    assert.ok(phases.has('windup'));assert.ok(phases.has('active'));
    assert.equal(pendingTicks,12);assert.equal(impact-release,12);assert.equal(impacts,1);
    assert.ok(mx?p.x!==300:p.y!==400,'caster remains free to move');
  });
}

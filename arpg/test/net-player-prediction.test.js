import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, startStage, step, emptyInput } from '../js/sim/world.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
import { predictPlayerTick } from '../js/net/player-prediction.js';

// Differential guard: the guest's own-pawn prediction must equal the real host step,
// tick for tick, for every weapon and skill, while walking, attacking, casting,
// dodging (incl. buffered dodge during attacks) and drinking mana potions.
const LOADOUTS = [
  ['blade', ['ground_slam', 'armor_break', 'whirl'], 'blunt'],
  ['blade', ['lunge', 'whirl', 'heavy_cleave']], ['bow', ['volley', 'pierce_shot', 'blast_arrow']],
  ['focus', ['ember_bolt', 'frost_lance', 'flame_ring']], ['focus', ['healing_light', 'flame_ring', 'ember_bolt']],
];
let seed = 99; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
for (const [weapon, skills, weaponForm] of LOADOUTS) {
  test(`prediction == host step every tick: ${weapon} ${skills.join('/')}`, () => {
    const world = createWorld({ seed: 3 });
    addPlayer(world, { pid: 'g', weapon, mods: { skills, weaponForm, attackSpeedBonus: .2, weaponWeight: 11, cdMult: .9, mpRegen: 6, manaPotions: 3, maxMp: 90 } });
    startStage(world, 'S2'); world.entities = world.entities.filter(e => e.kind === 'player');
    world.round.pending = []; world.round.goal = 'timer'; world.round.timerTicks = 1e6;
    let input = emptyInput(), checked = 0;
    for (let t = 0; t < 1500; t++) {
      if (t % 9 === 0) input = { ...emptyInput(), mx: [1, -1, 0, .7][Math.floor(rnd() * 4)], my: [0, .7, -1, .4][Math.floor(rnd() * 4)],
        aimX: rnd() < .5 ? 0 : 1, aimY: rnd() < .3 ? -1 : 0, attack: rnd() < .45 };
      const tickInput = { ...input, skillEdge: rnd() < .04, skill2Edge: rnd() < .03, skill3Edge: rnd() < .03,
        dodgeEdge: rnd() < .05, manaEdge: rnd() < .01, potionEdge: rnd() < .01 };
      const view = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(world, { g: 0 }))), 'g');
      const before = view.entities[0], host = world.entities[0], hx = host.x, hy = host.y;
      const predicted = predictPlayerTick(before, tickInput, { arena: world.arena, others: view.entities.slice(1) });
      step(world, { g: tickInput });
      const ctx = JSON.stringify({ t, weapon, tickInput, act: host.act && { id: host.act.id, phase: host.act.phase, left: host.act.left } });
      // Snapshot positions are quantized to 0.01, so the prediction starts up to 0.005px off.
      assert.ok(Math.abs(predicted.x - host.x) <= .0051 && Math.abs(predicted.y - host.y) <= .0051,
        `position ${predicted.x},${predicted.y} vs host ${host.x},${host.y} (from ${hx},${hy}) ${ctx}`);
      assert.equal(predicted.act?.id ?? null, host.act?.id ?? null, ctx); assert.equal(predicted.act?.phase ?? null, host.act?.phase ?? null, ctx);
      assert.equal(predicted.act?.left ?? null, host.act?.left ?? null, ctx);
      assert.equal(predicted.dodge.dashLeft, host.dodge.dashLeft, ctx); assert.equal(predicted.dodge.cdLeft, host.dodge.cdLeft, ctx);
      assert.equal(predicted.bufferDodge, host.bufferDodge, ctx);
      assert.ok(Math.abs(predicted.mp - host.mp) < 1e-6, `mp ${predicted.mp} vs ${host.mp} ${ctx}`);
      assert.ok(Math.abs(predicted.facing - host.facing) < 1e-9, `facing ${ctx}`);
      for (const k of new Set([...Object.keys(host.cds), ...Object.keys(predicted.cds)])) assert.equal(predicted.cds[k] || 0, host.cds[k] || 0, `cd ${k} ${ctx}`);
      checked++;
    }
    assert.equal(checked, 1500);
  });
}

test('shield bash prediction matches host moving, positions and action timeline across windup/active/recovery (16000 deterministic ticks)',()=>{
  let replayed=0,movingMismatches=0;
  const phases=new Set();
  for(const multiplayerDodge of [false,true])for(const held of [false,true]) {
    const world=createWorld({seed:17,multiplayerDodge});
    const host=addPlayer(world,{pid:'g',x:500,y:400,mods:{offhand:'shield',mpRegen:0}});
    startStage(world,'S2');world.entities=world.entities.filter(e=>e.kind==='player');
    world.round.pending=[];world.round.goal='timer';world.round.timerTicks=1e6;
    let random=431;
    const next=()=>((random=(Math.imul(random,1664525)+1013904223)>>>0)/4294967296);
    for(let t=0;t<4000;t++) {
      const inp={...emptyInput(),mx:next()<.5?1:-1,my:next()<.5?.5:-.5,
        aimX:1,aimY:next()<.5?0:1,dodgeHeld:held&&t%100>5};
      // Only the host earns rewards. Replay each resulting authoritative action,
      // including one reached after walking and one reached while holding guard.
      if(t%60===0) {
        host.pendingCounter={kind:'shield',attackerId:-1,fromX:host.x+100,fromY:host.y,dodgeTick:world.tick,expiresTick:world.tick+100};
        step(world,{g:inp});continue;
      }
      const before=structuredClone(host),phase=host.act?.phase;
      if(host.act?.id==='shield_bash')phases.add(phase);
      const predicted=predictPlayerTick(before,inp,{arena:world.arena,tick:world.tick,multiplayerDodge});
      step(world,{g:inp});replayed++;
      if(predicted.moving!==host.moving)movingMismatches++;
      assert.equal(predicted.x,host.x,`x ${multiplayerDodge}/${held}/${t}`);
      assert.equal(predicted.y,host.y,`y ${multiplayerDodge}/${held}/${t}`);
      assert.equal(predicted.facing,host.facing);
      for(const k of ['id','phase','left','elapsed'])assert.equal(predicted.act?.[k],host.act?.[k],`${k} at ${t}`);
      assert.deepEqual(predicted.dodge,host.dodge);
      assert.deepEqual(predicted.shieldGuard,host.shieldGuard);
      assert.equal(predicted.mp,host.mp);
    }
  }
  assert.ok(replayed>15000);
  assert.deepEqual([...phases].sort(),['active','recovery','windup']);
  assert.equal(movingMismatches,0,`${movingMismatches} moving mismatches in ${replayed} replayed ticks`);
});

import { comboDef } from '../js/sim/basic-combo.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, spawnMonster, step, emptyInput, setLoad, getTelegraphs } from '../js/sim/world.js';
import { ticks } from '../js/sim/core.js';
import { ABILITIES, WEAPONS, PLAYER_BASE } from '../js/content/combat.js';
import { BALANCE, attackRate } from '../js/content/balance.js';
import { deriveMods, eff } from '../js/meta/stats.js';
import { buildRoundMods, currentLoad, createTracker } from '../js/meta/run.js';
import { createSave } from '../js/meta/save.js';
import { ITEMS } from '../js/meta/items.js';
const input = (o = {}) => ({ ...emptyInput(), ...o });
const run = (w, n, inputs = {}) => Array.from({ length: n }, () => step(w, inputs)).flat();
function enemy(w, x = 610, y = 400) {
  const e = spawnMonster(w, 'goblin_grunt', x, y);
  e.spawnLeft = 0; e.staggerLeft = 9999; e.hp = e.maxHp = 10000;
  return e;
}
function shot(w, owner, x, y, extra = {}) {
  const pr = { id: w.nextId++, team: owner.team, ownerId: owner.id, ownerKind: owner.kind,
    ownerType: owner.type || owner.weapon, abilityId: 'sling_stone', x, y, vx: 0, vy: 0,
    r: 8, travelled: 0, range: 560, pierce: 0, hit: [], dmgMult: 1, poiseMult: 1, ...extra };
  w.projectiles.push(pr); return pr;
}
function fixture(weapon = 'blade', mods = {}) {
  const w = createWorld({ seed: 72 });
  const p = addPlayer(w, { pid: 'a', weapon, x: 400, y: 400, mods });
  const g = enemy(w);
  return { w, p, g };
}
function perfect(f, count = 1) {
  for (let i = 0; i < count; i++) shot(f.w, f.g, 425, 400);
  return step(f.w, { a: input({ dodgeEdge: true, mx: 1 }) });
}

for (const weapon of ['blade', 'bow', 'focus']) {
  test(`${weapon}: actual dodged multi-hit schedules ONE delayed real basic counter, counter bonus/free MP`, () => {
    const f = fixture(weapon, { mpRegen: 0 });
    const first = perfect(f, 4);
    const event = first.find(e => e.type === 'perfectDodge');
    assert.equal(first.filter(e => e.type === 'perfectDodge').length, 1);
    assert.equal(event.attackerId, f.g.id); assert.equal(event.pid, 'a'); assert.equal(event.dodgeTick, 0);
    assert.equal(f.p.act, null);
    let counters = [], hits = [], firstCounterTick;
    for (let i = 0; i < 55; i++) {
      const tick = f.w.tick;
      const evs = step(f.w);
      if (evs.some(e => e.type === 'counter')) {
        firstCounterTick = tick;
        assert.equal(f.p.dodge.dashLeft, 0); assert.equal(f.p.dodge.iframeLeft, 0);
        assert.equal(f.p.x, 550, 'full 150px dodge before counter');
        assert.equal(f.p.act.id, WEAPONS[weapon].basic);
      }
      counters.push(...evs.filter(e => e.type === 'counter'));
      hits.push(...evs.filter(e => e.type === 'hit' && e.src === f.p.id));
    }
    assert.equal(firstCounterTick, ticks(PLAYER_BASE.dodge.iframeMs));
    assert.equal(counters.length, 1); assert.equal(hits.length, 1);
    assert.equal(hits[0].dst, f.g.id);
    assert.equal(hits[0].dmg, Math.round(ABILITIES[WEAPONS[weapon].basic].damage * BALANCE.counter.damage * 1.3));
    assert.equal(f.p.mp, f.p.maxMp); assert.equal(f.p.pendingCounter, null);
  });
}

test('melee actual hit in perfect window also records real attacker', () => {
  const f = fixture(); f.g.x = 460; f.g.staggerLeft = 0; f.g.thinkLeft = 0;
  step(f.w);
  while (f.g.act.phase !== 'active') step(f.w);
  const events = step(f.w, { a: input({ dodgeEdge: true, mx: 1 }) });
  assert.equal(events.find(e => e.type === 'perfectDodge')?.attackerId, f.g.id);
  assert.equal(f.p.hp, f.p.maxHp);
});

test('ordinary late iframe dodge, empty dodge, and periodic poison never counter', () => {
  const f = fixture();
  step(f.w, { a: input({ dodgeEdge: true, mx: 1 }) });
  run(f.w, 5); shot(f.w, f.g, f.p.x, f.p.y);
  const late = step(f.w);
  assert.ok(late.some(e => e.type === 'miss'));
  assert.equal(f.p.dodge.perfectPaid, false);
  assert.equal(run(f.w, 40).some(e => e.type === 'counter'), false);
  const empty = fixture(); perfect(empty, 0);
  assert.equal(run(empty.w, 40).some(e => e.type === 'counter'), false);
  const poison = fixture();
  poison.p.poison = { left: 10, next: 1, interval: 30, hit: { periodic: true,
    srcId: poison.g.id, srcType: poison.g.type, abilityId: 'spider_puddle',
    def: { damage: 2 }, mult: 1, fromX: 610, fromY: 400 } };
  const ev = step(poison.w, { a: input({ dodgeEdge: true, mx: 1 }) });
  assert.ok(ev.some(e => e.type === 'hit')); assert.equal(poison.p.pendingCounter, null);
  assert.equal(run(poison.w, 30).some(e => e.type === 'counter'), false);
});

for (const state of ['dead', 'far', 'removed', 'playerDeath', 'terminal', 'channel']) {
  test(`counter canceled when ${state}; never selects nearby substitute or teleports`, () => {
    const f = fixture(); perfect(f);
    enemy(f.w, 590, 430);
    if (state === 'dead') f.g.dead = true;
    if (state === 'far') f.g.x = 1300;
    if (state === 'removed') f.w.entities = f.w.entities.filter(e => e !== f.g);
    if (state === 'playerDeath') { f.p.dead = true; f.p.terminal = 'death'; }
    if (state === 'terminal') f.p.terminal = 'clear';
    if (state === 'channel') f.p.channel = 30;
    const ev = run(f.w, 40);
    assert.equal(ev.some(e => e.type === 'counter'), false);
    assert.equal(f.p.pendingCounter, null);
    assert.ok(f.p.x <= 550);
  });
}

for (const weapon of ['blade', 'bow', 'focus']) {
  test(`${weapon}: invalid original source consumes pending and permits held basic without counter`, () => {
    for (const state of ['dead', 'far', 'removed']) {
      const f = fixture(weapon); perfect(f);
      if (state === 'dead') f.g.dead = true;
      if (state === 'far') f.g.x = 1300;
      if (state === 'removed') f.w.entities = f.w.entities.filter(e => e !== f.g);
      run(f.w, ticks(PLAYER_BASE.dodge.iframeMs) - 1);
      const events = step(f.w, { a: input({ attack: true, aimX: -1 }) });
      assert.equal(events.some(e => e.type === 'counter'), false);
      assert.equal(f.p.pendingCounter, null);
      assert.equal(f.p.act.id, WEAPONS[weapon].basic);
      assert.equal(f.p.act.counter, undefined);
      assert.equal(f.p.act.facing, Math.PI);
      assert.equal(events.filter(e => e.type === 'act' && e.id === f.p.id).length, 1);
    }
  });
}

test('projectile source wins over nearer decoy; allied body still blocks counter shot', () => {
  const f = fixture('bow'); perfect(f);
  const ally = addPlayer(f.w, { pid: 'b', x: 585, y: 400 });
  enemy(f.w, 550, 490);
  const events = run(f.w, 40);
  assert.equal(events.find(e => e.type === 'counter').attackerId, f.g.id);
  assert.ok(events.some(e => e.type === 'projectileBlocked' && e.blockerId === ally.id));
  assert.equal(events.some(e => e.type === 'hit' && e.src === f.p.id), false);
  assert.equal(ally.hp, ally.maxHp);
});

for (const weapon of ['blade', 'bow', 'focus']) {
  for (const iframeBonusMs of [0, 42]) {
    test(`${weapon}: held basic throughout perfect dodge yields one counter (iframe bonus ${iframeBonusMs})`, () => {
      const f = fixture(weapon, { iframeBonusMs, mpRegen: 0 });
      shot(f.w, f.g, 425, 400);
      const held = { a: input({ attack: true, aimX: -1 }) };
      const events = step(f.w, { a: input({ dodgeEdge: true, mx: 1, attack: true, aimX: -1 }) });
      let counterTick;
      while (counterTick === undefined && f.w.tick < 40) {
        const tick = f.w.tick, ev = step(f.w, held);
        events.push(...ev);
        if (ev.some(e => e.type === 'counter')) {
          counterTick = tick;
          assert.equal(f.p.act.id, WEAPONS[weapon].basic);
          assert.equal(f.p.act.counter, true);
          assert.equal(f.p.act.facing, 0, 'original source wins over held aim');
          assert.equal(f.p.dodge.dashLeft, 0); assert.equal(f.p.dodge.iframeLeft, 0);
        }
      }
      assert.equal(counterTick, ticks(PLAYER_BASE.dodge.iframeMs + iframeBonusMs));
      // Keep holding for the entire counter: no extra basic may start in parallel.
      while (f.p.act) events.push(...step(f.w, held));
      assert.equal(events.filter(e => e.type === 'act' && e.id === f.p.id).length, 1);
      events.push(...run(f.w, 20)); // release, allowing the real projectile to finish
      assert.equal(events.filter(e => e.type === 'counter').length, 1);
      const hits = events.filter(e => e.type === 'hit' && e.src === f.p.id);
      assert.equal(hits.length, 1); assert.equal(hits[0].dst, f.g.id);
      assert.equal(f.p.pendingCounter, null); assert.equal(f.p.mp, f.p.maxMp);
      const resumed = step(f.w, held);
      assert.equal(resumed.filter(e => e.type === 'act' && e.id === f.p.id).length, 1);
      assert.equal(f.p.act.counter, undefined, 'held basic resumes normally after counter');
    });
  }
  test(`${weapon}: explicit skill edge wins over ready counter and held basic`, () => {
    const f = fixture(weapon); perfect(f);
    run(f.w, ticks(PLAYER_BASE.dodge.iframeMs) - 1);
    const events = step(f.w, { a: input({ attack: true, skillEdge: true, aimX: -1 }) });
    assert.equal(events.some(e => e.type === 'counter'), false);
    assert.equal(f.p.act.id, WEAPONS[weapon].skill);
    assert.equal(f.p.act.facing, Math.PI);
    assert.equal(events.filter(e => e.type === 'act' && e.id === f.p.id).length, 1);
  });
}

test('pending counter never interrupts a running act; deadline still expires under held basic', () => {
  const f = fixture('focus'); perfect(f); run(f.w, 5);
  step(f.w, { a: input({ skillEdge: true, aimX: -1 }) });
  const act = f.p.act;
  const events = run(f.w, 12, { a: input({ attack: true }) });
  assert.equal(f.p.act, act);
  assert.equal(events.some(e => e.type === 'counter' || e.type === 'actCancel'), false);
  assert.equal(f.p.pendingCounter, null);
});

test('return channel and new dodge clear pending; standard counter windup is dodge-cancelable', () => {
  const scroll = fixture(); perfect(scroll); run(scroll.w, 5);
  step(scroll.w, { a: input({ scrollEdge: true, attack: true }) });
  assert.ok(scroll.p.channel > 0); assert.equal(scroll.p.pendingCounter, null);
  const again = fixture(); perfect(again); run(again.w, 5); again.p.dodge.cdLeft = 0;
  step(again.w, { a: input({ dodgeEdge: true, mx: -1, attack: true }) });
  assert.equal(again.p.pendingCounter, null); assert.equal(again.p.act, null);
  const cancel = fixture(); perfect(cancel); run(cancel.w, 7); assert.ok(cancel.p.act.counter);
  cancel.p.dodge.cdLeft = 0;
  const ev = step(cancel.w, { a: input({ dodgeEdge: true, mx: -1, attack: true }) });
  assert.ok(ev.some(e => e.type === 'actCancel')); assert.equal(cancel.p.act, null);
});

test('co-op counters maintain separate pid and original attacker; counter cannot trigger counter', () => {
  const f = fixture('bow'); const b = addPlayer(f.w, { pid: 'b', weapon: 'focus', x: 400, y: 600 });
  const other = enemy(f.w, 610, 600);
  shot(f.w, f.g, 425, 400); shot(f.w, other, 425, 600);
  step(f.w, { a: input({ dodgeEdge: true, mx: 1 }), b: input({ dodgeEdge: true, mx: 1 }) });
  const counters = run(f.w, 40).filter(e => e.type === 'counter');
  assert.deepEqual(counters.map(e => [e.pid, e.attackerId]), [['a', f.g.id], ['b', other.id]]);
  assert.equal(b.pendingCounter, null);
  const noChain = fixture(); shot(noChain.w, noChain.g, 425, 400, { counter: true });
  const ev = step(noChain.w, { a: input({ dodgeEdge: true, mx: 1 }) });
  assert.ok(ev.some(e => e.type === 'miss')); assert.equal(noChain.p.pendingCounter, null);
});

test('attackRate monotonic DEX/weight/load, finite modest caps, starter blade baseline', () => {
  assert.equal(attackRate(0, 8, .5), 1);
  assert.equal(attackRate(999, 0, 0), 1.2);
  for (let agi = 5; agi < 100; agi++) {
    assert.ok(attackRate(.02 * eff(agi + 1), 12, 1) >= attackRate(.02 * eff(agi), 12, 1));
  }
  for (let weight = 0; weight < 35; weight++) {
    for (let load = 0; load < 1.6; load += .1) {
      const rate = attackRate(.1, weight, load);
      assert.ok(rate >= .7 && rate <= 1.2);
      assert.ok(attackRate(.1, weight + 1, load) <= rate);
      assert.ok(attackRate(.1, weight, load + .1) <= rate + 1e-12);
    }
  }
  assert.ok(attackRate(0, 18, 1.2) < attackRate(0, 8, .3));
});

test('equipped weight and agi pass through meta without schema/stat changes, current carrying ratio used', () => {
  const save = createSave({ name: 'test', answers: [0, 0, 0, 0, 0], weapon: 'blade', createdAt: 1 });
  save.stats.agi = 34; // old 9 on the 10-12 scale (10 + 6 x 4)
  const mods = buildRoundMods(save);
  assert.equal(mods.attackSpeedBonus, .08);
  assert.equal(mods.weaponWeight, ITEMS.training_sword.weight);
  const f = fixture('blade', mods);
  const tracker = createTracker(1); tracker.tempLoot.stacks.hide = 150;
  setLoad(f.w, 'a', currentLoad(save, tracker).ratio);
  step(f.w, { a: input({ attack: true }) });
  assert.equal(f.p.act.rate, attackRate(.08, 8, currentLoad(save, tracker).ratio));
  save.items.find(i => i.uid === save.equipped.weapon).id = 'chief_maul';
  assert.equal(deriveMods(save).weaponWeight, 18);
});

for (const weapon of ['blade', 'bow', 'focus']) {
  for (const skill of [false, true]) {
    test(`${weapon} ${skill ? 'skill' : 'basic'} phases use exact frozen rate/ticks; hit and projectile speed unchanged`, () => {
      const counts = [];
      for (const bonus of [0, .2]) {
        const f = fixture(weapon, { attackSpeedBonus: bonus, weaponWeight: 8, mpRegen: 0 });
        f.g.x = 1300; const x = f.p.x;
        const id = WEAPONS[weapon][skill ? 'skill' : 'basic']; const def = ABILITIES[id];
        step(f.w, { a: input({ attack: !skill, skillEdge: skill, aimX: 1 }) });
        const snapshot = structuredClone(f.p.act.phaseTicks);
        const rate = attackRate(bonus, 8, 0);
        assert.equal(f.p.act.rate, rate);
        for (const phase of ['windup', 'lock', 'active', 'recovery']) {
          const ms = def[`${phase}Ms`] || 0;
          assert.equal(snapshot[phase], ms || phase === 'active' ? Math.max(1, ticks(ms / rate)) : 0);
        }
        setLoad(f.w, 'a', 1.2); f.p.weaponWeight = 24; f.p.attackSpeedBonus = 0;
        let duration = 1, projectile;
        while (f.p.act) {
          assert.deepEqual(f.p.act.phaseTicks, snapshot);
          step(f.w); duration++;
          projectile ||= f.w.projectiles[0];
        }
        assert.equal(duration, Object.values(snapshot).reduce((a, b) => a + b, 0));
        if (def.delivery === 'dash') assert.ok(Math.abs(f.p.x - x - def.dash.distance) < 1e-9);
        if (def.delivery === 'projectile') {
          assert.ok(Math.abs(Math.hypot(projectile.vx, projectile.vy) - def.projectile.speed) < 1e-9);
          assert.equal(projectile.dmgMult, 1);
        }
        assert.equal(f.p.cds[id] || 0, ticks(def.cooldownMs));
        counts.push(duration);
      }
      assert.ok(counts[1] < counts[0]);
    });
  }
}

test('monster telegraphs/cooldowns, dodge distance/timing and potion CD independent of attack speed', () => {
  const snapshots = [];
  for (const bonus of [0, .2]) {
    const f = fixture('blade', { attackSpeedBonus: bonus }); f.g.x = 460;
    f.g.staggerLeft = 0; f.g.thinkLeft = 0;
    step(f.w); snapshots.push(getTelegraphs(f.w));
    assert.equal(f.g.act.phaseTicks.windup, ticks(ABILITIES.goblin_slash.windupMs));
    assert.equal(f.g.act.phaseTicks.lock, ticks(ABILITIES.goblin_slash.lockMs));
    f.g.dead = true;
    const x = f.p.x;
    step(f.w, { a: input({ dodgeEdge: true, mx: -1 }) });
    assert.equal(f.p.dodge.cdLeft, ticks(PLAYER_BASE.dodge.cooldownMs));
    run(f.w, ticks(PLAYER_BASE.dodge.dashMs) - 1);
    assert.equal(f.p.x, x - PLAYER_BASE.dodge.distance);
    f.p.hp = 50; step(f.w, { a: input({ potionEdge: true }) });
    assert.equal(f.p.potionCd, ticks(PLAYER_BASE.potion.cooldownMs));
  }
  assert.deepEqual(snapshots[0], snapshots[1]);
});

test('same seed/input timeline produces identical counter, projectiles and timing state', () => {
  function replay() {
    const f = fixture('focus', { attackSpeedBonus: .15, weaponWeight: 10 });
    const events = perfect(f, 3);
    for (let i = 0; i < 180; i++) {
      if (i === 12) setLoad(f.w, 'a', 1.1);
      events.push(...step(f.w, { a: input({ attack: i > 60, skillEdge: i === 130, aimX: 1 }) }));
    }
    return { world: f.w, events };
  }
  assert.deepEqual(replay(), replay());
});

test('AGI iframe extension finishes before counter; overlapping later contacts still pay once', () => {
  const f = fixture('blade', { iframeBonusMs: 42 });
  const evs = perfect(f);
  for (let i = 0; i < 30; i++) {
    if (i < 4) shot(f.w, f.g, f.p.x + 25, f.p.y);
    const tick = f.w.tick, ev = step(f.w);
    if (ev.some(e => e.type === 'counter')) {
      assert.equal(tick, ticks(PLAYER_BASE.dodge.iframeMs + 42));
      assert.equal(f.p.dodge.iframeLeft, 0);
    }
    evs.push(...ev);
  }
  assert.equal(evs.filter(e => e.type === 'perfectDodge').length, 1);
  assert.equal(evs.filter(e => e.type === 'counter').length, 1);
});

test('unknown projectile owner is never inferred; an expired pending cannot fire', () => {
  const unknown = fixture();
  shot(unknown.w, unknown.g, 425, 400, { ownerId: 999999 });
  const ev = step(unknown.w, { a: input({ dodgeEdge: true, mx: 1 }) });
  // Orphaned hostile shot: still a perfect dodge (feedback), but no counter target is guessed.
  assert.ok(ev.some(e => e.type === 'perfectDodge')); assert.equal(unknown.p.pendingCounter, null);
  const f = fixture(); perfect(f); run(f.w, 5);
  f.p.bufferDodge = 30; // existing dodge buffer blocks counter without manufacturing a new hit
  run(f.w, 25);
  assert.equal(f.p.pendingCounter, null);
  assert.equal(run(f.w, 20).some(e => e.type === 'counter'), false);
});

test('normal damage/poise per hit unchanged by attack rate; counter poise boost only on its own act', () => {
  for (const weapon of ['blade', 'bow', 'focus']) {
    function hit(f, isCounter) {
      const evs = isCounter ? perfect(f) : [];
      if (!isCounter) f.p.x = 550;
      f.g.staggerLeft = 0; f.g.poise = f.g.maxPoise = 1000; f.g.thinkLeft = 9999;
      const def = isCounter ? ABILITIES[WEAPONS[weapon].basic] : comboDef(WEAPONS[weapon].basic, 1, f.p.weaponForm);
      for (let i = 0; i < 35; i++) {
        f.g.x = 610; f.g.y = 400;
        const before = f.g.poise;
        const ev = step(f.w, { a: input({ attack: !isCounter && i === 0, aimX: 1 }) });
        evs.push(...ev);
        const landed = ev.find(e => e.type === 'hit' && e.src === f.p.id);
        if (landed) {
          assert.equal(landed.dmg, Math.round(def.damage * (isCounter ? BALANCE.counter.damage : 1)));
          // Shapes hit before monster idle regen; projectiles sweep after monster stepping.
          const regen = def.delivery === 'shape' ? 5 : 0;
          assert.equal(f.g.poise, before - def.poise * (isCounter ? BALANCE.counter.poise : 1) + regen);
          return;
        }
      }
      assert.fail(`expected real ${weapon} hit`);
    }
    hit(fixture(weapon, { attackSpeedBonus: 0 }), false);
    hit(fixture(weapon, { attackSpeedBonus: .2 }), false);
    hit(fixture(weapon, { attackSpeedBonus: .2 }), true);
  }
});

test('monster complete phase timeline and cooldown are identical with different player attack rate', () => {
  const timelines = [];
  for (const bonus of [0, .2]) {
    const f = fixture('blade', { attackSpeedBonus: bonus, maxHp: 10000 });
    f.g.x = 460; f.g.staggerLeft = 0; f.g.thinkLeft = 0;
    step(f.w); const phases = [];
    while (f.g.act) {
      phases.push([f.g.act.phase, f.g.act.left, getTelegraphs(f.w)]);
      step(f.w);
    }
    assert.equal(f.g.cds.goblin_slash, ticks(ABILITIES.goblin_slash.cooldownMs));
    timelines.push(phases);
  }
  assert.deepEqual(timelines[0], timelines[1]);
});

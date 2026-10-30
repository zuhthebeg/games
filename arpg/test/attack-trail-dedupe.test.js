import test from 'node:test';
import assert from 'node:assert/strict';
import { Container } from '../vendor/pixi-8.22.0.min.mjs';
import { ArenaRenderer } from '../js/render/renderer.js';
import { VisualProvider } from '../js/render/visual-provider.js';
import { createWorld, addPlayer, startStage, emptyInput } from '../js/sim/world.js';
import { SnapshotBuffer, encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
import { comboDef } from '../js/sim/basic-combo.js';
import { predictPlayerTick } from '../js/net/player-prediction.js';
import { LocalPrediction } from '../js/net/prediction.js';
import { withoutCombos } from './av1-dps.mjs';

const T = 1000 / 30;

const makeRenderer = (world, reduced = false) => {
  const renderer = new ArenaRenderer({ stage: new Container(), screen: { width: 390, height: 844 } },
    new VisualProvider({ atlases: false }));
  renderer.reset(world, reduced);
  return renderer;
};

const renderAct = (renderer, world, { tick, elapsed = 1, step = 1, pid = 'local', active = true,
  phase = 'active', castTick, presentationSeq, phaseTicks } = {}) => {
  const snapshot = structuredClone(world);
  snapshot.tick = tick;
  snapshot.entities[0].pid = pid;
  snapshot.entities[0].act = active ? {
    id: 'slash', step, phase, elapsed, total: 3, left: 2, facing: 0,
    ...(castTick === undefined ? {} : { castTick }),
    ...(presentationSeq === undefined ? {} : { presentationSeq }),
    ...(phaseTicks ? { phaseTicks } : {}),
    def: comboDef('slash', step, 'sword')
  } : null;
  renderer.render(decodeSnapshot(encodeSnapshot(snapshot), pid), 1, 1 / 60);
};

function remoteBufferedFixture() {
  const world = createWorld({ seed: 20 });
  addPlayer(world, { pid: 'local', weapon: 'blade' });
  addPlayer(world, { pid: 'remote', weapon: 'blade' });
  startStage(world, 'S2');
  const buffer = new SnapshotBuffer('local', 0, { adaptive: false });
  const push = (tick, act) => {
    const snapshot = structuredClone(world);
    snapshot.tick = tick;
    snapshot.entities.find(entity => entity.pid === 'remote').act = act;
    return buffer.push(encodeSnapshot(snapshot, { local: 0 }), tick * T);
  };
  const sample = tick => buffer.sample(tick * T);
  return { world, push, sample };
}

const bufferedSlash = (step, phase, elapsed, castTick) => ({
  id: 'slash', step, phase, elapsed, left: 1, total: 3, facing: 0, castTick,
  phaseTicks: { windup: 5, lock: 0, active: 3, recovery: 8 }, def: comboDef('slash', step, 'sword')
});

const activeEffects = renderer => renderer.effects.filter(effect => effect.left > 0).length;

test('slash trail fires once per active combo step across copied attack objects', () => {
  const world = createWorld({ seed: 11 });
  addPlayer(world, { pid: 'local', weapon: 'blade' });
  startStage(world, 'S2');
  const renderer = makeRenderer(world);
  for (let frame = 1; frame <= 4; frame++) renderAct(renderer, world, { tick: frame, elapsed: frame });
  assert.equal(activeEffects(renderer), 1);
  renderAct(renderer, world, { tick: 5, elapsed: 1, step: 2 });
  assert.equal(activeEffects(renderer), 2);
});

test('same id and combo step after skipped inactive frames starts a fresh cast', () => {
  const world = createWorld({ seed: 12 });
  addPlayer(world, { pid: 'local', weapon: 'blade' });
  startStage(world, 'S2');
  const renderer = makeRenderer(world);
  renderAct(renderer, world, { tick: 10, elapsed: 1 });
  renderAct(renderer, world, { tick: 40, elapsed: 1 });
  assert.equal(activeEffects(renderer), 2);
});

test('cancel then recast same id and step starts a fresh cast', () => {
  const world = createWorld({ seed: 13 });
  addPlayer(world, { pid: 'local', weapon: 'blade' });
  startStage(world, 'S2');
  const renderer = makeRenderer(world);
  renderAct(renderer, world, { tick: 10, elapsed: 1 });
  renderAct(renderer, world, { tick: 11, active: false });
  renderAct(renderer, world, { tick: 30, elapsed: 1 });
  assert.equal(activeEffects(renderer), 2);
});

test('entity replacement and renderer reset each permit a fresh cast', () => {
  const world = createWorld({ seed: 14 });
  addPlayer(world, { pid: 'local', weapon: 'blade' });
  startStage(world, 'S2');
  const renderer = makeRenderer(world);
  renderAct(renderer, world, { tick: 10, elapsed: 1 });
  renderAct(renderer, world, { tick: 11, elapsed: 2, pid: 'replacement' });
  assert.equal(activeEffects(renderer), 2);
  renderer.reset(world);
  renderAct(renderer, world, { tick: 12, elapsed: 1 });
  assert.equal(activeEffects(renderer), 1);
});

test('predicted own-pawn tick skew remains one cast within the four-tick tolerance', () => {
  const world = createWorld({ seed: 15 });
  addPlayer(world, { pid: 'local', weapon: 'blade' });
  startStage(world, 'S2');
  const renderer = makeRenderer(world);
  for (let i = 0; i < 6; i++) renderAct(renderer, world, { tick: i + Math.floor(i / 2), elapsed: i + 1 });
  assert.equal(activeEffects(renderer), 1);
});

test('reduced motion uses the same cast identity', () => {
  const world = createWorld({ seed: 16 });
  addPlayer(world, { pid: 'local', weapon: 'blade' });
  startStage(world, 'S2');
  const renderer = makeRenderer(world, true);
  renderAct(renderer, world, { tick: 1, elapsed: 1 });
  renderAct(renderer, world, { tick: 2, elapsed: 2 });
  assert.equal(activeEffects(renderer), 1);
});

test('cast elapsed is present in decoded and predicted own acts', () => {
  const world = createWorld({ seed: 17 });
  const player = addPlayer(world, { pid: 'local', weapon: 'blade' });
  startStage(world, 'S2');
  player.act = { id: 'slash', step: 1, phase: 'active', elapsed: 2, total: 3, left: 1, facing: 0,
    def: comboDef('slash', 1, 'sword') };
  const decoded = decodeSnapshot(encodeSnapshot(world), 'local');
  assert.equal(decoded.entities[0].act.elapsed, 2);
  const predicted = predictPlayerTick({ ...player, act: null }, { ...emptyInput(), attack: true },
    { arena: world.arena, others: [], tick: world.tick });
  assert.ok(Number.isFinite(predicted.act?.elapsed));
});

function predictionFixture({ weapon = 'blade', skills = [] } = {}) {
  const world = createWorld({ seed: 18 });
  addPlayer(world, { pid: 'local', weapon, mods: { skills, maxMp: 200 } });
  startStage(world, 'S2');
  const view = decodeSnapshot(encodeSnapshot(world, { local: 0 }), 'local');
  const prediction = new LocalPrediction('local');
  prediction.presentationTimeout = 2000;
  prediction.reconcile(view);
  const renderer = makeRenderer(view);
  let trails = 0;
  const effect = renderer.effect.bind(renderer);
  renderer.effect = (...args) => {
    if (['slash', 'reverse', 'thrust', 'down', 'up', 'spin'].includes(args[5])) trails++;
    effect(...args);
  };
  return { world: view, prediction, renderer, trailCount: () => trails };
}

function renderPrediction({ prediction, renderer, world }, tick) {
  const frame = { ...world, tick };
  renderer.render(prediction.view(frame), 1, 1 / 60);
}

function advanceBasic(prediction, seq, attack = false) {
  prediction.advance({ seq, v: [0, 0, 1, 0], attack }, emptyInput(), T);
}

function advanceSkill(prediction, seq, skillEdge = false) {
  prediction.advance({ seq, v: [0, 0, 1, 0] }, { ...emptyInput(), skillEdge }, T);
}

function firstCastAuthority(world, tick, skill = false) {
  let pawn = structuredClone(world.entities.find(entity => entity.pid === 'local'));
  const others = world.entities.filter(entity => entity.pid !== 'local');
  for (let frame = 0; frame < tick; frame++)
    pawn = predictPlayerTick(pawn, { ...emptyInput(), attack: !skill && frame === 0,
      skillEdge: skill && frame === 0 }, { arena: world.arena, others, tick: frame });
  return { ...world, tick, entities: world.entities.map(entity => entity.pid === 'local'
    ? { ...entity, ...pawn, lastInputSeq: tick } : entity) };
}

test('confirmed slash and lunge stay visible through completion; slash trail remains single', () => {
  for (const config of [{ name: 'slash', skill: false }, { name: 'lunge', skill: true, skills: ['lunge'] }]) {
    for (const lag of [8, 12, 16]) {
      const fixture = predictionFixture({ skills: config.skills || [] });
      const { prediction, world } = fixture;
      prediction.presentationTimeout = 100;
      if (config.skill) advanceSkill(prediction, 1, true);
      else advanceBasic(prediction, 1, true);
      const firstView = prediction.view(world);
      fixture.renderer.render(firstView, 1, 1 / 60);
      for (let seq = 2; seq <= lag && prediction.state.act; seq++) {
        if (config.skill) advanceSkill(prediction, seq);
        else advanceBasic(prediction, seq);
        const view = prediction.view({ ...world, tick: seq });
        const row = prediction.attacks.starts.get(1);
        if (!row.completedLive && prediction.attacks.display(row))
          assert.ok(view.entities.find(entity => entity.pid === 'local').act,
            `${config.name}/${lag} stays visible before completion at tick ${seq}`);
        fixture.renderer.render(view, 1, 1 / 60);
      }
      const authority = structuredClone(world);
      authority.tick = lag;
      authority.entities = authority.entities.map(entity => entity.pid === 'local'
        ? { ...entity, lastInputSeq: 1, act: structuredClone(prediction.state.act) } : entity);
      prediction.reconcile(authority);
      const authoritativeView = prediction.view(authority);
      const row = prediction.attacks.starts.get(1);
      if (!row.completedLive && prediction.attacks.display(row))
        assert.ok(authoritativeView.entities.find(entity => entity.pid === 'local').act, `${config.name}/${lag} confirmed`);
      fixture.renderer.render(authoritativeView, 1, 1 / 60);
      for (let seq = lag + 1; prediction.state.act && seq < 40; seq++) {
        if (config.skill) advanceSkill(prediction, seq);
        else advanceBasic(prediction, seq);
        const view = prediction.view({ ...world, tick: seq });
        fixture.renderer.render(view, 1, 1 / 60);
        const current = prediction.attacks.starts.get(1);
        if (!current.completedLive && prediction.attacks.display(current))
          assert.ok(view.entities.find(entity => entity.pid === 'local').act, `${config.name}/${lag} tick ${seq}`);
      }
      assert.equal(prediction.state.act, null, `${config.name}/${lag} completes`);
      assert.equal(fixture.trailCount(), config.skill ? 0 : 1, `${config.name}/${lag} trail`);
    }
  }
});

function secondBasicActiveTick(world) {
  let pawn = structuredClone(world.entities.find(entity => entity.pid === 'local'));
  const others = world.entities.filter(entity => entity.pid !== 'local');
  let firstEnded = false;
  for (let tick = 0; tick < 64; tick++) {
    const hadAct = !!pawn.act;
    pawn = predictPlayerTick(pawn, { ...emptyInput(), attack: true }, { arena: world.arena, others, tick });
    if (hadAct && !pawn.act) firstEnded = true;
    if (firstEnded && pawn.act?.phase === 'active') return tick + 1;
  }
  throw new Error('second basic cast did not become active');
}

function castAct(template, patch) {
  return patch ? { ...template, ...patch, def: template.def, phaseTicks: template.phaseTicks } : null;
}

test('one predicted basic cast keeps one trail through authority replay phase resets', () => {
  const replays = [
    [
      { phase: 'active', elapsed: 5, left: 100, castTick: 753 },
      null,
      { phase: 'windup', elapsed: 1, left: 3, castTick: 761 },
      { phase: 'active', elapsed: 5, left: 100, castTick: 761 }
    ],
    [
      { phase: 'active', elapsed: 12, left: 100, castTick: 769 },
      { phase: 'recovery', elapsed: 12, left: 8, castTick: 771 },
      { phase: 'active', elapsed: 7, left: 100, castTick: 775 }
    ],
    [
      { phase: 'active', elapsed: 8, left: 100, castTick: 887 },
      { phase: 'windup', elapsed: 2, left: 3, castTick: 894 },
      { phase: 'active', elapsed: 2, left: 100, castTick: 891 }
    ]
  ];

  const counts = [];
  for (const replay of replays) {
    const fixture = predictionFixture();
    const { prediction, renderer, world } = fixture;
    for (let seq = 1; seq <= 10; seq++) {
      advanceBasic(prediction, seq, seq === 1);
      const waiting = { ...world, tick: seq, entities: world.entities.map(entity => ({ ...entity, act: null, lastInputSeq: 0 })) };
      prediction.reconcile(waiting);
      renderer.render(prediction.view(waiting), 1, 1 / 60);
    }

    const template = structuredClone(prediction.state.act);
    const accepted = { ...world, tick: 11, entities: world.entities.map(entity => ({
      ...entity, lastInputSeq: 1, act: castAct(template, replay[0])
    })) };
    prediction.reconcile(accepted);
    renderer.render(prediction.view(accepted), 1, 1 / 60);
    const authorityStart = accepted.tick - replay[0].elapsed;
    let tick = 12, seq = 2;
    for (const patch of replay.slice(1)) {
      const before = prediction.state;
      const after = { ...before, act: castAct(before.act ?? template, patch) };
      prediction.state = prediction.attacks.track(before, after, seq++, patch ? authorityStart + patch.elapsed : authorityStart, { replay: true });
      renderPrediction(fixture, tick++);
    }

    counts.push(fixture.trailCount());
  }
  assert.deepEqual(counts, [1, 1, 1]);
});

test('captured duplicate cast replays rebind to one identity and preserve cast 25 recovery trail', () => {
  const captures = [
    { cast: 8, step: 2, start: [524, 5, 468], replays: [[526, 'active', 6, 468, 'active', 5, 469]] },
    { cast: 18, step: 1, start: [606, 5, 551], replays: [[610, 'active', 5, 551, 'windup', 4, 552]] },
    { cast: 27, step: 2, start: [720, 5, 672], replays: [[728, 'recovery', 12, 672, 'active', 6, 678]] },
    { cast: 29, step: 3, start: [744, 8, 694], replays: [[746, 'active', 9, 694, 'active', 8, 695]] },
    { cast: 41, step: 3, start: [840, 8, 795], replays: [
      [844, 'recovery', 10, 795, 'windup', 5, 799],
      [846, 'windup', 6, 799, 'windup', 5, 800]
    ] },
    { cast: 55, step: 3, start: [950, 7, 914], replays: [[952, 'active', 7, 914, 'windup', 6, 915]] }
  ];
  const capturedAct = (step, phase, elapsed, presentationSeq) => ({
    id: 'slash', step, phase, elapsed, total: 3, left: 2, facing: 0,
    phaseTicks: { windup: step === 3 ? 7 : 5, lock: 0, active: 3, recovery: 8 },
    presentationSeq, def: comboDef('slash', step, 'sword')
  });
  for (const capture of captures) {
    const fixture = predictionFixture();
    const { prediction, world } = fixture;
    const [tick, elapsed, initialSeq] = capture.start;
    const initial = capturedAct(capture.step, 'active', elapsed, undefined);
    prediction.state = prediction.attacks.track(
      { ...prediction.state, act: null },
      { ...prediction.state, act: initial },
      initialSeq, tick
    );
    renderPrediction(fixture, tick);
    for (const [replayTick, beforePhase, beforeElapsed, beforeSeq, afterPhase, afterElapsed, seq] of capture.replays) {
      const before = { ...prediction.state, act: capturedAct(capture.step, beforePhase, beforeElapsed, beforeSeq) };
      const after = { ...prediction.state, act: capturedAct(capture.step, afterPhase, afterElapsed, undefined) };
      prediction.state = prediction.attacks.track(before, after, seq, replayTick, { replay: true });
      renderPrediction(fixture, replayTick);
      assert.equal(prediction.state.act.presentationSeq, initialSeq, `cast ${capture.cast}`);
    }
    assert.equal(fixture.trailCount(), 1, `host cast ${capture.cast}`);
  }

  const world = createWorld({ seed: 19 });
  addPlayer(world, { pid: 'remote', weapon: 'blade' });
  startStage(world, 'S2');
  const renderer = makeRenderer(world);
  const phaseTicks = { windup: 5, lock: 0, active: 3, recovery: 8 };
  renderAct(renderer, world, { tick: 718, elapsed: 3, phase: 'windup', castTick: 715, pid: 'remote', phaseTicks });
  renderAct(renderer, world, { tick: 726, elapsed: 11, phase: 'recovery', castTick: 715, pid: 'remote', phaseTicks });
  assert.equal(activeEffects(renderer), 1, 'cast 25 emits once when recovery is first sampled at elapsed 11');
});

test('captured casts 25, 49 and 55 keep one live cosmetic across delayed authority', () => {
  const captures = [
    { hostCast: 25, seq: 802, start: 877, guestElapsed: 3, authorityTick: 893, phase: 'recovery', elapsed: 11, left: 5 },
    { hostCast: 49, seq: 1014, start: 1086, guestElapsed: 2, authorityTick: 1093, phase: 'active', elapsed: 5, left: 3 },
    { hostCast: 55, seq: 1046, start: 1126, guestElapsed: 4, authorityTick: 1143, phase: 'active', elapsed: 5, left: 3 }
  ];
  const phaseOrder = { windup: 0, lock: 1, active: 2, recovery: 3 };
  for (const capture of captures) {
    const fixture = predictionFixture();
    const { prediction, world } = fixture;
    prediction.tick = capture.start - 1;
    advanceBasic(prediction, capture.seq, true);
    for (let elapsed = 1; elapsed <= capture.guestElapsed; elapsed++) {
      advanceBasic(prediction, capture.seq + elapsed);
      renderPrediction(fixture, capture.start + elapsed);
    }
    const predicted = prediction.state.act;
    assert.equal(predicted?.id, 'slash', `captured cast ${capture.hostCast} predicted`);
    assert.equal(predicted?.step ?? 0, 1);
    const authorityAct = { ...predicted, phase: capture.phase, elapsed: capture.elapsed, left: capture.left };
    const authority = { ...world, tick: capture.authorityTick, entities: world.entities.map(entity => entity.pid === 'local'
      ? { ...entity, lastInputSeq: capture.seq + capture.guestElapsed, act: authorityAct } : entity) };
    prediction.reconcile(authority);
    let display = prediction.view(authority).entities.find(entity => entity.pid === 'local').act;
    assert.ok(display, `captured cast ${capture.hostCast} is not nulled on bind`);
    assert.equal(display.presentationSeq, capture.seq);
    let previousPhase = phaseOrder[display.phase];
    fixture.renderer.render(prediction.view(authority), 1, 1 / 60);
    for (let step = 1; step <= 3 && prediction.state.act; step++) {
      advanceBasic(prediction, capture.seq + capture.guestElapsed + step);
      display = prediction.view({ ...authority, tick: prediction.tick }).entities.find(entity => entity.pid === 'local').act;
      if (display) {
        assert.ok(phaseOrder[display.phase] >= previousPhase, `cast ${capture.hostCast} phase never regresses`);
        previousPhase = phaseOrder[display.phase];
      }
      fixture.renderer.render(prediction.view({ ...authority, tick: prediction.tick }), 1, 1 / 60);
    }
    assert.equal(fixture.trailCount(), 1, `host cast ${capture.hostCast}`);
  }
});

test('captured seq 820 and 940 stalls revive only when FIFO authority arrives within the cast window', () => {
  const captures = [
    { seq: 820, step: 2, predictedStart: 909, authorityStart: 902, window: 8,
      frames: [[908, 'active', 6, 2], [909, 'active', 7, 1], [910, 'recovery', 8, 8]] },
    { seq: 940, step: 3, predictedStart: 1025, authorityStart: 1015, window: 10,
      frames: [[1022, 'active', 7, 3], [1024, 'active', 9, 1], [1025, 'recovery', 10, 8], [1026, 'recovery', 11, 7]] }
  ];
  const phaseOrder = { windup: 0, lock: 1, active: 2, recovery: 3 };
  for (const capture of captures) {
    const fixture = predictionFixture();
    const { prediction, world } = fixture;
    const phaseTicks = { windup: capture.step === 3 ? 7 : 5, lock: 0, active: 3, recovery: 8 };
    const initial = { id: 'slash', step: capture.step, phase: 'windup', elapsed: 0,
      left: phaseTicks.windup, total: phaseTicks.windup, phaseTicks, facing: 0,
      def: comboDef('slash', capture.step, 'sword') };
    prediction.tick = capture.predictedStart;
    prediction.state = prediction.attacks.track({ ...prediction.state, act: null },
      { ...prediction.state, act: initial }, capture.seq, capture.predictedStart);
    const row = prediction.attacks.starts.get(capture.seq);
    assert.equal(row.windowTicks, capture.window);
    const horizon = capture.seq + 12 + capture.window;
    const rejected = { ...world, tick: capture.predictedStart + 1,
      entities: world.entities.map(entity => ({ ...entity, lastInputSeq: horizon, act: null })) };
    prediction.reconcile(rejected);
    assert.equal(row.rejected, true);
    assert.equal(prediction.view(rejected).entities[0].act, null);

    let previousPhase = -1;
    for (const [tick, phase, elapsed, left] of capture.frames) {
      const authorityAct = { ...initial, phase, elapsed, left };
      const authority = { ...world, tick, entities: world.entities.map(entity => entity.pid === 'local'
        ? { ...entity, lastInputSeq: horizon, act: authorityAct } : entity) };
      prediction.reconcile(authority);
      const display = prediction.view(authority).entities.find(entity => entity.pid === 'local').act;
      assert.ok(display, `seq ${capture.seq} remains visible at ${phase}/${elapsed}`);
      assert.equal(display.presentationSeq, capture.seq);
      assert.ok(phaseOrder[display.phase] >= previousPhase, `seq ${capture.seq} phase does not regress`);
      previousPhase = phaseOrder[display.phase];
      fixture.renderer.render(prediction.view(authority), 1, 1 / 60);
    }
    assert.equal(row.rejected, false);
    assert.equal(row.bound, capture.authorityStart);
    assert.equal(fixture.trailCount(), 1, `seq ${capture.seq} has one trail`);
  }
});

test('stun clears a predicted cosmetic immediately and authority-only casts use late identity', () => {
  const stunned = predictionFixture();
  advanceBasic(stunned.prediction, 1, true);
  const blocked = { ...stunned.world, tick: 2, entities: stunned.world.entities.map(entity => entity.pid === 'local'
    ? { ...entity, staggerLeft: 3, act: null, lastInputSeq: 1 } : entity) };
  stunned.prediction.reconcile(blocked);
  assert.equal(stunned.prediction.view(blocked).entities.find(entity => entity.pid === 'local').act, null);
  assert.equal(stunned.prediction.attacks.starts.size, 0);

  const late = predictionFixture();
  const act = { id: 'slash', step: 1, phase: 'active', elapsed: 6, left: 2, total: 5,
    phaseTicks: { windup: 5, lock: 0, active: 3, recovery: 8 }, facing: 0,
    def: comboDef('slash', 1, 'sword') };
  const authority = { ...late.world, tick: 20, entities: late.world.entities.map(entity => entity.pid === 'local'
    ? { ...entity, lastInputSeq: 20, act } : entity) };
  late.prediction.reconcile(authority);
  const shown = late.prediction.view(authority).entities.find(entity => entity.pid === 'local').act;
  assert.equal(shown.presentationSeq, undefined);
  assert.equal(shown.presentationAuthorityStart, 14);
  late.renderer.render(late.prediction.view(authority), 1, 1 / 60);
  late.renderer.render(late.prediction.view(authority), 1, 1 / 60);
  assert.equal(late.trailCount(), 1);
});

test('snapshot sampling preserves trails for casts skipped between sampled frames', () => {
  const fixture = remoteBufferedFixture();
  fixture.push(100, bufferedSlash(1, 'windup', 4, 96));
  const first = fixture.sample(100);
  const renderer = makeRenderer(first);
  let trails = 0;
  const effect = renderer.effect.bind(renderer);
  renderer.effect = (...args) => {
    if (['slash', 'reverse', 'thrust', 'down', 'up', 'spin'].includes(args[5])) trails++;
    effect(...args);
  };
  renderer.render(first, 1, 1 / 60);

  fixture.push(101, bufferedSlash(1, 'active', 5, 96));
  fixture.push(105, bufferedSlash(1, 'recovery', 9, 96));
  fixture.push(112, bufferedSlash(2, 'active', 6, 106));
  const jumped = fixture.sample(112);
  assert.deepEqual(jumped.passedActs.map(row => [row.entityId, row.act.step, row.act.phase]), [
    [first.entities.find(entity => entity.pid === 'remote').id, 1, 'recovery'],
    [first.entities.find(entity => entity.pid === 'remote').id, 2, 'active']
  ]);
  renderer.render(jumped, 1, 1 / 60);
  assert.equal(trails, 2, 'the skipped cast and sampled next cast each emit once');
});

test('frame-by-frame playback dedupes acts present in both passed frames and the sampled frame', () => {
  const fixture = remoteBufferedFixture();
  fixture.push(100, bufferedSlash(1, 'windup', 4, 96));
  const first = fixture.sample(100), renderer = makeRenderer(first);
  let trails = 0;
  const effect = renderer.effect.bind(renderer);
  renderer.effect = (...args) => {
    if (['slash', 'reverse', 'thrust', 'down', 'up', 'spin'].includes(args[5])) trails++;
    effect(...args);
  };
  renderer.render(first, 1, 1 / 60);
  for (const [tick, act] of [
    [101, bufferedSlash(1, 'active', 5, 96)],
    [105, bufferedSlash(1, 'recovery', 9, 96)],
    [112, bufferedSlash(2, 'active', 6, 106)]
  ]) {
    fixture.push(tick, act);
    const sampled = fixture.sample(tick);
    renderer.render(sampled, 1, 1 / 60);
  }
  assert.equal(trails, 2, 'each of two host casts emits once despite passed/current overlap');
});

test('a replay without a live same-cast candidate cannot create a presentation identity', () => {
  const { prediction } = predictionFixture();
  const before = { ...prediction.state, act: null };
  const after = { ...prediction.state, act: {
    id: 'slash', phase: 'active', elapsed: 1, step: 1, total: 3, left: 2, facing: 0,
    phaseTicks: { windup: 5, lock: 0, active: 3, recovery: 8 }, def: comboDef('slash', 1, 'sword')
  } };
  prediction.attacks.track(before, after, 99, 10, { replay: true });
  assert.equal(after.act.presentationSeq, undefined);
  assert.equal(prediction.attacks.starts.size, 0);
});

test('an unbound act survives wall-clock age and hides only at the acknowledgement horizon', () => {
  const fixture = predictionFixture();
  const { prediction, world } = fixture;
  prediction.presentationTimeout = 100;
  advanceBasic(prediction, 1, true);
  assert.ok(prediction.view(world).entities[0].act, 'the first displayed windup marks the row visible');
  const row = prediction.attacks.starts.get(1);
  prediction.attacks.now = row.at + 150;
  prediction.attacks.now = row.at + 201;
  assert.ok(prediction.view(world).entities[0].act, 'wall-clock age does not hide a live cosmetic');
  const horizon = 1 + 12 + row.windowTicks;
  const rejected = { ...world, tick: horizon, entities: world.entities.map(entity => ({
    ...entity, lastInputSeq: horizon, act: null
  })) };
  prediction.reconcile(rejected);
  assert.equal(row.rejected, true);
  assert.equal(prediction.view(rejected).entities[0].act, null);
});

test('two distinct predicted basic presses each produce a trail', () => {
  const fixture = predictionFixture();
  for (let seq = 1; seq <= 16; seq++) {
    advanceBasic(fixture.prediction, seq, seq === 1);
    renderPrediction(fixture, seq);
  }
  for (let seq = 17; seq <= 22; seq++) {
    advanceBasic(fixture.prediction, seq, seq === 17);
    renderPrediction(fixture, seq);
  }
  assert.equal(fixture.trailCount(), 2);
});

test('same-key predicted recasts stay visible while authority still reports the previous cast', () => withoutCombos(() => {
  const results = [];
  const activeTick = secondBasicActiveTick(predictionFixture().world);
  for (const mode of ['held', 'quick']) for (const lag of [8, 12, 16]) {
    const fixture = predictionFixture();
    const { prediction, renderer, world } = fixture;
    for (let seq = 1; seq <= 16; seq++) {
      advanceBasic(prediction, seq, mode === 'held' || seq === 1);
      renderPrediction(fixture, seq);
    }
    assert.equal(prediction.state.act, null);
    assert.equal(prediction.attacks.starts.get(1)?.completed, true);

    const hostTick = activeTick - lag;
    assert.ok(hostTick > 0);
    const authority = firstCastAuthority(world, hostTick);
    const hostAct = authority.entities.find(entity => entity.pid === 'local').act;
    assert.equal(hostAct?.id, 'slash');
    assert.equal(hostAct?.step ?? 0, 0);
    prediction.reconcile(authority);
    assert.equal(prediction.attacks.starts.get(1)?.confirmed, true);
    assert.equal(prediction.attacks.starts.get(1)?.completed, true);
    assert.equal(prediction.view(authority).entities.find(entity => entity.pid === 'local').act, null);
    const firstAuthorityStart = prediction.attacks.starts.get(1).authorityStart;

    let activeFrames = 0, hiddenActiveFrames = 0, observedLag = null;
    let seq = 17;
    for (; seq < 40; seq++) {
      advanceBasic(prediction, seq, mode === 'held' || seq === 17);
      const view = prediction.view({ ...authority, tick: prediction.tick });
      const displayed = view.entities.find(entity => entity.pid === 'local').act;
      if (prediction.state.act?.phase === 'active') {
        if (observedLag === null) observedLag = prediction.tick - authority.tick;
        activeFrames++;
        if (!displayed) hiddenActiveFrames++;
        else assert.notEqual(displayed.presentationSeq, 1);
      }
      renderer.render(view, 1, 1 / 60);
      if (activeFrames && prediction.state.act?.phase !== 'active') break;
    }
    const secondSeq = prediction.state.act?.presentationSeq;
    const secondAct = { ...prediction.state.act };
    delete secondAct.presentationSeq;
    const secondAuthority = { ...authority, tick: prediction.tick, entities: authority.entities.map(entity => entity.pid === 'local'
      ? { ...entity, lastInputSeq: seq, act: secondAct } : entity) };
    prediction.reconcile(secondAuthority);
    const secondAuthorityStart = secondAuthority.tick - secondAct.elapsed;
    assert.equal(prediction.attacks.starts.get(1).authorityStart, firstAuthorityStart);
    assert.equal(prediction.attacks.starts.get(secondSeq).authorityStart, secondAuthorityStart);
    assert.equal(prediction.view(secondAuthority).entities.find(entity => entity.pid === 'local').act.presentationSeq, secondSeq);
    results.push({ mode, lag, observedLag, activeFrames, hiddenActiveFrames, trails: fixture.trailCount() });
  }

  assert.ok(results.every(result => result.observedLag === result.lag
    && result.activeFrames > 0 && result.hiddenActiveFrames === 0 && result.trails === 2), JSON.stringify(results));
}));

test('a skill recast from recovery receives a fresh live cosmetic identity', () => {
  const fixture = predictionFixture({ skills: ['lunge'] });
  const { prediction } = fixture;
  advanceSkill(prediction, 1, true);
  renderPrediction(fixture, 1);
  let seq = 2;
  while (prediction.state.act && prediction.state.act.phase !== 'recovery') {
    advanceSkill(prediction, seq);
    renderPrediction(fixture, seq++);
  }
  const first = prediction.attacks.starts.get(1);
  assert.equal(first?.id, 'lunge');
  assert.equal(first?.completedLive, false);
  advanceSkill(prediction, seq, true);
  const second = prediction.state.act;
  assert.equal(first.completedLive, true);
  assert.equal(second?.id, 'lunge');
  assert.notEqual(second.presentationSeq, first.seq);
  for (let frames = 0; frames < 8 && prediction.state.act; frames++) {
    const view = prediction.view(fixture.world);
    assert.ok(view.entities.find(entity => entity.pid === 'local').act);
    fixture.renderer.render(view, 1, 1 / 60);
    advanceSkill(prediction, ++seq);
  }
  assert.ok(prediction.attacks.starts.has(second.presentationSeq));
});

test('a later same-key authority cast does not inherit an older completed identity', () => withoutCombos(() => {
  const fixture = predictionFixture();
  const { prediction, world } = fixture;
  for (let seq = 1; seq <= 16; seq++) advanceBasic(prediction, seq, seq === 1);
  const authority = firstCastAuthority(world, secondBasicActiveTick(world) - 8);
  prediction.reconcile(authority);
  const previous = prediction.attacks.starts.get(1);
  assert.equal(previous?.confirmed, true);
  assert.equal(previous?.completed, true);
  const nextStart = previous.authorityStart + previous.windowTicks + 1;
  const nextTick = nextStart + 3;
  const nextAct = { ...authority.entities.find(entity => entity.pid === 'local').act,
    phase: 'active', elapsed: 3 };
  delete nextAct.presentationSeq;
  const bound = prediction.attacks.bind(nextAct, 1, nextTick);
  assert.equal(bound.presentationSeq, undefined);
  assert.equal(prediction.attacks.act(bound, nextTick), bound);
  assert.equal(prediction.attacks.starts.size, 1);
}));

test('rejected predicted basic cast does not leave another trail or stall prediction', () => {
  const fixture = predictionFixture();
  for (let seq = 1; seq <= 7; seq++) {
    advanceBasic(fixture.prediction, seq, seq === 1);
    renderPrediction(fixture, seq);
  }
  const row = fixture.prediction.attacks.starts.get(1);
  const horizon = 1 + 12 + row.windowTicks;
  const rejected = { ...fixture.world, tick: horizon, entities: fixture.world.entities.map(entity => ({
    ...entity, lastInputSeq: horizon, act: null
  })) };
  fixture.prediction.reconcile(rejected);
  fixture.renderer.render(fixture.prediction.view(rejected), 1, 1 / 60);
  advanceBasic(fixture.prediction, 8);
  renderPrediction(fixture, 9);
  assert.equal(fixture.trailCount(), 1);
  assert.equal(fixture.prediction.attacks.starts.get(1)?.rejected, true);
  assert.equal(fixture.prediction.state.act, null);
  fixture.prediction.reconcile({ ...rejected, tick: horizon + 1 });
  assert.equal(fixture.prediction.view(rejected).entities[0].act, null);
});

test('a rejected row is revived when authority later confirms its same cast within the startup window', () => {
  const fixture = predictionFixture();
  advanceBasic(fixture.prediction, 1, true);
  const predicted = structuredClone(fixture.prediction.state.act);
  const row = fixture.prediction.attacks.starts.get(1);
  const horizon = 1 + 12 + row.windowTicks;
  const rejected = { ...fixture.world, tick: horizon, entities: fixture.world.entities.map(entity => ({
    ...entity, lastInputSeq: horizon, act: null
  })) };
  fixture.prediction.reconcile(rejected);
  assert.equal(fixture.prediction.attacks.starts.get(1)?.rejected, true);
  const authorityAct = { ...predicted, phase: 'active', elapsed: 6, left: 1 };
  delete authorityAct.presentationSeq;
  const accepted = { ...fixture.world, tick: 6, entities: fixture.world.entities.map(entity => ({
    ...entity, lastInputSeq: 1, act: authorityAct
  })) };
  fixture.prediction.reconcile(accepted);
  assert.equal(fixture.prediction.attacks.starts.get(1)?.confirmed, true);
  assert.equal(fixture.prediction.attacks.starts.get(1)?.rejected, false);
  assert.equal(fixture.prediction.view(accepted).entities.find(entity => entity.pid === 'local').act.presentationSeq, 1);
});

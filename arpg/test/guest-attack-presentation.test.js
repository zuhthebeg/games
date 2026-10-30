import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, startStage, emptyInput } from '../js/sim/world.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
import { LocalPrediction } from '../js/net/prediction.js';
const T = 1000 / 30;
function fixture(mods = {}, weapon = 'focus') {
  const w = createWorld(); addPlayer(w, { pid: 'g', weapon, mods: { skills: ['ember_bolt'], maxMp: 200, ...mods } }); startStage(w, 'S2');
  const view = decodeSnapshot(encodeSnapshot(w, { g: 0 }), 'g'), p = new LocalPrediction('g'); p.reconcile(view);
  return { w, view, p };
}
function advance(p, seq, input = {}) { p.advance({ seq, v: [0, 0, 1, 0] }, { ...emptyInput(), ...input }, T); }
test('skill act is immediately visible, but authoritative HUD/combat and source world stay untouched', () => {
  const { view, p } = fixture(), before = JSON.stringify(view);
  advance(p, 1, { skillEdge: true });
  const shown = p.view(view).entities[0];
  assert.equal(shown.act?.id, 'ember_bolt');
  for (const k of ['hp','mp','cds','skillMasteryLevels','dodge']) assert.deepEqual(shown[k], view.entities[0][k], k);
  assert.equal(JSON.stringify(view), before);
});
test('fractional preview starts skill on first display frame without consuming it', () => {
  const { view, p } = fixture(); p.setPreview({ ...emptyInput(), skillEdge: true }, 4);
  assert.equal(p.view(view).entities[0].act?.id, 'ember_bolt');
  assert.equal(p.state.act, null); assert.equal(p.pending.length, 0);
});
test('insufficient MP, cooldown, death, channel and guard never invent a local act', () => {
  for (const patch of [{ mp: 0 }, { cds: { ember_bolt: 30 } }, { dead: true }, { channel: 9 }, { offhand: 'shield', shieldGuard: { left: 5 }, dodge: null }]) {
    const { view, p } = fixture();
    const pawn = view.entities[0]; Object.assign(pawn, { ...patch, ...(patch.dodge === null ? { dodge: pawn.dodge } : {}) }); p.reconcile(view);
    advance(p, 1, { skillEdge: true, dodgeHeld: patch.offhand === 'shield' });
    assert.equal(p.view(view).entities[0].act, null, JSON.stringify(patch));
  }
});
test('accepted act aligns to authoritative elapsed and rejected acknowledged act disappears', () => {
  const { view, p } = fixture(); advance(p, 1, { skillEdge: true });
  const accepted = structuredClone(view); accepted.tick = 3; accepted.entities[0].lastInputSeq = 1;
  accepted.entities[0].act = { ...p.state.act, elapsed: 5, left: 2 }; delete accepted.entities[0].act.presentationSeq; p.reconcile(accepted);
  assert.equal(p.view(accepted).entities[0].act.elapsed, 5);
  const rejected = structuredClone(accepted); rejected.tick++; rejected.entities[0].act = null; rejected.entities[0].lastInputSeq = 2; p.reconcile(rejected);
  assert.equal(p.view(rejected).entities[0].act, null);
});
test('visible unconfirmed act survives its timeout but expires at the hard cap', () => {
  const { view, p } = fixture({ skills: ['meteor'] }); p.presentationTimeout = 180;
  advance(p, 1, { skillEdge: true });
  assert.equal(p.view(view).entities[0].act?.id, 'meteor');
  for (let seq = 2; seq <= 7; seq++) advance(p, seq);
  assert.equal(p.view(view).entities[0].act?.id, 'meteor', 'visible act survives the ordinary timeout');
  for (let seq = 8; seq <= 12; seq++) advance(p, seq);
  assert.equal(p.view(view).entities[0].act, null);
  const stale = structuredClone(view); stale.tick = 1; p.reconcile(stale);
  assert.equal(p.view(stale).entities[0].act, null);
});

test('unconfirmed projectile copies are display-only and yield to authoritative counterparts', () => {
  const { view, p } = fixture(); p.presentationTimeout = 1500;
  advance(p, 1, { skillEdge: true });
  for (let seq = 2; seq < 24 && !p.view(view).projectiles.some(pr => pr.presentation); seq++) advance(p, seq);
  const projected = p.view(view).projectiles.filter(pr => pr.presentation);
  assert.equal(projected.length, 1); assert.ok(projected[0].id < 0); assert.equal(view.projectiles.length, 0);
  assert.ok(projected[0].presentationAlpha > 0); assert.equal(projected[0].damage, undefined);
  const accepted = structuredClone(view); accepted.tick = 8; accepted.entities[0].lastInputSeq = 1;
  accepted.entities[0].act = { ...p.state.act }; delete accepted.entities[0].act.presentationSeq;
  accepted.projectiles = [{ ...projected[0], id: 71 }]; delete accepted.projectiles[0].presentation;
  p.reconcile(accepted);
  assert.equal(p.view(accepted).projectiles.length, 1); assert.equal(p.view(accepted).projectiles[0].id, 71);
});
test('confirmed pending projectile retains its presentation until range or authority delivery', () => {
  const { view, p } = fixture(); p.presentationTimeout = 100;
  advance(p, 1, { skillEdge: true });
  const row = p.attacks.starts.get(1);
  row.confirmed = true;
  p.attacks.shots.push({ id: -1, seq: 1, ownerId: 'g', abilityId: 'ember_bolt',
    x: 0, y: 0, vx: 0, vy: 0, r: 5, range: 1000, travelled: 0, born: p.attacks.now, presentation: true });
  p.attacks.advance(p.state, 500);
  const pending = p.view(view).projectiles.filter(pr => pr.presentation);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].presentationAlpha, .55);
});
test('completed local cast is not replayed by late confirmation and rejection removes projectile copies', () => {
  const { view, p } = fixture(); p.presentationTimeout = 1800;
  advance(p, 1, { skillEdge: true }); const acceptedAct = structuredClone(p.state.act); delete acceptedAct.presentationSeq;
  for (let seq = 2; seq < 30; seq++) advance(p, seq);
  assert.equal(p.view(view).entities[0].act, null);
  const accepted = structuredClone(view); accepted.tick = 10; accepted.entities[0].lastInputSeq = 29; accepted.entities[0].act = acceptedAct;
  p.reconcile(accepted); assert.equal(p.view(accepted).entities[0].act, null, 'no second windup');
  accepted.tick++; accepted.entities[0].act = null; p.reconcile(accepted);
  assert.equal(p.view(accepted).projectiles.filter(pr => pr.presentation).length, 0);
});

test('an early accepted windup still presents its first projectile locally, then coalesces with authority', () => {
  const { view, p } = fixture(); p.presentationTimeout = 180;
  advance(p, 1, { skillEdge: true });
  const accepted = structuredClone(view); accepted.tick = 2; accepted.entities[0].lastInputSeq = 1;
  accepted.entities[0].act = { ...p.state.act }; delete accepted.entities[0].act.presentationSeq; p.reconcile(accepted);
  for (let seq = 2; seq < 20 && !p.view(accepted).projectiles.some(pr=>pr.presentation); seq++) advance(p, seq);
  assert.equal(p.view(accepted).projectiles.filter(pr=>pr.presentation).length, 1);
  accepted.tick++; accepted.entities[0].lastInputSeq = 20; accepted.entities[0].act = null; p.reconcile(accepted);
  assert.equal(p.view(accepted).projectiles.filter(pr=>pr.presentation).length, 0);
});

test('late host counter or next combo step is not mistaken for a completed local basic', () => {
  for (const change of [{counter:true},{step:2}]) {
    const {view,p}=fixture();p.presentationTimeout=1800;
    p.advance({seq:1,v:[0,0,1,0],attack:true},emptyInput(),T);
    const basic=structuredClone(p.state.act);delete basic.presentationSeq;
    for(let seq=2;seq<30;seq++)advance(p,seq);
    const fresh=structuredClone(view);fresh.tick=10;fresh.entities[0].lastInputSeq=29;fresh.entities[0].act={...basic,...change};
    p.reconcile(fresh);
    assert.ok(p.view(fresh).entities[0].act,'new host action retains its own presentation');
  }
});

test('already-predicted basics retain their original whole-tick motion and authoritative projectiles', () => {
  const {view,p}=fixture();
  p.setPreview({...emptyInput(),attack:true},4);
  assert.equal(p.view(view).entities[0].act,null,'no new fractional basic timeline');
  p.setPreview(emptyInput(),0);
  p.advance({seq:1,v:[0,0,1,0],attack:true},emptyInput(),T);
  assert.equal(p.view(view).entities[0].act?.id,'focus_pulse');
  for(let seq=2;seq<20;seq++)advance(p,seq);
  assert.ok(p.attacks.starts.has(1),'basic casts receive a presentation sequence');
  assert.equal(p.view(view).projectiles.filter(pr=>pr.presentation).length,0);
});

test('basic bow and focus projectiles remain authoritative-only after presentation tracking', () => {
  for (const weapon of ['bow', 'focus']) {
    const { view, p } = fixture({}, weapon);
    p.presentationTimeout = 2000;
    p.advance({ seq: 1, v: [0, 0, 1, 0], attack: true }, emptyInput(), T);
    for (let seq = 2; seq <= 12; seq++) p.advance({ seq, v: [0, 0, 1, 0], attack: false }, emptyInput(), T);
    assert.ok(p.attacks.starts.has(1), `${weapon} basic receives a presentation sequence`);
    assert.equal(p.view(view).projectiles.filter(pr => pr.presentation).length, 0,
      `${weapon} basic projectile remains authoritative-only`);
  }
});

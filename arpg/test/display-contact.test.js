import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalPrediction } from '../js/net/prediction.js';

const arena = { w: 1200, h: 800 };
const pawn = (x, y, extra = {}) => ({ kind: 'player', pid: 'g', id: 1, r: 17, x, y, facing: 0, dodge: { dashLeft: 0 }, ...extra });
const mob = (x, y, extra = {}) => ({ kind: 'monster', id: 2, r: 18, x, y, ...extra });
const world = (...entities) => ({ tick: 10, arena, entities });

test('display contact: pawn drawn outside a body it was replayed into', () => {
  const lp = new LocalPrediction('g');
  const out = lp.displayContact(pawn(420, 400), world(pawn(420, 400), mob(435, 400)));
  assert.ok(Math.hypot(out.x - 435, out.y - 400) >= 35 - 1e-9);
  assert.ok(out.x < 435, 'stays on the side it came from');
});

test('display contact: deep replay past the centre keeps the previous side (no pop-through)', () => {
  const lp = new LocalPrediction('g');
  const m = mob(435, 400);
  lp.displayContact(pawn(400, 400), world(m));
  const out = lp.displayContact(pawn(445, 400), world(m));
  assert.ok(Math.abs(out.x - 400) < 1e-9 && Math.abs(out.y - 400) < 1e-9);
});

test('display contact: swept tunnel through a body is blocked on the near side', () => {
  const lp = new LocalPrediction('g');
  const m = mob(435, 400);
  lp.displayContact(pawn(400, 400), world(m));
  const out = lp.displayContact(pawn(480, 400), world(m));
  assert.ok(out.x <= 400 + 1e-9, 'did not jump to the far side');
});

test('display contact: no overlap, players, dashing pawn and dead bodies are untouched', () => {
  const lp = new LocalPrediction('g');
  const free = pawn(300, 400);
  assert.equal(lp.displayContact(free, world(mob(435, 400))), free);
  const other = { ...pawn(305, 400), pid: 'h', id: 3 };
  assert.equal(lp.displayContact(free, world(other)), free);
  const dashing = pawn(430, 400, { dodge: { dashLeft: 3 } });
  assert.equal(lp.displayContact(dashing, world(mob(435, 400))), dashing);
  const p = pawn(430, 400);
  assert.equal(lp.displayContact(p, world(mob(435, 400, { dead: true }))), p);
});

test('display contact: result stays inside the arena', () => {
  const lp = new LocalPrediction('g');
  const out = lp.displayContact(pawn(20, 400), world(mob(30, 400)));
  assert.ok(out.x >= 17 && out.x <= arena.w - 17);
});

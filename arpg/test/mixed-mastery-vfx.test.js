import test from 'node:test';
import assert from 'node:assert/strict';
import { Graphics, Container } from '../vendor/pixi-8.22.0.min.mjs';
import { MasterySkillVfx } from '../js/render/mastery-vfx.js';
import { presentSkillEvents } from '../js/net/skill-presentation.js';
const world = { tick: 1, entities: [
  { id: 1, pid: 'ember', kind: 'player', skillMasteryLevels: { ember_bolt: 30 } },
  { id: 2, pid: 'bow', kind: 'player', skillMasteryLevels: { blast_arrow: 10 } },
  { id: 3, pid: 'other', kind: 'player', skillMasteryLevels: { blast_arrow: 20 } },
], projectiles: [] };
const explicit = () => ({ type: 'explode', id: 90, ability: 'ember_bolt', ember20: true, presentationOwner: 1, castId: 90, x: 0, y: 0, radius: 117 });
const blast = () => ({ type: 'explode', ability: 'blast_arrow', x: 20, y: 0, radius: 78 });
const end = id => ({ type: 'projectileEnd', id });
const adapt = (events, owners, w = world) => MasterySkillVfx.prototype.events.call({ projectileOwners: owners }, events, w);
for (const reverse of [false, true]) test('mixed explicit and ordinary explosions retain per-caster mastery, order=' + reverse, () => {
  const v = new MasterySkillVfx(Graphics, new Container()); v.requestSkill = () => null;
  v.projectileOwners.set(11, 2); v.projectileOwners.set(12, 3);
  const batch = reverse ? [blast(), end(11), explicit(), blast(), end(12)] : [explicit(), blast(), end(11), blast(), end(12)];
  const before = JSON.stringify({ world, batch });
  const result = v.events(batch, world);
  assert.deepEqual(result.filter(e => e.type === 'explode').map(e => e.presentationOwner), reverse ? [2, 1, 3] : [1, 2, 3]);
  assert.equal(result.find(e => e.ember20).castId, 90);
  assert.equal(result.find(e => e.ember20), batch.find(e => e.ember20));
  const levels = [];
  for (const e of result) if (e.type === 'explode') { v.event(e, world); levels.push(v.presentation.get(e.ability).level); }
  assert.deepEqual(levels, reverse ? [10, 30, 20] : [30, 10, 20]);
  assert.equal(v.projectileOwners.size, 0);
  assert.equal(JSON.stringify({ world, batch }), before);
});
for (const first of [false, true]) test('mixed same-frame shot/end journal attribution, explicit first=' + first, () => {
  const shot = { type: 'projectile', id: 2, ability: 'blast_arrow' };
  const events = first ? [explicit(), shot, blast(), end(11)] : [shot, blast(), end(11), explicit()];
  const owners = new Map();
  const out = adapt(events, owners);
  assert.equal(out.find(e => e.ability === 'blast_arrow' && e.type === 'explode').presentationOwner, 2);
  assert.equal(owners.size, 0);
});
test('host-decorated and repeated adapter passes are idempotent and maintain renderer journal', () => {
  const input = [explicit(), blast(), end(11)];
  const host = presentSkillEvents(input, world, new Map([[11, 2]]));
  const owners = new Map([[11, 3]]);
  const out = adapt(host, owners);
  assert.deepEqual(out, host);
  assert.equal(owners.size, 0);
  const repeated = adapt(out, owners);
  for (let i = 0; i < out.length; i++) assert.equal(repeated[i], out[i]);
  assert.deepEqual(adapt(input, new Map([[11, 2]])), host);
});
test('unknown owner stays unknown on repeat, never inherits explicit caster; fallback level1', () => {
  const out = adapt([explicit(), blast(), end(11)], new Map());
  const unknown = out[1];
  assert.equal(unknown.presentationOwner, undefined);
  assert.ok(Object.hasOwn(unknown, 'presentationOwner'));
  assert.equal(adapt(out, new Map([[11, 3]]))[1], unknown);
  const v = new MasterySkillVfx(Graphics, new Container()); v.requestSkill = () => null;
  v.event(unknown, world); assert.equal(v.presentation.get('blast_arrow').level, 1);
});
test('live snapshot fallback and mixed journal cleanup stay bounded over 500 frames', () => {
  const v = new MasterySkillVfx(Graphics, new Container());
  for (let i = 0; i < 500; i++) {
    const id = 100 + i;
    const live = { ...world, projectiles: [{ id, ownerId: 2 }] };
    const out = v.events([explicit(), blast(), end(id - 1)], live);
    assert.equal(v.projectileOwners.size, 1);
    assert.equal(v.projectileOwners.get(id), 2);
    if (i) assert.equal(out[1].presentationOwner, 2);
  }
  const last = v.events([explicit(), blast(), end(599)], world);
  assert.equal(last[1].presentationOwner, 2); assert.equal(v.projectileOwners.size, 0);
});

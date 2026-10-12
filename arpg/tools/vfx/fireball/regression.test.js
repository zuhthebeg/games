import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Graphics, Container } from '../../../vendor/pixi-8.22.0.min.mjs';
import { SkillVfx, effekseerEnabled } from '../../../js/render/skill-vfx.js';
import { createWorld, addPlayer, spawnMonster, startStage, step, emptyInput } from '../../../js/sim/world.js';
import { encodeSnapshot } from '../../../js/net/protocol.js';

const base = execFileSync('git', ['show', '2f94a9e:arpg/js/render/skill-vfx.js'], { encoding: 'utf8' });
const fixed = base.replace(/from '([^']+)'/g, (_, path) => `from '${new URL(path, new URL('../../../js/render/skill-vfx.js', import.meta.url)).href}'`);
const { SkillVfx: Baseline } = await import('data:text/javascript;base64,' + Buffer.from(fixed).toString('base64'));
const summary = vfx => [...vfx.effects, ...vfx.particles, ...vfx.actors, ...vfx.projectiles].map(slot => ({
  left: slot.left, id: slot.id, kind: slot.kind, visible: slot.node.visible, alpha: slot.node.alpha,
  x: slot.node.x, y: slot.node.y, rotation: slot.node.rotation, sx: slot.node.scale.x, sy: slot.node.scale.y,
  geometry: slot.node.context.instructions.map(item => ({ action: item.action,
    path: item.data.path?.instructions, color: item.data.style?.color, alpha: item.data.style?.alpha,
    width: item.data.style?.width })), 
}));

test('FX1 exact opt-in; off creates no loading task or extra sprites', () => {
  for (const search of ['', '?fx=0', '?fx=Effekseer', '?fx=other', '?dev=1']) assert.equal(effekseerEnabled(search), false);
  assert.equal(effekseerEnabled('?dev=1&fx=effekseer'), true);
  const layer = new Container(), vfx = new SkillVfx(Graphics, layer, { effekseer: false });
  const baselineLayer = new Container(); new Baseline(Graphics, baselineLayer);
  assert.equal(layer.children.length, baselineLayer.children.length);
  assert.equal(vfx.fxLoad, null); assert.equal(vfx.fxReady, false); assert.equal(vfx.fxImpacts.length, 0);
});

test('FX1 flag off: base host trace and vector drawing commands unchanged', () => {
  const run = Type => {
    const world = createWorld({ seed: 20261013 });
    addPlayer(world, { pid: 'fx1', weapon: 'focus', x: 300, y: 400, mods: { skills: ['ember_bolt'], maxMp: 200 } });
    startStage(world, 'S2');
    spawnMonster(world, 'goblin_grunt', 390, 400);
    const vfx = new Type(Graphics, new Container(), { effekseer: false });
    const hash = createHash('sha256'), drawings = [];
    for (let i = 0; i < 240; i++) {
      vfx.snapshot(world);
      const events = step(world, { fx1: { ...emptyInput(), attack: i % 60 < 20, skillEdge: i % 70 === 0, mx: Math.sin(i / 20) * .2 } });
      for (const event of events) vfx.event(event, world, false);
      vfx.update(world, 1, 1 / 30, false);
      hash.update(JSON.stringify([encodeSnapshot(world), events]));
      if (i % 12 === 0) drawings.push(JSON.stringify(summary(vfx)));
    }
    return { digest: hash.digest('hex'), drawings };
  };
  const before = run(Baseline), after = run(SkillVfx);
  assert.equal(after.digest, before.digest);
  assert.deepEqual(after.drawings, before.drawings);
  console.log(JSON.stringify({ base: '2f94a9e', hostTraceSha256: after.digest, drawingCheckpoints: after.drawings.length, flagOffEquivalent: true }));
});

test('FX1 failed metadata load retains vector fallback without rejection', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  try {
    const vfx = new SkillVfx(Graphics, new Container(), { effekseer: true });
    assert.equal(await vfx.fxLoad, false);
    assert.equal(vfx.fxReady, false); assert.match(vfx.fxError, /503/);
    assert.equal(vfx.event({ type: 'explode', ability: 'ember_bolt', x: 300, y: 400, radius: 100 }, {}, false), true);
    assert.ok(vfx.effects.some(slot => slot.left > 0));
  } finally { globalThis.fetch = original; }
});

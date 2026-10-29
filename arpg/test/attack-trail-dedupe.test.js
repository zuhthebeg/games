import test from 'node:test';
import assert from 'node:assert/strict';
import { Container } from '../vendor/pixi-8.22.0.min.mjs';
import { ArenaRenderer } from '../js/render/renderer.js';
import { VisualProvider } from '../js/render/visual-provider.js';
import { createWorld, addPlayer, startStage } from '../js/sim/world.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
import { comboDef } from '../js/sim/basic-combo.js';

test('slash trail fires once per active combo step across copied attack objects', () => {
  const world = createWorld({ seed: 11 });
  addPlayer(world, { pid: 'local', weapon: 'blade' });
  startStage(world, 'S2');
  const renderer = new ArenaRenderer({ stage: new Container(), screen: { width: 390, height: 844 } },
    new VisualProvider({ atlases: false }));
  renderer.reset(world, true);

  const renderStep = (step, frame) => {
    const snapshot = structuredClone(world);
    snapshot.tick = frame;
    snapshot.entities[0].act = {
      id: 'slash', step, phase: 'active', elapsed: frame, total: 3, left: 2, facing: 0,
      def: comboDef('slash', step, 'sword')
    };
    renderer.render(decodeSnapshot(encodeSnapshot(snapshot), 'local'), 1, 1 / 60);
  };
  for (let frame = 1; frame <= 4; frame++) renderStep(1, frame);
  assert.equal(renderer.effects.filter(effect => effect.left > 0).length, 1);
  renderStep(2, 5);
  assert.equal(renderer.effects.filter(effect => effect.left > 0).length, 2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES, STAGE_BIOMES, biomeSeed } from '../js/content/biomes.js';
import { createBiomeLayout, allowedProp, contrast, EDGE_BAND } from '../js/render/biome-layout.js';
import { STAGES } from '../js/content/combat.js';
import { DANGER_COLORS } from '../js/content/monsters.js';
import { createWorld, addPlayer, startStage } from '../js/sim/world.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';

test('all twenty stages have distinct, dark, danger-compatible biome palettes', () => {
  assert.deepEqual(Object.keys(STAGE_BIOMES).sort(), Object.keys(STAGES).sort());
  assert.ok(Object.keys(BIOMES).length >= 6);
  for (const b of Object.values(BIOMES)) {
    assert.equal(b.tiles.length, 4);
    assert.ok(b.props.length >= 6 && b.props.length <= 12);
    for (const color of [...b.tiles, b.path, b.accent, 0x403e4c])
      for (const danger of Object.values(DANGER_COLORS)) assert.ok(contrast(color, danger) >= 3, `${color.toString(16)} danger contrast`);
  }
});
for (const stageId of Object.keys(STAGES)) {
  test(`${stageId} layout is stable, covers all prop kinds and has zero forbidden footprint overlaps`, () => {
    const a = createBiomeLayout(stageId), b = createBiomeLayout(stageId);
    assert.deepEqual(a, b);
    assert.equal(a.seed, biomeSeed(stageId));
    assert.deepEqual([...new Set(a.props.map(p => p.kind))].sort(), [...BIOMES[a.id].props].sort());
    assert.ok(a.props.length === 32);
    for (const p of a.props) {
      assert.ok(allowedProp(p, a.zones, a.w, a.h), JSON.stringify(p));
      if (p.tall) assert.ok(Math.min(p.x + p.r, a.w - p.x + p.r, p.y + p.r, a.h - p.y + p.r) <= EDGE_BAND);
    }
    const world = createWorld({ seed: 593 });
    addPlayer(world, { pid: 'host' }); addPlayer(world, { pid: 'guest' }); startStage(world, stageId);
    const before = JSON.stringify(world), guest = decodeSnapshot(encodeSnapshot(world), 'guest');
    assert.deepEqual(createBiomeLayout(guest.round.stageId, guest.arena.w, guest.arena.h), a);
    assert.equal(JSON.stringify(world), before);
  });
}

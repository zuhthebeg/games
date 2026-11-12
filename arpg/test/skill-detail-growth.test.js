import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { HubUI } from '../js/ui/hub.js';
import { ABILITIES } from '../js/content/combat.js';
import { skillGrowth } from '../js/content/skill-growth.js';
import { frost20, frostDef } from '../js/sim/frost-evolution.js';
import { createWorld, addPlayer, step, emptyInput } from '../js/sim/world.js';
import { createSave } from '../js/meta/save.js';
import { BOOKS, DEFAULT_SKILLS, hasSkill } from '../js/meta/skills.js';
import { masteryLevels, setMasteryLevel } from '../js/meta/skill-mastery.js';

function saveFor(id, level, lineage = 'human') {
  const save = createSave({ name: 'detail', answers: [0, 0, 0, 0, 0], createdAt: 1 });
  save.lineage = lineage;
  save.learned = Object.keys(BOOKS);
  return setMasteryLevel(save, id, level);
}
function detail(id, save) {
  const hub = Object.assign(Object.create(HubUI.prototype), {
    save, mountSheet(html) { this.html = html; },
  });
  hub.openSkill(id);
  return hub.html;
}
function projectileRow(html) {
  const match = html.match(/사거리 ([0-9]+) px · ([0-9]+)발 · 관통 ([0-9]+)회/);
  assert.ok(match, 'projectile detail row exists');
  return { range: Number(match[1]), count: Number(match[2]), pierce: Number(match[3]) };
}
function firedProjectile(id, save) {
  const world = createWorld();
  const player = addPlayer(world, { pid: 'detail', weapon: id === 'sword_wave' ? 'blade' : 'focus',
    x: 500, y: 400, skillMasteryLevels: masteryLevels(save), mods: { skills: [id], mpRegen: 0 } });
  for (let tick = 0; tick < 60; tick++) {
    step(world, { [player.pid]: { ...emptyInput(), skillEdge: tick === 0 } });
    if (world.projectiles.length) return world.projectiles[0];
  }
  assert.fail('sim must fire ' + id);
}

for (const [level, range, targets] of [[1, 300, 2], [15, 450, 5], [30, 600, 8]]) {
  test('sword wave detail matches real projectile at mastery ' + level, () => {
    const save = saveFor('sword_wave', level), before = structuredClone(save);
    const growth = skillGrowth('sword_wave', level);
    assert.deepEqual(growth, { range, targets });
    const projectile = firedProjectile('sword_wave', save);
    // targets includes the first hit; pierce counts only additional hits.
    assert.equal(projectile.range, range);
    assert.equal(projectile.pierce, targets - 1);
    assert.deepEqual(projectileRow(detail('sword_wave', save)), { range: projectile.range, count: 1, pierce: projectile.pierce });
    assert.deepEqual(save, before, 'opening detail must not mutate save');
  });
}
for (const [level, pierce] of [[19, 2], [20, 3], [30, 3]]) {
  test('frost lance detail matches real projectile at mastery ' + level, () => {
    const save = saveFor('frost_lance', level), before = structuredClone(save);
    const def = frost20(masteryLevels(save)) ? frostDef(ABILITIES.frost_lance) : ABILITIES.frost_lance;
    assert.equal(def.projectile.pierce, pierce);
    const projectile = firedProjectile('frost_lance', save);
    assert.equal(projectile.pierce, pierce);
    assert.deepEqual(projectileRow(detail('frost_lance', save)), { range: projectile.range, count: def.projectile.count, pierce: projectile.pierce });
    assert.deepEqual(save, before, 'opening detail must not mutate save');
  });
}

// SHA-256 snapshots of complete pre-fix detail HTML, generated at 811e375a.
// Each skill includes every eligible lineage and all mastery levels 1..30.
// PF1 poison_field alone refreshed after exact pre/post comparison: only its
// common radius/duration row changes; poison-field-detail.test.js checks real zones.
const BASELINE = {
  "poison_arrow": "54fd54dc5e1ccfe312af923f2210577cb30d9d0163480046785404f7f1371430",
  "cursed_hands": "a4ea45e7617f63a60aa33320169dbfa054cf1ec9a587892a3d81b13ebe3696f7",
  "blood_spear": "1c00fafda7400d7a6c426fa28247cda599711a93c4df7430e654b2484388101d",
  "dead_explosion": "f3ae493e8a9453533894de1c12a0c2ea439e8bb25d55caa22f9aee8d8ee0e2d4",
  "poison_field": "79c89b3935fb330652cba56629f008e578cda82bfdf831035708ca99c3fe5eca",
  "curse": "9b84f8c49f27b32be63a2e3dd9692817b1f35b7b8032fa2347998a0e7ac1b7d2",
  "invisibility": "2c59838a557b40f33f5a2b6232fe3ec6b925209fed27ff3bedc51eb596758451",
  "berserk": "1656d38d7b83a63e7c37eb2d919351cfeb47fb67a41b59a289b425893d261d6f",
  "whirl": "57c66944868278b5f1f6fd8dda1116385a84ddd7eef352765a865021d373e865",
  "heavy_cleave": "2a1db3274be5bdd26058a17fc0f2adefaf4b3f15600f5413ccf7d2562e41ae16",
  "ground_slam": "f719db48281a199f689fd44bcc0950c606947673c4da2e6430c9afb2bd225dd7",
  "armor_break": "21a4b80b3b156cb22d1bdd7b0f9cbda4429c5cb4e35896c14a921d395b2981b9",
  "triple_arrow": "c288d7652f5ff539e6c8741347f881dae9164faee0f587d5ed5913c764d503e9",
  "evasion_shot": "918e582b5ea4e8ab1188638687451f80f0585ad36113dd83461b4666ad4cd44a",
  "pierce_shot": "5a4792e5d51b814efb0d0ad13cfac57a0bce5461f3cb3cf3c6658cfad0f7fe53",
  "blast_arrow": "5402a00a8ea4cb8333597359bcf79b53068eba9907179a95adceaef9c443d6d1",
  "protective_shield": "39c6997ff33be8a692a83bec0f62c5325c7207345c3a2f2aa03264466acd3fde",
  "turn_undead": "7040d4e32484e8195fb058d7a1fccff5e1eaeff484b2b16c2e53918ad1f37d6b",
  "healing_light": "c2ef5b0dae391bc4344ebce1ff046fbc648c2e447d0a08f0f98e6fc4f07d43b7",
  "rain_arrow": "c47689270b2002e0e15b2cc1f5bf5dae59629e838a1b86dc96077ae8368f2ccd",
  "spinning_shot": "a7b45c276665b40aae95fd8e69fcc0eada4b23b6ecc85f2193fb1a5c973bca62",
  "meteor": "6c65eb80494652539c4ef2e58d4ace916f884da3187d571a1fc3db35d6b6dd9c",
  "firewall": "6dacb0f2dd47aa81ffa4d3fde2d2cecc38a580690d7633e5f059a60a6937a059",
  "flame_ring": "db86d89adbfc2d97ac0eeb7289a64c5020765c5eb03f6827b85daac3e141f761",
  "lunge": "c69e4e317bdbac152e4eb31a09fb07b726e1b7b590815e16d725806124f7ffa2",
  "volley": "2f75166072229214dd834b8a710489290ee3f8cebac5982524d475edb74e5963",
  "ember_bolt": "af6fd6c87ff537e718800c162df41a955de718ae51cb6f2c234c7dbb55860983"
};
for (const [id, expected] of Object.entries(BASELINE)) {
  test((id === 'poison_field' ? 'PF1 exact full detail HTML: ' : 'unchanged full detail HTML: ') + id, () => {
    const html = [];
    for (const lineage of ['human', 'skeleton_knight', 'skeleton_mage', 'skeleton_archer']) {
      for (let level = 1; level <= 30; level++) {
        const save = saveFor(id, level, lineage);
        if (hasSkill(save, id)) html.push([lineage, level, detail(id, save)]);
      }
    }
    assert.equal(createHash('sha256').update(JSON.stringify(html)).digest('hex'), expected);
  });
}
test('snapshots cover every other learnable or default skill', () => {
  assert.deepEqual(Object.keys(BASELINE).sort(), [...new Set([...Object.keys(BOOKS), ...Object.values(DEFAULT_SKILLS)])]
    .filter(id => !['sword_wave', 'frost_lance'].includes(id)).sort());
});

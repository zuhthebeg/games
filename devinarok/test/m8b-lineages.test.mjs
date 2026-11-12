import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isEvolved, isSkeletonLineage, LINEAGE_CHANGE_COST, LINEAGE_EVOLVE_LEVEL,
  LINEAGE_EVOLVE_STAGE, LINEAGES, lineageAllowsFamily, lineageChangeCost, lineageDisplayName, lineageOf,
} from '../js/content/lineages.js';
import { applyOperations, normalizeCharacter } from '../js/save/ops.js';
import { BUTTONS, createStageWorld, playerStrike, step } from '../js/sim/world.js';
import { decodeMessage, encodeMessage } from '../js/net/protocol.js';

const LINEAGE_IDS = Object.keys(LINEAGES);

function create(lineage = 'human') {
  return applyOperations(null, {}, [
    { type: 'createCharacter', name: '모험가', kind: 'knight', lineage },
  ], 'hero');
}

function apply(state, operations) {
  return applyOperations(state.character, state.items, operations, 'hero');
}

test('lineage helpers normalize legacy saves and derive evolution from level and R10', () => {
  assert.equal(LINEAGE_EVOLVE_LEVEL, 20);
  assert.equal(LINEAGE_EVOLVE_STAGE, 'R10');
  assert.equal(lineageOf({}), 'human');
  assert.equal(lineageOf({ lineage: 'unknown' }), 'human');
  assert.equal(isSkeletonLineage('human'), false);
  assert.equal(isSkeletonLineage('skeleton_knight'), true);
  assert.equal(isEvolved({ lineage: 'human', level: 20, clearedStages: ['R10'] }), false);
  assert.equal(isEvolved({ lineage: 'skeleton_knight', level: 19, clearedStages: ['R10'] }), false);
  assert.equal(isEvolved({ lineage: 'skeleton_knight', level: 20, clearedStages: [] }), false);
  for (const lineage of LINEAGE_IDS.filter((id) => id !== 'human')) {
    assert.equal(isEvolved({ lineage, level: 20, clearedStages: ['R10'] }), true);
  }
  assert.deepEqual(
    [normalizeCharacter({}).lineage, normalizeCharacter({}).lineageChanges],
    ['human', 0],
  );
});

test('lineage family access and change costs follow the content table', () => {
  assert.equal(lineageAllowsFamily('human', 'sword'), true);
  assert.equal(lineageAllowsFamily('human', 'crossbow'), true);
  assert.equal(lineageAllowsFamily('skeleton_knight', 'sword'), true);
  assert.equal(lineageAllowsFamily('skeleton_knight', 'staff'), false);
  assert.equal(lineageAllowsFamily('skeleton_archer', 'crossbow'), true);
  assert.equal(lineageAllowsFamily('skeleton_mage', 'staff'), true);
  assert.equal(lineageAllowsFamily('unknown', 'sword'), false);
  assert.equal(lineageChangeCost({}), 0);
  assert.equal(lineageChangeCost({ lineageChanges: 1 }), LINEAGE_CHANGE_COST);
});

test('character creation accepts known lineages and rejects unknown ids', () => {
  for (const lineage of LINEAGE_IDS) {
    const { character } = create(lineage);
    assert.equal(character.kind, 'knight');
    assert.equal(character.lineage, lineage);
    assert.equal(character.lineageChanges, 0);
  }
  assert.equal(create().character.lineage, 'human');
  assert.throws(() => create('unknown'), TypeError);
});

test('lineage changes are allowed before a weapon is equipped', () => {
  const state = apply(create(), [{ type: 'changeLineage', lineage: 'skeleton_knight' }]);
  assert.equal(state.character.lineage, 'skeleton_knight');
  assert.equal(state.character.equipment.weapon, null);
  assert.equal(state.character.lineageChanges, 1);
});

test('lineage changes enforce weapon family, first-free cost, and later gold cost', () => {
  let state = create();
  state = apply(state, [
    { type: 'grantItem', uid: 'sword', itemId: 'rusted-sword' },
    { type: 'equip', uid: 'sword', slot: 'weapon' },
    { type: 'grantGold', amount: LINEAGE_CHANGE_COST },
  ]);
  state = apply(state, [{ type: 'changeLineage', lineage: 'skeleton_knight' }]);
  assert.equal(state.character.lineage, 'skeleton_knight');
  assert.equal(state.character.lineageChanges, 1);
  assert.equal(state.character.gold, LINEAGE_CHANGE_COST);
  assert.throws(() => apply(state, [{ type: 'changeLineage', lineage: 'skeleton_knight' }]), RangeError);
  assert.throws(() => apply(state, [{ type: 'changeLineage', lineage: 'skeleton_archer' }]), /weapon-family/);

  state = apply(state, [{ type: 'changeLineage', lineage: 'human' }]);
  assert.equal(state.character.lineageChanges, 2);
  assert.equal(state.character.gold, 0);
  assert.throws(() => apply(state, [{ type: 'changeLineage', lineage: 'skeleton_knight' }]), /Not enough gold/);
  assert.throws(() => apply(state, [{ type: 'changeLineage', lineage: 'unknown' }]), TypeError);
});

test('equipping a weapon outside the current lineage family is rejected', () => {
  let state = create('skeleton_knight');
  state = apply(state, [
    { type: 'grantItem', uid: 'crossbow', itemId: 'rusted-crossbow' },
    { type: 'grantItem', uid: 'sword', itemId: 'rusted-sword' },
  ]);
  assert.throws(
    () => apply(state, [{ type: 'equip', uid: 'crossbow', slot: 'weapon' }]),
    /weapon-family/,
  );
  state = apply(state, [{ type: 'equip', uid: 'sword', slot: 'weapon' }]);
  assert.equal(state.character.equipment.weapon, 'sword');
});

test('resetCharacter restores human lineage and the free-change state', () => {
  let state = create('skeleton_mage');
  state = apply(state, [
    { type: 'grantItem', uid: 'staff', itemId: 'apprentice-wand' },
    { type: 'equip', uid: 'staff', slot: 'weapon' },
    { type: 'changeLineage', lineage: 'human' },
    { type: 'resetCharacter' },
  ]);
  assert.equal(state.character.lineage, 'human');
  assert.equal(state.character.lineageChanges, 0);
});

test('unarmed skeletons use their lineage family for mastery and talents', () => {
  const world = createStageWorld({
    seed: 8,
    stageId: 'C1',
    character: {
      lineage: 'skeleton_archer',
      mastery: { pierce: 100000 },
      talents: { sword: {}, crossbow: { 'cb-eye': 1 }, staff: {} },
    },
  });
  const archer = playerIn(world);
  assert.equal(archer.family, 'crossbow');
  assert.ok(archer.masteryRanks[1] > 0);
  assert.equal(archer.stats.critChance, 6.2);
});

function playerIn(world, playerId = 'hero') {
  return world.entities.find((entity) => entity.kind === 'player' && entity.playerId === playerId);
}

function lethalHit(world, player) {
  const enemy = world.entities.find((entity) => entity.kind === 'enemy' && !entity.dead);
  enemy.attack = 10000;
  world.pendingHits.push({
    resolveTick: world.tick + 1,
    sourceId: enemy.id,
    targetId: player.id,
    shape: { type: 'circle', originX: player.x - 1, originZ: player.z, radius: 2 },
    motionMult: 1000,
  });
  step(world, { [player.playerId]: { seq: world.tick + 1, moveX: 0, moveZ: 0, aim: 0, buttons: 0 } });
}

test('skeletons revive once per sortie before solo death or party downing', () => {
  const humanWorld = createStageWorld({ seed: 7, stageId: 'C1' });
  const human = playerIn(humanWorld);
  human.hp = 1;
  lethalHit(humanWorld, human);
  assert.equal(humanWorld.outcome, 'death');
  assert.equal(human.boneRevivalReady, false);

  const solo = createStageWorld({
    seed: 1, stageId: 'C1', character: { lineage: 'skeleton_knight' },
  });
  const hero = playerIn(solo);
  hero.hp = 1;
  lethalHit(solo, hero);
  assert.equal(hero.hp, Math.round(hero.maxHp * 0.3));
  assert.equal(hero.boneRevivalReady, false);
  assert.ok(hero.iFrames >= 45);
  assert.equal(solo.events.some((event) => event.type === 'boneRevival'), true);
  hero.iFrames = 0;
  hero.hp = 1;
  lethalHit(solo, hero);
  assert.equal(solo.outcome, 'death');

  const party = createStageWorld({
    seed: 2,
    stageId: 'C1',
    party: [
      { playerId: 'skeleton', character: { lineage: 'skeleton_mage' } },
      { playerId: 'human', character: { lineage: 'human' } },
    ],
  });
  const skeleton = playerIn(party, 'skeleton');
  skeleton.hp = 1;
  lethalHit(party, skeleton);
  assert.equal(skeleton.boneRevivalReady, false);
  assert.equal(skeleton.downed, false);
  skeleton.iFrames = 0;
  skeleton.hp = 1;
  lethalHit(party, skeleton);
  assert.equal(skeleton.downed, true);
});

test('evolved counter and mage passives trigger once per successful action/cast', () => {
  const knightWorld = createStageWorld({
    seed: 3, stageId: 'C1',
    character: { lineage: 'skeleton_knight', level: 20, clearedStages: ['R10'] },
  });
  const knight = playerIn(knightWorld);
  knight.hp = knight.maxHp - 50;
  const knightEnemies = knightWorld.entities.filter((entity) => entity.kind === 'enemy' && !entity.dead);
  knightEnemies.slice(2).forEach((enemy) => { enemy.dead = true; });
  knightEnemies.slice(0, 2).forEach((enemy, index) => {
    enemy.spawnTicksLeft = 0;
    enemy.invulnerable = false;
    enemy.x = knight.x + 0.5 + index * 0.2;
    enemy.z = knight.z;
  });
  playerStrike(knightWorld, knight, {
    type: 'circle', originX: knight.x, originZ: knight.z, radius: 2,
  }, 1, 'counter-1', [], 'counter', { rewind: false });
  assert.equal(knight.hp, knight.maxHp - 50 + Math.round(knight.maxHp * 0.08));

  const mageWorld = createStageWorld({
    seed: 4, stageId: 'C1',
    character: { lineage: 'skeleton_mage', level: 20, clearedStages: ['R10'] },
  });
  const mage = playerIn(mageWorld);
  mage.stats.attack = 10000;
  mage.skillCooldowns = { 1: 60, 2: 60, 3: 40, 4: 20 };
  const mageEnemies = mageWorld.entities.filter((entity) => entity.kind === 'enemy' && !entity.dead);
  mageEnemies.slice(2).forEach((enemy) => { enemy.dead = true; });
  mageEnemies.slice(0, 2).forEach((enemy, index) => {
    enemy.spawnTicksLeft = 0;
    enemy.invulnerable = false;
    enemy.hp = 1;
    enemy.x = mage.x + 0.5 + index * 0.2;
    enemy.z = mage.z;
  });
  playerStrike(mageWorld, mage, {
    type: 'circle', originX: mage.x, originZ: mage.z, radius: 2,
  }, 1, 'mage-cast', [], 1, { rewind: false });
  assert.deepEqual(mage.skillCooldowns, { 1: 60, 2: 30, 3: 10, 4: 0 });
});

test('fixed snapshots retain lineage, evolution, and revival readiness', () => {
  const world = createStageWorld({
    seed: 5, stageId: 'C1',
    character: { lineage: 'skeleton_archer', level: 20, clearedStages: ['R10'] },
  });
  const player = playerIn(world);
  const snapshot = decodeMessage(encodeMessage({
    t: 'snap', full: true, ents: [{
      id: player.id, kind: 'player', lineage: player.lineage, evolved: player.evolved,
      boneRevivalReady: player.boneRevivalReady,
      lastLichCooldownCastId: 'cast-1',
    }],
  }));
  assert.equal(snapshot.ents[0].lineage, 'skeleton_archer');
  assert.equal(snapshot.ents[0].evolved, true);
  assert.equal(snapshot.ents[0].boneRevivalReady, true);
  assert.equal(snapshot.ents[0].lastLichCooldownCastId, 'cast-1');
});

test('evolved archer gains two pierce shots from a perfect dodge', () => {
  const world = createStageWorld({
    seed: 6, stageId: 'C1',
    character: { lineage: 'skeleton_archer', level: 20, clearedStages: ['R10'] },
  });
  const archer = playerIn(world);
  step(world, { hero: { seq: 1, moveX: 0, moveZ: 0, aim: 0, buttons: BUTTONS.DODGE } });
  const enemy = world.entities.find((entity) => entity.kind === 'enemy' && !entity.dead);
  world.pendingHits.push({
    resolveTick: world.tick + 1,
    sourceId: enemy.id,
    targetId: archer.id,
    shape: { type: 'circle', originX: archer.x - 1, originZ: archer.z, radius: 2 },
    motionMult: 1,
  });
  step(world, { hero: { seq: 2, moveX: 0, moveZ: 0, aim: 0, buttons: BUTTONS.DODGE } });
  assert.equal(world.events.some((event) => event.type === 'perfectDodge'), true);
  assert.equal(archer.pierceShotsRemaining, 2);
  assert.equal(
    lineageDisplayName('아린', { lineage: 'skeleton_mage', level: 20, clearedStages: ['R10'] }),
    '아린 · 리치',
  );
  assert.equal(lineageDisplayName('아린', { lineage: 'skeleton_mage', evolved: true }), '아린 · 리치');
});

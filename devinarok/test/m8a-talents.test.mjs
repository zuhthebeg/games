import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RIFT_BOSS_TALENT_FLOORS, TALENT_MAX_RANK, normalizedTalents,
  talentPoints, talentResetCost, talentSpent, talentsWithinBudget,
} from '../js/content/talents.js';
import { applyOperations, normalizeCharacter } from '../js/save/ops.js';
import { calculatePlayerStats } from '../js/sim/world.js';

function makeCharacter() {
  return applyOperations(null, {}, [
    { type: 'createCharacter', name: '모험가', kind: 'knight' },
  ], 'hero');
}

function apply(character, operations) {
  return applyOperations(character, {}, operations, 'hero').character;
}

function allocateRanks(family, talentId, count) {
  return Array.from({ length: count }, () => ({ type: 'allocateTalent', family, talentId }));
}

test('talent point budget follows level and rift boss first clears', () => {
  assert.deepEqual(RIFT_BOSS_TALENT_FLOORS, [5, 10, 15, 20, 25, 30]);
  assert.equal(talentPoints({ level: 1 }), 0);
  assert.equal(talentPoints({ level: 20 }), 19);
  assert.equal(talentPoints({ level: 20, clearedStages: ['R5', 'R10'] }), 21);
  assert.equal(talentPoints({ level: 20, clearedStages: RIFT_BOSS_TALENT_FLOORS.map((floor) => `R${floor}`) }), 25);
  assert.equal(talentPoints({ level: 99 }), 19);
  assert.equal(talentResetCost(20), 1000);
});

test('talent normalization keeps only known family ids and ranks one through five', () => {
  assert.deepEqual(normalizedTalents({
    sword: {
      'sw-vigor': 3,
      'cb-eye': 4,
      unknown: 2,
      'sw-edge': 0,
      'sw-counter': 6,
      'sw-bulwark': 1.5,
    },
    crossbow: { 'cb-eye': 5 },
    staff: ['st-focus'],
    unknown: { arbitrary: 3 },
  }), {
    sword: { 'sw-vigor': 3 },
    crossbow: { 'cb-eye': 5 },
    staff: {},
  });
  assert.deepEqual(normalizeCharacter({}).talents, { sword: {}, crossbow: {}, staff: {} });
});

test('talent allocation enforces family ids, rank cap, and per-family budget', () => {
  let character = apply(makeCharacter().character, [{ type: 'setLevel', level: 6 }]);
  for (let rank = 0; rank < TALENT_MAX_RANK; rank += 1) {
    character = apply(character, [{ type: 'allocateTalent', family: 'sword', talentId: 'sw-vigor' }]);
  }
  assert.equal(character.talents.sword['sw-vigor'], 5);
  assert.equal(talentSpent(character.talents, 'sword'), 5);
  assert.equal(talentsWithinBudget(character), true);
  assert.throws(
    () => apply(character, [{ type: 'allocateTalent', family: 'sword', talentId: 'sw-vigor' }]),
    RangeError,
  );
  assert.throws(
    () => apply(makeCharacter().character, [{ type: 'allocateTalent', family: 'sword', talentId: 'sw-vigor' }]),
    /budget/,
  );
  assert.throws(
    () => apply(character, [{ type: 'allocateTalent', family: 'sword', talentId: 'unknown' }]),
    TypeError,
  );
  assert.throws(
    () => apply(character, [{ type: 'allocateTalent', family: 'sword', talentId: 'cb-eye' }]),
    TypeError,
  );
});

test('talent reset charges the level cost and clears only the selected family', () => {
  let character = makeCharacter().character;
  character = apply(character, [
    { type: 'setLevel', level: 20 },
    { type: 'grantGold', amount: 1200 },
    { type: 'allocateTalent', family: 'sword', talentId: 'sw-vigor' },
    { type: 'allocateTalent', family: 'sword', talentId: 'sw-edge' },
    { type: 'allocateTalent', family: 'crossbow', talentId: 'cb-eye' },
  ]);
  character = apply(character, [{ type: 'resetTalents', family: 'sword' }]);
  assert.deepEqual(character.talents, { sword: {}, crossbow: { 'cb-eye': 1 }, staff: {} });
  assert.equal(character.gold, 200);
  assert.throws(() => apply(character, [{ type: 'resetTalents', family: 'sword' }]), /No talent points/);
  assert.throws(
    () => apply({ ...character, gold: 0 }, [{ type: 'resetTalents', family: 'crossbow' }]),
    /Not enough gold/,
  );
});

test('debug level and progress resets clear talents when the budget shrinks', () => {
  let character = makeCharacter().character;
  character = apply(character, [
    { type: 'setLevel', level: 20 },
    { type: 'clearStage', stageId: 'R5' },
    ...allocateRanks('sword', 'sw-vigor', 5),
    ...allocateRanks('sword', 'sw-edge', 5),
    ...allocateRanks('sword', 'sw-counter', 5),
    ...allocateRanks('sword', 'sw-bulwark', 5),
  ]);
  assert.equal(talentSpent(character.talents, 'sword'), 20);
  character = apply(character, [{ type: 'resetProgress' }]);
  assert.deepEqual(character.talents, { sword: {}, crossbow: {}, staff: {} });

  character = makeCharacter().character;
  character = apply(character, [
    { type: 'setLevel', level: 20 },
    ...allocateRanks('sword', 'sw-vigor', 5),
    ...allocateRanks('sword', 'sw-edge', 5),
    ...allocateRanks('sword', 'sw-counter', 5),
    ...allocateRanks('sword', 'sw-bulwark', 4),
  ]);
  assert.equal(talentSpent(character.talents, 'sword'), 19);
  character = apply(character, [{ type: 'setLevel', level: 5 }]);
  assert.deepEqual(character.talents, { sword: {}, crossbow: {}, staff: {} });
});

test('resetCharacter clears talents that exceed the reset character budget', () => {
  let character = makeCharacter().character;
  character = apply(character, [
    { type: 'setLevel', level: 20 },
    ...allocateRanks('sword', 'sw-vigor', 1),
    ...allocateRanks('sword', 'sw-edge', 1),
    ...allocateRanks('sword', 'sw-counter', 1),
    ...allocateRanks('sword', 'sw-bulwark', 1),
  ]);
  character = apply(character, [{ type: 'resetCharacter' }]);
  assert.deepEqual(character.talents, { sword: {}, crossbow: {}, staff: {} });
});

test('family talents scale stats and ignore allocations for another family', () => {
  const noTalents = calculatePlayerStats(1, []);
  const swordTalents = calculatePlayerStats(1, [], {
    sword: { 'sw-vigor': 5, 'sw-edge': 5 },
    crossbow: {},
    staff: { 'st-focus': 5 },
  });
  assert.equal(swordTalents.maxHp, Math.round(noTalents.maxHp * 1.15));
  assert.equal(swordTalents.attack, Math.round(noTalents.attack * 1.1));
  assert.equal(swordTalents.skillCooldownReduction, 0);
  const staffOnly = calculatePlayerStats(1, [], {
    sword: {},
    crossbow: {},
    staff: { 'st-focus': 5 },
  });
  assert.equal(staffOnly.attack, noTalents.attack);

  const crossbow = [{ itemId: 'rusted-crossbow' }];
  const crossbowBase = calculatePlayerStats(1, crossbow);
  const crossbowTalents = calculatePlayerStats(1, crossbow, {
    sword: { 'sw-edge': 5 },
    crossbow: { 'cb-bolt': 5 },
    staff: {},
  });
  assert.equal(crossbowTalents.attack, Math.round(crossbowBase.attack * 1.1));
  const otherFamilyOnly = calculatePlayerStats(1, crossbow, {
    sword: { 'sw-edge': 5 },
    crossbow: {},
    staff: {},
  });
  assert.equal(otherFamilyOnly.attack, crossbowBase.attack);
});

test('dodge cooldown reduction from talents and equipment is capped at 60', () => {
  const stats = calculatePlayerStats(1, [
    { itemId: 'rusted-crossbow' },
    { affixes: [{ id: 'dodgeCooldownReduction', value: 60 }] },
  ], {
    sword: {},
    crossbow: { 'cb-evade': 5 },
    staff: {},
  });
  assert.equal(stats.dodgeCooldownReduction, 60);
});

test('counter damage from sword talents stacks with the guardian set bonus', () => {
  const stats = calculatePlayerStats(20, [
    { itemId: 'oath-sword' },
    { itemId: 'oath-helm' },
    { itemId: 'oath-plate' },
    { itemId: 'oath-gauntlets' },
  ], {
    sword: { 'sw-counter': 5 },
    crossbow: {},
    staff: {},
  });
  assert.equal(stats.counterDamagePct, 80);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { AFFIXES } from '../js/content/affixes.js';
import { rollAffixValue } from '../js/content/affix-value.js';
import { contractDescription, contractRewards, dailyContracts, kstDateKey } from '../js/content/contracts.js';
import { ENEMIES } from '../js/content/enemies.js';
import { DIFFICULTIES, isStageUnlocked, STAGES } from '../js/content/stages.js';

test('KST date keys use a fixed UTC+9 offset', () => {
  assert.equal(kstDateKey(Date.UTC(2026, 0, 1, 14, 59, 59)), '2026-01-01');
  assert.equal(kstDateKey(Date.UTC(2026, 0, 1, 15, 0, 0)), '2026-01-02');
});

test('daily contracts are deterministic, dated, tiered, and use distinct types', () => {
  const character = { level: 8, clearedStages: ['C1', 'C2', 'C3'] };
  const contracts = dailyContracts('hero-1', '2026-01-02', character);
  assert.deepEqual(contracts, dailyContracts('hero-1', '2026-01-02', character));
  assert.notDeepEqual(contracts, dailyContracts('hero-1', '2026-01-03', character));
  assert.deepEqual(contracts.map(({ id }) => id), ['2026-01-02:0', '2026-01-02:1', '2026-01-02:2']);
  assert.deepEqual(contracts.map(({ tier }) => tier), ['easy', 'normal', 'hard']);
  assert.equal(new Set(contracts.map(({ type }) => type)).size, 3);
  assert.deepEqual(contracts[0].rewards, { gold: 104, essence: 2, soul: 0 });
  assert.deepEqual(contracts[2].rewards, { gold: 286, essence: 6, soul: 1 });
  assert.ok(contracts.every((contract) => contractDescription(contract)));
});

test('contracts use only unlocked stages and non-boss enemy kinds', () => {
  const character = { level: 4, clearedStages: [] };
  const contracts = dailyContracts('new-character', '2026-02-01', character);
  assert.ok(contracts.every(({ difficulty }) => difficulty === 'normal'));
  assert.ok(contracts.every(({ type }) => type !== 'noPotion'));
  for (const contract of contracts) {
    if (contract.type === 'kills') {
      const rule = ENEMIES[contract.enemyKind];
      assert.ok(rule);
      assert.notEqual(rule.behavior, 'boss-patterns');
      assert.ok(STAGES.C1.rooms.some((room) => room.waves.some(({ enemy }) => enemy === contract.enemyKind)));
    }
    if (contract.type === 'clear' || contract.type === 'noPotion') {
      assert.ok(isStageUnlocked(contract.stageId, character.clearedStages, contract.difficulty));
    }
  }
});

test('hard clear prefers latestStage and no-potion is only selected with an unlocked boss', () => {
  const character = { level: 10, clearedStages: ['C1', 'C2', 'C3'] };
  const bySeed = Array.from({ length: 100 }, (_, index) => dailyContracts(`hero-${index}`, '2026-03-01', character));
  const noPotion = bySeed.flat().find((contract) => contract.type === 'noPotion');
  assert.ok(noPotion);
  assert.ok(STAGES[noPotion.stageId].boss);
  assert.ok(bySeed.flat().filter((contract) => contract.type === 'clear' && contract.tier === 'hard')
    .every((contract) => contract.stageId === 'CB'));
  assert.equal(DIFFICULTIES.normal.label, '보통');
});

test('contract rewards and shared affix value formula match authored ranges', () => {
  assert.deepEqual(contractRewards('normal', 5), { gold: 140, essence: 4, soul: 0 });
  assert.deepEqual(contractRewards('hard', 1), { gold: 132, essence: 6, soul: 1 });
  for (const [id, range] of Object.entries(AFFIXES)) {
    const low = rollAffixValue(id, 7, 0);
    const high = rollAffixValue(id, 7, 0.999);
    assert.equal(low, Math.round(range.min + range.perIlvl * 7));
    assert.equal(high, Math.round(range.min + 0.999 * (range.max - range.min) + range.perIlvl * 7));
  }
});

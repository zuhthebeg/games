import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictError, MemoryBackend, SaveRepository } from '../js/save/repository.js';
import { applyOperations } from '../js/save/ops.js';
import { createTutorialState, resolveTutorialSortie } from '../js/ui/tutorial.js';

async function repository(seed) {
  const repo = new SaveRepository(new MemoryBackend(seed));
  await repo.initialize();
  return repo;
}

test('save commits validate currency, item ownership, slots, and revisions', async () => {
  const repo = await repository();
  await repo.commit({ characterId: 'hero', baseRev: 0, ops: [{ type: 'createCharacter', name: '기사', kind: 'knight' }] });
  const character = await repo.loadCharacter('hero');
  assert.equal(character.rev, 1);
  await assert.rejects(
    repo.commit({ characterId: 'hero', baseRev: 1, ops: [{ type: 'spendGold', amount: 1 }] }),
    /negative/,
  );
  await assert.rejects(
    repo.commit({ characterId: 'hero', baseRev: 1, ops: [{ type: 'equip', uid: 'foreign', slot: 'weapon' }] }),
    /owned/,
  );
  assert.throws(
    () => applyOperations(character, { owned: { uid: 'owned', characterId: 'hero' } }, [{ type: 'equip', uid: 'owned', slot: 'ring' }], 'hero'),
    /slot/,
  );
  await assert.rejects(
    repo.commit({ characterId: 'hero', baseRev: 0, ops: [{ type: 'gainXp', amount: 1 }] }),
    ConflictError,
  );

  const updated = await repo.commit({
    characterId: 'hero',
    baseRev: 1,
    ops: [
      { type: 'grantGold', amount: 10 },
      { type: 'spendGold', amount: 3 },
      { type: 'gainXp', amount: 120 },
      { type: 'grantItem', uid: 'sword-1', itemId: 'iron-sword', rarity: 'common', enhance: 0, affixes: [] },
      { type: 'equip', uid: 'sword-1', slot: 'weapon' },
      { type: 'clearStage', stageId: 'trial-room' },
    ],
  });
  assert.equal(updated.rev, 2);
  assert.equal(updated.gold, 7);
  assert.equal(updated.level, 2);
  assert.equal(updated.equipment.weapon, 'sword-1');
  assert.equal((await repo.backend.readData()).ledger.at(-1).rev, 2);
});

test('settlement commits are idempotent across a retry after an uncertain response', async () => {
  const repo = await repository();
  await repo.commit({ characterId: 'hero', baseRev: 0, ops: [{ type: 'createCharacter', name: '재시도', kind: 'knight' }] });
  const first = await repo.commit({
    characterId: 'hero',
    baseRev: 1,
    idempotencyKey: 'sortie-1',
    ops: [{ type: 'grantGold', amount: 75 }, { type: 'gainXp', amount: 12 }],
  });
  const retry = await repo.commit({
    characterId: 'hero',
    baseRev: first.rev,
    idempotencyKey: 'sortie-1',
    ops: [{ type: 'grantGold', amount: 75 }, { type: 'gainXp', amount: 12 }],
  });
  assert.equal(retry.rev, first.rev);
  assert.equal(retry.gold, 75);
  assert.equal(retry.xp, 12);
  assert.equal((await repo.backend.readData()).ledger.filter((entry) => entry.idempotencyKey === 'sortie-1').length, 1);
});

test('legacy schema migration backs up source and import/export verifies checksum', async () => {
  const legacy = {
    meta: { schemaVersion: 0, localAccountId: 'local-old' },
    characters: {},
    items: {},
    ledger: [],
    backups: [],
  };
  const repo = await repository(legacy);
  const migrated = await repo.backend.readData();
  assert.equal(migrated.meta.schemaVersion, 4);
  assert.equal(migrated.backups.length, 4);
  assert.equal(migrated.backups[0].data.meta.schemaVersion, 0);

  await repo.commit({ characterId: 'hero', baseRev: 0, ops: [{ type: 'createCharacter', name: '시험자', kind: 'knight' }] });
  const exported = await repo.export();
  const target = await repository();
  await target.import(exported);
  assert.equal((await target.loadCharacter('hero')).name, '시험자');
  assert.ok((await target.backend.readData()).backups.length > 0);
  const tampered = structuredClone(exported);
  tampered.data.characters[0].gold = 999;
  await assert.rejects(target.import(tampered), /checksum/);
});

test('migrated veterans skip tutorial and keep the selected sortie stage', async () => {
  const repo = await repository({
    meta: { schemaVersion: 3, localAccountId: 'local-v3' },
    characters: {
      veteran: {
        id: 'veteran',
        name: 'Veteran',
        level: 14,
        clearedStages: ['CB'],
        tutorial: { step: 'board', completed: false, skipped: false, combatComplete: false },
      },
    },
    items: {},
    ledger: [],
    backups: [],
  });
  const veteran = await repo.loadCharacter('veteran');
  const tutorial = createTutorialState(veteran.tutorial);

  assert.deepEqual(veteran.tutorial, { step: 'done', completed: true, skipped: false, combatComplete: true });
  assert.equal(tutorial.active, false);
  assert.deepEqual(resolveTutorialSortie('F1', tutorial), { stageId: 'F1', beginCombat: false });
});

test('migrated level-one characters without clears start the tutorial', async () => {
  const repo = await repository({
    meta: { schemaVersion: 3, localAccountId: 'local-v3' },
    characters: {
      novice: { id: 'novice', name: 'Novice', level: 1, clearedStages: [] },
    },
    items: {},
    ledger: [],
    backups: [],
  });
  const novice = await repo.loadCharacter('novice');
  const tutorial = createTutorialState(novice.tutorial);

  assert.deepEqual(novice.tutorial, { step: 'board', completed: false, skipped: false, combatComplete: false });
  assert.equal(tutorial.active, true);
  assert.deepEqual(resolveTutorialSortie('C1', tutorial), { stageId: 'C1', beginCombat: true });
});

test('new characters start the tutorial through the create operation', () => {
  const created = applyOperations(null, {}, [
    { type: 'createCharacter', name: '새 모험가', kind: 'knight' },
  ], 'new-character');
  const tutorial = createTutorialState(created.character.tutorial);

  assert.deepEqual(created.character.tutorial, { step: 'board', completed: false, skipped: false, combatComplete: false });
  assert.equal(tutorial.active, true);
  assert.deepEqual(resolveTutorialSortie('C1', tutorial), { stageId: 'C1', beginCombat: true });
});

test('M1 potion, sale, and enhancement operations enforce limits and settled rolls', () => {
  const created = applyOperations(null, {}, [{ type: 'createCharacter', name: '강화자', kind: 'knight' }], 'hero');
  const state = applyOperations(created.character, created.items, [
    { type: 'grantGold', amount: 500 },
    { type: 'buyPotion', count: 2 },
    { type: 'grantItem', uid: 'blade', itemId: 'rusted-sword', rarity: 'rare', ilvl: 1 },
    { type: 'equip', uid: 'blade', slot: 'weapon' },
    { type: 'enhanceItem', uid: 'blade', roll: 0 },
  ], 'hero');
  assert.equal(state.character.potions, 2);
  assert.equal(state.items.blade.enhance, 1);
  assert.equal(state.character.gold, 410);
  assert.throws(() => applyOperations(state.character, state.items, [{ type: 'buyPotion', count: 4 }], 'hero'), /carry limit/);
  assert.throws(() => applyOperations(state.character, state.items, [{ type: 'sellItem', uid: 'blade' }], 'hero'), /Equipped/);
});

test('enhancement cost and success thresholds match every settled rank', () => {
  const rates = [100, 100, 95, 90, 80, 70, 60, 50, 40, 30];
  const base = applyOperations(null, {}, [{ type: 'createCharacter', name: '강화표', kind: 'knight' }], 'hero');
  for (let rank = 0; rank < rates.length; rank += 1) {
    const cost = 40 * (rank + 1) ** 2;
    const funded = applyOperations(base.character, {}, [
      { type: 'grantGold', amount: cost },
      { type: 'grantItem', uid: `success-${rank}`, itemId: 'rusted-sword', rarity: 'common', ilvl: 1, enhance: rank },
    ], 'hero');
    const success = applyOperations(funded.character, funded.items, [
      { type: 'enhanceItem', uid: `success-${rank}`, roll: rates[rank] * 100 - 1 },
    ], 'hero');
    assert.equal(success.items[`success-${rank}`].enhance, rank + 1);
    assert.equal(success.character.gold, 0);

    if (rates[rank] < 100) {
      const failFunded = applyOperations(base.character, {}, [
        { type: 'grantGold', amount: cost },
        { type: 'grantItem', uid: `failure-${rank}`, itemId: 'rusted-sword', rarity: 'common', ilvl: 1, enhance: rank },
      ], 'hero');
      const failure = applyOperations(failFunded.character, failFunded.items, [
        { type: 'enhanceItem', uid: `failure-${rank}`, roll: rates[rank] * 100 },
      ], 'hero');
      assert.equal(failure.items[`failure-${rank}`].enhance, rank);
      assert.equal(failure.character.gold, 0);
    }
  }
});

test('selling a set item uses its set rarity value', () => {
  const state = applyOperations(null, {}, [
    { type: 'createCharacter', name: '세트판매', kind: 'knight' },
    { type: 'grantItem', uid: 'set-blade', itemId: 'oath-sword', rarity: 'set', ilvl: 15 },
    { type: 'sellItem', uid: 'set-blade' },
  ], 'hero');

  assert.equal(state.character.gold, Math.round(150 * 2.5));
  assert.equal(state.items['set-blade'], undefined);
});

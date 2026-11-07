import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictError, MemoryBackend, SaveRepository } from '../js/save/repository.js';
import { applyOperations } from '../js/save/ops.js';

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
  assert.equal(migrated.meta.schemaVersion, 1);
  assert.equal(migrated.backups.length, 1);
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

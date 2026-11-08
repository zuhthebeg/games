import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { createTapToggle, initializeDebugMode, persistDebugMode } from '../js/core/debug-toggle.js';
import { debugKillEnemy } from '../js/debug/combat.js';
import { loadRecentActions, partyActionReason, recordRecentAction, TwoTapGate } from '../js/debug/state.js';
import { applyOperations, normalizeCharacter } from '../js/save/ops.js';
import { createStageWorld } from '../js/sim/world.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

test('debug query and five-tap toggle persist enable and disable state', () => {
  const storage = memoryStorage();
  assert.equal(initializeDebugMode('?debug=1', storage), true);
  assert.equal(storage.getItem('devinarok.debug'), '1');
  assert.equal(initializeDebugMode('', storage), true);
  assert.equal(initializeDebugMode('?debug=0&dev=1', storage), false);
  assert.equal(storage.getItem('devinarok.debug'), null);
  persistDebugMode(true, storage);
  assert.equal(storage.getItem('devinarok.debug'), '1');
  persistDebugMode(false, storage);
  assert.equal(storage.getItem('devinarok.debug'), null);

  let toggles = 0;
  let timerId = 0;
  const timers = new Map();
  const tap = createTapToggle(() => { toggles += 1; }, {
    setTimer(callback) {
      const id = ++timerId;
      timers.set(id, callback);
      return id;
    },
    clearTimer(id) { timers.delete(id); },
  });
  for (let index = 0; index < 4; index += 1) tap();
  assert.equal(toggles, 0);
  tap();
  assert.equal(toggles, 1);
  for (let index = 0; index < 4; index += 1) tap();
  [...timers.values()].at(-1)?.();
  tap();
  assert.equal(toggles, 1);
  tap.dispose();
});

test('debug save operations clamp level, reset progress, and mark the character', () => {
  const character = {
    id: 'hero',
    level: 4,
    xp: 35,
    debugUsed: undefined,
    equipment: { weapon: null, head: null, body: null, hands: null, feet: null },
    clearedStages: ['C1', 'CB'],
  };
  assert.equal(normalizeCharacter(character).debugUsed, false);
  const updated = applyOperations(character, {}, [
    { type: 'setLevel', level: 24 },
    { type: 'resetProgress' },
    { type: 'markDebug' },
  ], 'hero').character;
  assert.equal(updated.level, 20);
  assert.equal(updated.xp, 0);
  assert.deepEqual(updated.clearedStages, []);
  assert.equal(updated.debugUsed, true);
  const lower = applyOperations(updated, {}, [{ type: 'setLevel', level: -7 }], 'hero').character;
  assert.equal(lower.level, 1);
  assert.equal(lower.xp, 0);
  assert.throws(() => applyOperations(updated, {}, [{ type: 'setLevel', level: '3' }], 'hero'), /integer/);
});

test('debug destructive confirmation expires after three seconds', () => {
  const gate = new TwoTapGate({ windowMs: 3000 });
  assert.equal(gate.request('reset-save', 100), false);
  assert.equal(gate.request('reset-save', 3099), true);
  assert.equal(gate.request('reset-progress', 5000), false);
  assert.equal(gate.request('reset-progress', 8001), false);
  assert.equal(gate.request('reset-progress', 9000), true);
});

test('recent debug actions persist as four unique newest-first entries', () => {
  const storage = memoryStorage();
  let actions = loadRecentActions(storage);
  for (const action of ['gold-1000', 'preset-set', 'toggle-invulnerable', 'room-clear', 'preset-set']) {
    actions = recordRecentAction(actions, action, storage);
  }
  assert.deepEqual(actions, ['preset-set', 'room-clear', 'toggle-invulnerable', 'gold-1000']);
  assert.deepEqual(loadRecentActions(storage), actions);
});

test('debug room kill uses the normal stage death and reward path', () => {
  const world = createStageWorld({ seed: 74, stageId: 'CB', playerId: 'hero', character: { level: 7 } });
  const boss = world.entities.find((entity) => entity.kind === 'enemy');
  const initialXp = world.rewards.hero.xp;
  assert.equal(debugKillEnemy(world, boss), true);
  assert.equal(boss.dead, true);
  assert.ok(world.events.some((event) => event.type === 'strike' && (event.skill ?? 0) === 0));
  assert.ok(world.events.some((event) => event.type === 'death' && event.entityId === boss.id));
  assert.ok(world.events.some((event) => event.type === 'bossDefeated' && event.entityId === boss.id));
  assert.ok(world.events.some((event) => event.type === 'lootSpawn' && event.ownerId === 'hero'));
  assert.ok(world.rewards.hero.xp > initialXp);
});

test('debug kill refuses party worlds without mutating enemies', () => {
  const world = createStageWorld({
    seed: 9,
    stageId: 'C1',
    party: [{ playerId: 'hero' }, { playerId: 'guest' }],
  });
  const enemy = world.entities.find((entity) => entity.kind === 'enemy');
  const hp = enemy.hp;
  assert.equal(debugKillEnemy(world, enemy), false);
  assert.equal(enemy.hp, hp);
  assert.equal(enemy.dead, false);
});

test('party debug tools refuse cheats and keep only Info actions available', () => {
  assert.equal(partyActionReason(true, 'room-clear'), '파티 중에는 정보만 확인할 수 있어요');
  assert.equal(partyActionReason(true, 'preset-boss'), '파티 중에는 정보만 확인할 수 있어요');
  assert.equal(partyActionReason(true, 'info'), null);
  assert.equal(partyActionReason(false, 'room-clear'), null);
});

test('debug UI remains dynamically loaded rather than present in the default document', async () => {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const main = await readFile(path.join(root, 'js/main.js'), 'utf8');
  assert.doesNotMatch(html, /id=["']debug-(?:trigger|panel|info)["']/);
  assert.match(main, /import\('\.\/debug\/panel\.js'\)/);
  assert.doesNotMatch(main, /import\s+.*from\s+['"].*debug\/panel\.js['"]/);
});

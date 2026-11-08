import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { createTapToggle, initializeDebugMode, persistDebugMode } from '../js/core/debug-toggle.js';
import { debugKillEnemy, debugKillRoomEnemies, debugSpawnRoomEnemy } from '../js/debug/combat.js';
import {
  applyDebugSpeed, debugShortcutOperations, debugStageSaveReason, loadRecentActions,
  partyActionReason, recordRecentAction, resetDebugSpeed, TwoTapGate,
} from '../js/debug/state.js';
import { applyOperations, normalizeCharacter } from '../js/save/ops.js';
import { BUTTONS, completeStage, createStageWorld, pickAimTarget, step } from '../js/sim/world.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

function characterWithTutorial(tutorial = {
  step: 'board',
  completed: false,
  skipped: false,
  combatComplete: false,
}) {
  return {
    id: 'hero',
    level: 1,
    debugUsed: false,
    equipment: { weapon: null, head: null, body: null, hands: null, feet: null },
    clearedStages: [],
    tutorial,
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

test('boss test skips an active tutorial and marks the character as debug-used', () => {
  const character = characterWithTutorial();
  const updated = applyOperations(
    character,
    {},
    debugShortcutOperations(character, 'preset-boss'),
    'hero',
  ).character;
  assert.equal(updated.tutorial.step, 'done');
  assert.equal(updated.tutorial.skipped, true);
  assert.equal(updated.debugUsed, true);
});

test('starting a stage skips an active tutorial and marks the character as debug-used', () => {
  const character = characterWithTutorial({ step: 'movement', combatComplete: false });
  const updated = applyOperations(
    character,
    {},
    debugShortcutOperations(character, 'start-stage:CB'),
    'hero',
  ).character;
  assert.equal(updated.tutorial.step, 'done');
  assert.equal(updated.tutorial.skipped, true);
  assert.equal(updated.debugUsed, true);
});

test('unlocking all stages skips an active tutorial and marks the character as debug-used', () => {
  const character = characterWithTutorial();
  const updated = applyOperations(
    character,
    {},
    debugShortcutOperations(character, 'unlock-stages', [{ type: 'clearStage', stageId: 'C1' }]),
    'hero',
  ).character;
  assert.equal(updated.tutorial.step, 'done');
  assert.equal(updated.tutorial.skipped, true);
  assert.equal(updated.debugUsed, true);
  assert.deepEqual(updated.clearedStages, ['C1']);
});

test('debug shortcuts preserve an already terminal tutorial', () => {
  const character = characterWithTutorial({
    step: 'done',
    completed: true,
    skipped: false,
    combatComplete: true,
  });
  const operations = debugShortcutOperations(character, 'preset-boss');
  assert.equal(operations.some((operation) => operation.type === 'updateTutorial'), false);
  assert.equal(operations.some((operation) => operation.type === 'markDebug'), true);
});

test('save-changing debug actions are disabled in stages with the inn-only reason', () => {
  for (const action of ['import-json', 'restore-backup', 'reset-save', 'reset-progress']) {
    assert.equal(debugStageSaveReason(action, 'stage'), '여관에서만 사용할 수 있어요');
    assert.equal(debugStageSaveReason(action, 'hub'), null);
  }
  assert.equal(debugStageSaveReason('copy-json', 'stage'), null);
});

test('selected debug speed applies to new solo loops and resets when disabled', () => {
  const firstLoop = { speed: 1 };
  applyDebugSpeed(firstLoop, 2);
  assert.equal(firstLoop.speed, 2);

  const nextLoop = { speed: 1 };
  applyDebugSpeed(nextLoop, 2);
  assert.equal(nextLoop.speed, 2);
  resetDebugSpeed(nextLoop);
  assert.equal(nextLoop.speed, 1);

  const partyLoop = { speed: 1 };
  applyDebugSpeed(partyLoop, 2, true);
  assert.equal(partyLoop.speed, 1);
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

test('summoned enemies are targetable and keep a room open until killed', () => {
  const world = createStageWorld({ seed: 76, stageId: 'C1', playerId: 'hero' });
  const player = world.entities.find((entity) => entity.kind === 'player');
  world.roomEnemyIds = [];
  const enemy = debugSpawnRoomEnemy(world, 'Skeleton_Minion', {
    x: player.x + Math.cos(player.facing) * 3,
    z: player.z + Math.sin(player.facing) * 3,
  });
  enemy.spawnTicksLeft = 0;
  enemy.invulnerable = false;
  enemy.hp = 1;
  enemy.maxHp = 1;
  enemy.moveSpeed = 0;
  enemy.attackCooldownTicks = 10000;

  assert.equal(world.roomEnemyIds.includes(enemy.id), true);
  assert.equal(pickAimTarget(world, player, 5), enemy);
  step(world, { hero: { seq: 1, moveX: 0, moveZ: 0, aim: 0, buttons: 0 } });
  assert.equal(world.roomCleared, false);

  assert.equal(debugKillEnemy(world, enemy), true);
  assert.equal(enemy.dead, true);
  assert.equal(world.roomCleared, true);
});

test('debug instant clear includes rewards from normal enemy deaths in settlement', () => {
  const world = createStageWorld({ seed: 79, stageId: 'C1', playerId: 'hero', character: { level: 1 } });
  const enemy = world.entities.find((entity) => entity.kind === 'enemy');
  world.entities = world.entities.filter((entity) => entity.kind !== 'enemy' || entity.id === enemy.id);
  world.roomEnemyIds = [enemy.id];
  const initialXp = world.rewards.hero.xp;

  assert.equal(debugKillRoomEnemies(world, (inputs) => step(world, inputs)), 1);
  assert.equal(world.outcome, null);
  const result = completeStage(world, 'clear');

  assert.ok(result.xp > initialXp);
  assert.ok(result.gold > 0);
  assert.ok(world.events.some((event) => event.type === 'death' && event.entityId === enemy.id));
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

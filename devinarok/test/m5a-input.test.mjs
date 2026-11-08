import assert from 'node:assert/strict';
import test from 'node:test';
import { AttackInputAssistant, autoAttackDefault } from '../js/core/attack-assist.js';
import { detectTouchFlick } from '../js/core/input.js';
import { computeBotPolicy } from '../js/net/bot-policy.js';
import { normalizeSettings } from '../js/save/repository.js';
import { BUTTONS, COMBO_TIMELINES, createStageWorld } from '../js/sim/world.js';

const WEAPONS = {
  sword: 'rusted-sword',
  crossbow: 'rusted-crossbow',
  staff: 'apprentice-wand',
};

function makeWorld(family, distance) {
  const world = createStageWorld({
    seed: 191,
    stageId: 'C1',
    playerId: 'hero',
    character: { level: 1, equipment: [{ itemId: WEAPONS[family], rarity: 'common' }] },
  });
  const player = world.entities.find((entity) => entity.kind === 'player');
  const enemy = world.entities.find((entity) => entity.kind === 'enemy');
  world.entities = world.entities.filter((entity) => entity.id === player.id || entity.id === enemy.id);
  world.roomEnemyIds = [enemy.id];
  enemy.x = player.x + distance;
  enemy.z = player.z;
  enemy.spawnTicksLeft = 0;
  enemy.invulnerable = false;
  enemy.stunnedTicks = 1000;
  enemy.attackCooldownTicks = 1000;
  return { world, player, enemy };
}

test('auto-attack defaults on for touch and coarse pointers, off for keyboard', () => {
  assert.equal(autoAttackDefault({ pointerType: 'touch' }), true);
  assert.equal(autoAttackDefault({ pointerType: 'coarse' }), true);
  assert.equal(autoAttackDefault({ coarsePointer: true }), true);
  assert.equal(autoAttackDefault({ pointerType: 'mouse' }), false);
  assert.equal(autoAttackDefault({ pointerType: 'keyboard' }), false);
  assert.equal(normalizeSettings({}).autoAttack, null);
});

test('held attack creates a one-tick release and press pulse at chain and idle windows', () => {
  const assistant = new AttackInputAssistant();
  const world = { mode: 'stage' };
  const player = {
    family: 'sword',
    stats: { attackSpeed: 0 },
    dodgeTicks: 0,
    skillCast: null,
    attack: null,
  };
  const held = { seq: 1, buttons: BUTTONS.ATTACK, attackHeld: true };
  assert.equal(assistant.build(held, world, player).buttons & BUTTONS.ATTACK, BUTTONS.ATTACK);

  player.attack = {
    castId: 'hero:1',
    step: 1,
    phase: 'recovery',
    phaseTick: COMBO_TIMELINES[0].recoveryTicks - COMBO_TIMELINES[0].chainWindowTicks,
  };
  assert.equal(assistant.build(held, world, player).buttons & BUTTONS.ATTACK, 0);
  assert.equal(assistant.build(held, world, player).buttons & BUTTONS.ATTACK, BUTTONS.ATTACK);

  player.attack = null;
  assert.equal(assistant.build(held, world, player).buttons & BUTTONS.ATTACK, 0);
  assert.equal(assistant.build(held, world, player).buttons & BUTTONS.ATTACK, BUTTONS.ATTACK);
});

test('auto-attack chooses a living in-range target per family and is deterministic', () => {
  for (const [family, distance, outOfRange] of [
    ['sword', 1.8, 2.1],
    ['crossbow', 8.5, 9.5],
    ['staff', 6.5, 7.5],
  ]) {
    const { world, player } = makeWorld(family, distance);
    const raw = { seq: 1, moveX: 0, moveZ: 0, aim: 192, buttons: 0, attackHeld: false };
    const first = new AttackInputAssistant().build(raw, world, player, { autoAttack: true });
    const second = new AttackInputAssistant().build(raw, world, player, { autoAttack: true });
    assert.deepEqual(first, second, family);
    assert.equal(first.buttons & BUTTONS.ATTACK, BUTTONS.ATTACK, family);
    assert.equal(first.aim, 0, family);
    assert.equal(first.ad, distance, family);

    const far = makeWorld(family, outOfRange);
    const outside = new AttackInputAssistant().build(raw, far.world, far.player, { autoAttack: true });
    assert.equal(outside.buttons & BUTTONS.ATTACK, 0, family);
  }
});

test('auto-attack stays manual-only while dodging, skill casting, downed, or outside a stage', () => {
  const { world, player } = makeWorld('sword', 1.5);
  const raw = { seq: 1, buttons: 0, attackHeld: false };
  for (const change of [
    { dodgeTicks: 1 },
    { skillCast: { id: 1 } },
    { downed: true },
    { dead: true },
  ]) {
    Object.assign(player, change);
    assert.equal(new AttackInputAssistant().build(raw, world, player, { autoAttack: true }).buttons & BUTTONS.ATTACK, 0);
    Object.assign(player, { dodgeTicks: 0, skillCast: null, downed: false, dead: false });
  }
  world.mode = 'hub';
  assert.equal(new AttackInputAssistant().build(raw, world, player, { autoAttack: true }).buttons & BUTTONS.ATTACK, 0);
});

test('touch joystick flick requires a fast 28-pixel release and preserves its direction', () => {
  assert.deepEqual(detectTouchFlick({ pointerType: 'touch', elapsedMs: 180, dx: 30, dy: -40 }), { moveX: 76, moveZ: -102 });
  assert.equal(detectTouchFlick({ pointerType: 'touch', elapsedMs: 181, dx: 50, dy: 0 }), null);
  assert.equal(detectTouchFlick({ pointerType: 'touch', elapsedMs: 100, dx: 27, dy: 0 }), null);
  assert.equal(detectTouchFlick({ pointerType: 'mouse', elapsedMs: 100, dx: 50, dy: 0 }), null);
});

test('bots attack as soon as a counter is ready but keep dodging active telegraphs', () => {
  const player = {
    id: 'hero',
    family: 'sword',
    x: 0,
    z: 0,
    hp: 100,
    maxHp: 100,
    counterReadyTicks: 60,
    previousButtons: 0,
    dodgeCooldownTicks: 0,
  };
  const viewed = { entities: [], activeEnemyIds: [] };
  assert.equal(computeBotPolicy({ player, viewed }).buttons & BUTTONS.ATTACK, BUTTONS.ATTACK);
  player.previousButtons = BUTTONS.ATTACK;
  assert.equal(computeBotPolicy({ player, viewed }).buttons & BUTTONS.ATTACK, 0);

  player.previousButtons = 0;
  viewed.entities = [{
    id: 'enemy',
    kind: 'enemy',
    x: 1,
    z: 0,
    attackPhase: 'windup',
    attackRemaining: 3,
    attackShape: { type: 'circle', originX: 0, originZ: 0, radius: 1 },
  }];
  viewed.activeEnemyIds = ['enemy'];
  const threatInput = computeBotPolicy({ player, viewed });
  assert.equal(threatInput.buttons & BUTTONS.DODGE, BUTTONS.DODGE);
  assert.equal(threatInput.buttons & BUTTONS.ATTACK, 0);
});

import { BALANCE } from './balance.js';

// Combat content. Every number here is a design proposal ([제안]) to be tuned by playtest.
// Ability phases: windup -> lock -> active -> recovery (design §7.2).
//   delivery 'shape'      : hit test `shape` from the actor each active tick (one hit per target per act)
//   delivery 'dash'       : actor travels `dash.distance` along the locked facing during active; body hits
//   delivery 'projectile' : spawns projectiles on the first active tick
// trackTurnDeg: max turn rate (deg/s) toward the target during windup. Zero during lock (no re-target, no snap).

export const ABILITIES = {
  // ---------- player: blade (Vanguard)
  slash: {
    windupMs: 110, lockMs: 0, activeMs: 70, recoveryMs: 190, cooldownMs: 0,
    delivery: 'shape', shape: { type: 'cone', range: 92, arc: 110 },
    damage: 14, poise: 14, knockback: 140, family: 'blade', cancelInto: ['windup', 'recovery'],
  },
  lunge: {
    windupMs: 160, lockMs: 0, activeMs: 170, recoveryMs: 260, cooldownMs: 5000,
    delivery: 'dash', dash: { distance: 190, bodyPad: 14 },
    damage: 26, poise: 40, knockback: 260, family: 'blade', cancelInto: ['recovery'],
  },
  // ---------- player: bow (Ranger)
  arrow: {
    windupMs: 150, lockMs: 0, activeMs: 34, recoveryMs: 160, cooldownMs: 0,
    delivery: 'projectile',
    projectile: { speed: 760, radius: 7, rangePx: 620, count: 1, spreadDeg: 0, pierce: 0 },
    damage: 10, poise: 6, knockback: 60, family: 'bow', cancelInto: ['windup', 'recovery'],
  },
  volley: {
    windupMs: 240, lockMs: 0, activeMs: 34, recoveryMs: 260, cooldownMs: 5000,
    delivery: 'projectile',
    projectile: { speed: 700, radius: 7, rangePx: 520, count: 5, spreadDeg: 44, pierce: 0 },
    damage: 9, poise: 8, knockback: 80, family: 'bow', cancelInto: ['recovery'],
  },
  // ---------- player: focus (Arcanist). focus_pulse costs no mana (design §9.13).
  focus_pulse: {
    windupMs: 170, lockMs: 0, activeMs: 34, recoveryMs: 190, cooldownMs: 0,
    delivery: 'projectile',
    projectile: { speed: 560, radius: 9, rangePx: 520, count: 1, spreadDeg: 0, pierce: 0 },
    damage: 8, poise: 5, knockback: 40, family: 'focus', cancelInto: ['windup', 'recovery'],
  },
  ember_bolt: {
    windupMs: 380, lockMs: 0, activeMs: 34, recoveryMs: 240, cooldownMs: 2600, manaCost: 14,
    delivery: 'projectile',
    projectile: { speed: 520, radius: 12, rangePx: 560, count: 1, spreadDeg: 0, pierce: 0, explode: { radius: 78 } },
    damage: 30, poise: 30, knockback: 180, family: 'focus', element: 'fire', cancelInto: ['recovery'],
  },

  // ---------- monsters
  goblin_slash: {
    windupMs: 520, lockMs: 160, activeMs: 100, recoveryMs: 620, cooldownMs: 1300,
    delivery: 'shape', shape: { type: 'cone', range: 74, arc: 96 }, trackTurnDeg: 220,
    damage: 11, knockback: 160, rangeMin: 0, rangeMax: 80, weight: 3,
  },
  goblin_hop: {
    windupMs: 620, lockMs: 220, activeMs: 240, recoveryMs: 700, cooldownMs: 4200,
    delivery: 'dash', dash: { distance: 150, bodyPad: 6 }, trackTurnDeg: 160,
    damage: 13, knockback: 220, rangeMin: 110, rangeMax: 250, weight: 2,
  },
  sling_stone: {
    windupMs: 720, lockMs: 220, activeMs: 34, recoveryMs: 520, cooldownMs: 1700,
    delivery: 'projectile', trackTurnDeg: 200,
    projectile: { speed: 400, radius: 8, rangePx: 560, count: 1, spreadDeg: 0, pierce: 0 },
    damage: 9, knockback: 90, rangeMin: 120, rangeMax: 460, weight: 3,
  },
  boar_charge: {
    windupMs: 900, lockMs: 300, activeMs: 520, recoveryMs: 1100, cooldownMs: 3800,
    delivery: 'dash', dash: { distance: 360, bodyPad: 8 }, trackTurnDeg: 120,
    damage: 18, knockback: 320, rangeMin: 140, rangeMax: 520, weight: 3, major: true,
  },
  boar_gore: {
    windupMs: 560, lockMs: 160, activeMs: 120, recoveryMs: 640, cooldownMs: 1600,
    delivery: 'shape', shape: { type: 'cone', range: 82, arc: 80 }, trackTurnDeg: 200,
    damage: 12, knockback: 200, rangeMin: 0, rangeMax: 90, weight: 2,
  },
  chief_cleave: {
    windupMs: 780, lockMs: 240, activeMs: 120, recoveryMs: 760, cooldownMs: 1700,
    delivery: 'shape', shape: { type: 'cone', range: 118, arc: 130 }, trackTurnDeg: 180,
    damage: 16, knockback: 240, rangeMin: 0, rangeMax: 120, weight: 3,
  },
  chief_charge: {
    windupMs: 950, lockMs: 300, activeMs: 460, recoveryMs: 1200, cooldownMs: 5200,
    delivery: 'dash', dash: { distance: 330, bodyPad: 10 }, trackTurnDeg: 120,
    damage: 20, knockback: 340, rangeMin: 150, rangeMax: 480, weight: 2, major: true,
  },
  chief_slam: {
    windupMs: 1050, lockMs: 250, activeMs: 120, recoveryMs: 1300, cooldownMs: 6500,
    delivery: 'shape', shape: { type: 'circle', radius: 150, offset: 0 },
    damage: 22, knockback: 300, rangeMin: 0, rangeMax: 150, weight: 2, major: true,
  },
  wolf_dash: {
    windupMs: 500, lockMs: 180, activeMs: 300, recoveryMs: 2500, cooldownMs: 2700,
    delivery: 'dash', dash: { distance: 250, bodyPad: 6 }, trackTurnDeg: 160,
    damage: 17, knockback: 180, rangeMin: 100, rangeMax: 390, weight: 3, major: true,
  },
  wolf_bite: {
    windupMs: 420, lockMs: 160, activeMs: 100, recoveryMs: 2500, cooldownMs: 1400,
    delivery: 'shape', shape: { type: 'cone', range: 80, arc: 85 }, trackTurnDeg: 220,
    damage: 14, knockback: 100, rangeMin: 0, rangeMax: 85, weight: 2, major: true,
  },
  guardian_crush: {
    windupMs: 1100, lockMs: 300, activeMs: 150, recoveryMs: 2600, cooldownMs: 2000,
    delivery: 'shape', shape: { type: 'cone', range: 140, arc: 120 }, trackTurnDeg: 90,
    damage: 24, knockback: 200, rangeMin: 0, rangeMax: 145, weight: 3, major: true,
  },
  guardian_ring: {
    windupMs: 1200, lockMs: 300, activeMs: 150, recoveryMs: 2800, cooldownMs: 4800,
    delivery: 'shape', shape: { type: 'circle', radius: 175, offset: 0 },
    damage: 27, knockback: 230, rangeMin: 0, rangeMax: 175, weight: 2, major: true,
  },
  spirit_bolt: {
    windupMs: 800, lockMs: 240, activeMs: 34, recoveryMs: 2500, cooldownMs: 1600,
    delivery: 'projectile', trackTurnDeg: 150, element: 'frost',
    projectile: { speed: 360, radius: 11, rangePx: 540, count: 1, spreadDeg: 0, pierce: 0 },
    damage: 16, knockback: 70, rangeMin: 0, rangeMax: 480, weight: 3, major: true,
  },
  spider_bite: {
    windupMs: 550, lockMs: 180, activeMs: 100, recoveryMs: 2500, cooldownMs: 1800,
    delivery: 'shape', shape: { type: 'cone', range: 90, arc: 90 }, trackTurnDeg: 180,
    damage: 10, knockback: 70, rangeMin: 0, rangeMax: 90, weight: 2, major: true,
    poison: { durationMs: 4000, intervalMs: 1000, damage: 3 },
  },
  // [제안] The puddle is an anchored, interruptible active phase, not a second invisible attack.
  spider_puddle: {
    windupMs: 900, lockMs: 250, activeMs: 4500, recoveryMs: 2600, cooldownMs: 5200,
    delivery: 'shape', shape: { type: 'circle', radius: 115, offset: 85 },
    anchored: true, repeatHitMs: 1000,
    damage: 4, knockback: 0, rangeMin: 0, rangeMax: 190, weight: 3, major: true,
    poison: { durationMs: 4000, intervalMs: 1000, damage: 3 },
  },
};

// Weapon kits (design §9.1: the weapon decides the job). One character, swappable at the inn.
export const WEAPONS = {
  blade: { kit: 'vanguard', basic: 'slash', skill: 'lunge' },
  bow: { kit: 'ranger', basic: 'arrow', skill: 'volley' },
  focus: { kit: 'arcanist', basic: 'focus_pulse', skill: 'ember_bolt' },
};

// Monster archetypes. Palette/equipment variants layer on top later (design §11) and never change these rules silently.
export const MONSTERS = {
  scarecrow: {
    hp: 1, r: 22, speed: 0, poise: 0, kbResist: 1, abilities: [], invulnerable: true,
    xp: 0, keepRange: [0, 0],
  },
  goblin_grunt: {
    hp: 62, r: 18, speed: 118, poise: 30, kbResist: 0, abilities: ['goblin_slash', 'goblin_hop'],
    xp: 8, keepRange: [40, 70],
  },
  goblin_slinger: {
    hp: 40, r: 16, speed: 104, poise: 20, kbResist: 0, abilities: ['sling_stone'],
    xp: 7, keepRange: [230, 330],
  },
  iron_boar: {
    hp: 140, r: 24, speed: 96, poise: 60, kbResist: 0.5, abilities: ['boar_charge', 'boar_gore'],
    xp: 16, keepRange: [160, 300],
  },
  goblin_chief: {
    hp: 320, r: 28, speed: 104, poise: 120, kbResist: 0.7, abilities: ['chief_cleave', 'chief_charge', 'chief_slam'],
    xp: 40, keepRange: [60, 110], elite: true // archetype rank only; random spawn variants use entity.eliteVariant,
  },
  wolf: {
    hp: 110, r: 19, speed: 172, poise: 35, kbResist: 0.1,
    abilities: ['wolf_dash', 'wolf_bite'], xp: 22, keepRange: [45, 75],
  },
  rune_guardian: {
    hp: 280, r: 30, speed: 68, poise: 90, kbResist: 0.65,
    abilities: ['guardian_crush', 'guardian_ring'], xp: 36, keepRange: [60, 110], elite: true // archetype rank only; random spawn variants use entity.eliteVariant,
  },
  spirit: {
    hp: 90, r: 17, speed: 100, poise: 25, kbResist: 0.15,
    abilities: ['spirit_bolt'], xp: 20, keepRange: [210, 300],
  },
  poison_spider: {
    hp: 170, r: 23, speed: 115, poise: 50, kbResist: 0.25,
    abilities: ['spider_bite', 'spider_puddle'], xp: 28, keepRange: [45, 85],
  },
};

// Compact stage constructor for S8+: [monster, atMs, fx, fy]. goal killAll; concurrency comes from BALANCE.
const stage = (name, spawns) => ({ name, goal: 'killAll', maxConcurrent: 3,
  spawns: spawns.map(([monster, at, fx, fy]) => ({ monster, at, fx, fy })) });

// Stage encounters (design §4). Positions are fractions of the arena.
export const STAGES = {
  S1: {
    name: '소환 시험', goal: 'timer', timerMs: 30000, maxConcurrent: 1,
    spawns: [{ monster: 'scarecrow', at: 0, fx: 0.62, fy: 0.5 }],
  },
  S2: {
    name: '끊긴 여관길', goal: 'killAll', maxConcurrent: 3,
    spawns: [
      { monster: 'goblin_grunt', at: 0, fx: 0.78, fy: 0.42 },
      { monster: 'goblin_grunt', at: 15000, fx: 0.82, fy: 0.62 },
      { monster: 'goblin_slinger', at: 15000, fx: 0.9, fy: 0.3 },
    ],
  },
  S3: {
    name: '무너진 수레', goal: 'killAll', maxConcurrent: 2,
    spawns: [
      { monster: 'iron_boar', at: 0, fx: 0.8, fy: 0.5 },
      { monster: 'goblin_grunt', at: 6000, fx: 0.85, fy: 0.25 },
    ],
  },
  S4: {
    name: '고블린 대장', goal: 'killAll', maxConcurrent: 3,
    spawns: [
      { monster: 'goblin_chief', at: 0, fx: 0.78, fy: 0.5 },
      { monster: 'goblin_grunt', at: 4000, fx: 0.85, fy: 0.25 },
      { monster: 'goblin_slinger', at: 9000, fx: 0.9, fy: 0.75 },
    ],
  },
  S5: {
    name: '외로운 사냥개', goal: 'killAll', maxConcurrent: 2,
    spawns: [
      { monster: 'wolf', at: 0, fx: 0.72, fy: 0.38 },
      { monster: 'wolf', at: 0, fx: 0.82, fy: 0.65 },
    ],
  },
  S6: {
    name: '꺼진 길의 제단', goal: 'killAll', maxConcurrent: 2,
    spawns: [
      { monster: 'rune_guardian', at: 0, fx: 0.72, fy: 0.5 },
      { monster: 'spirit', at: 3000, fx: 0.85, fy: 0.28 },
    ],
  },
  S7: {
    // [제안] Sequential spawns teach poison without overlapping the first puddle with goblin attacks.
    name: '오염된 숲길', goal: 'killAll', maxConcurrent: 1,
    spawns: [
      { monster: 'poison_spider', at: 0, fx: 0.74, fy: 0.5 },
      { monster: 'goblin_grunt', at: 0, fx: 0.82, fy: 0.35 },
    ],
  },
  // [제안] S8~S20: remixes of existing archetypes (§4 구현 원칙: 변주 우선). Bosses at S10/S15/S20.
  S8: stage('잿빛 고개', [['goblin_grunt', 0, .78, .35], ['goblin_grunt', 2000, .82, .65], ['goblin_slinger', 4000, .9, .5], ['wolf', 6000, .86, .2]]),
  S9: stage('봉인문 경비', [['rune_guardian', 0, .76, .5], ['spirit', 2000, .86, .28], ['goblin_slinger', 4000, .9, .72]]),
  S10: stage('길을 막은 군주', [['goblin_chief', 0, .78, .5], ['goblin_grunt', 3000, .85, .25], ['goblin_slinger', 5000, .9, .75], ['iron_boar', 8000, .88, .5]]),
  S11: stage('늑대 무리의 언덕', [['wolf', 0, .74, .3], ['wolf', 0, .8, .7], ['wolf', 3000, .88, .5], ['spirit', 6000, .9, .2]]),
  S12: stage('녹슨 광산 입구', [['iron_boar', 0, .78, .35], ['iron_boar', 3000, .84, .7], ['goblin_grunt', 2000, .88, .5], ['goblin_slinger', 5000, .92, .25]]),
  S13: stage('독안개 늪', [['poison_spider', 0, .76, .4], ['poison_spider', 3000, .84, .7], ['spirit', 5000, .9, .25]]),
  S14: stage('무너진 성채', [['rune_guardian', 0, .76, .35], ['rune_guardian', 4000, .82, .7], ['goblin_slinger', 2000, .9, .5], ['goblin_slinger', 6000, .92, .2]]),
  S15: stage('서리 제단의 군주', [['goblin_chief', 0, .78, .5], ['spirit', 2000, .86, .25], ['spirit', 4000, .86, .75], ['wolf', 7000, .9, .5]]),
  S16: stage('사냥꾼의 숲', [['wolf', 0, .76, .3], ['wolf', 2000, .8, .72], ['poison_spider', 4000, .88, .5], ['goblin_slinger', 6000, .92, .2]]),
  S17: stage('철갑 돌격대', [['iron_boar', 0, .76, .3], ['iron_boar', 2000, .8, .7], ['rune_guardian', 4000, .88, .5], ['goblin_grunt', 6000, .92, .25]]),
  S18: stage('거미 여왕의 둥지', [['poison_spider', 0, .74, .3], ['poison_spider', 2000, .8, .7], ['poison_spider', 4000, .88, .5], ['spirit', 6000, .92, .2]]),
  S19: stage('봉인의 회랑', [['rune_guardian', 0, .76, .5], ['spirit', 2000, .84, .25], ['spirit', 4000, .84, .75], ['goblin_slinger', 6000, .92, .5]]),
  S20: stage('왕좌의 문', [['goblin_chief', 0, .78, .5], ['rune_guardian', 3000, .86, .25], ['wolf', 5000, .86, .75], ['wolf', 7000, .9, .4], ['spirit', 9000, .92, .6]]),
};

// P3 encounters are data only. Chief appears once; additional waves contain its escorts.
for (const [id, stage] of Object.entries(STAGES)) {
  const tuning = BALANCE.stages[id];
  Object.assign(stage, { hpMult: tuning.hp, dmgMult: tuning.damage, bossHpMult: tuning.bossHp || 1,
    eliteChance: tuning.eliteChance, maxConcurrent: tuning.concurrent });
  const original = stage.spawns;
  stage.spawns = Array.from({ length: tuning.waves }, (_, wave) => original
    .filter(spawn => wave === 0 || spawn.monster !== 'goblin_chief')
    .map(spawn => ({ ...spawn, at: spawn.at + wave * tuning.waveMs }))).flat();
}

export const PLAYER_BASE = {
  r: 17, speed: 230, hp: 100, mp: 100, mpRegen: 5,
  dodge: { distance: 150, dashMs: 200, iframeMs: 233, cooldownMs: 1150, perfectMs: 150 },
  bufferMs: 120, hurtInvulnMs: 260,
  potion: { healFrac: 0.35, cooldownMs: 1500 },
  manaPotion: 30,
  scroll: { channelMs: 2000, retryMs: 1000 },
};

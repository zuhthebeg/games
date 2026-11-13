// Beast Hunt — static game data (original content).
export const COOP_HP_SCALE = Object.freeze([1, 1.6, 2.2, 2.8]);
export const ATK = [100, 135, 175, 220, 270];
export const ARMOR = [
  { def: 0, hp: 0 }, { def: 10, hp: 10 }, { def: 22, hp: 20 }, { def: 36, hp: 35 }, { def: 52, hp: 50 },
];
export const TIERS = ['t_iron', 't_boar', 't_frost', 't_ember', 't_starforge'];
export const DMG_SCALE = 0.3;

// UPG[i] = cost to go from tier i to tier i+1.
export const UPG = [null,
  { shards: 300, w: { b_hide: 2, b_fang: 2, b_horn: 1 }, a: { b_hide: 3, b_fang: 1 } },
  { shards: 800, w: { f_hide: 2, f_fang: 2, f_horn: 1 }, a: { f_hide: 3, f_fang: 1, b_tail: 1 } },
  { shards: 1800, w: { e_hide: 2, e_fang: 2, e_horn: 1 }, a: { e_hide: 3, e_fang: 1, f_tail: 1 } },
  { shards: 4000, w: { b_gem: 1, f_gem: 1, e_gem: 1 }, a: { b_gem: 1, f_gem: 1, e_gem: 1, e_tail: 1 } },
];

export const WTYPES = {
  gs: {
    speed: 5.4, rollCost: 24,
    light: [
      { dur: .78, h0: .30, h1: .46, mv: 1.0, reach: 3.7, arc: 1.3, lunge: 2.2, sw: 'v' },
      { dur: .80, h0: .30, h1: .48, mv: 1.15, reach: 3.7, arc: 1.7, lunge: 1.8, sw: 'h' },
      { dur: 1.10, h0: .48, h1: .66, mv: 1.8, reach: 4.0, arc: 1.3, lunge: 2.6, sw: 'v' },
    ],
    // Numeric A nodes preserve legacy combo snapshots; B nodes use 3/4.
    combo: {
      next: [[1,3],[2,4],[0,4],[1,4],[0,3]],
      moves: [null,null,null,
        { dur:.70,h0:.24,h1:.36,mv:1.15,reach:3.9,arc:1.2,lunge:2.4,sw:'other' },
        { dur:1.20,h0:.40,h1:.90,mv:1.55,reach:4,arc:Math.PI*2,lunge:1.4,sw:'spin' }],
    },
    heavy: { charge: 1.5, mv0: 1.3, mv1: 3.8, dur: .95, h0: .28, h1: .46, reach: 4.1, arc: 1.3, lunge: 3, sw: 'v' },
  },
  db: {
    speed: 6.8, rollCost: 17,
    light: [
      { dur: .34, h0: .10, h1: .22, mv: .40, reach: 2.7, arc: 1.6, lunge: 1.3, sw: 'h' },
      { dur: .34, h0: .10, h1: .22, mv: .40, reach: 2.7, arc: 1.6, lunge: 1.1, sw: 'h2' },
      { dur: .34, h0: .10, h1: .22, mv: .42, reach: 2.7, arc: 1.6, lunge: 1.1, sw: 'h' },
      { dur: .52, h0: .18, h1: .32, mv: .75, reach: 2.9, arc: 1.6, lunge: 1.6, sw: 'v' },
    ],
    heavy: { charge: 0, cost: 22, multi: 5, mv0: .34, mv1: .34, dur: 1.0, h0: .12, h1: .86, reach: 2.9, arc: 6.4, lunge: 6, sw: 'spin' },
  },
  bow: {
    speed: 6.2, rollCost: 20,
    light: [{ dur: .50, h0: .22, h1: .22, mv: .40, shot: true, sw: 'bow' }],
    heavy: { charge: 1.2, mv0: .5, mv1: 2.0, dur: .55, h0: .12, h1: .12, shot: true, sw: 'bow' },
  },
};

export const MONSTERS = {
  boar: {
    hp: 1800, scale: 1.0, speed: 5.6, turn: 2.4, dmg: 1.0, biome: 'forest', proj: null,
    dims: { h: 1.85, bw: 1.45, bh: 1.3, hz: 2.0, headZ: 2.9, tailLen: 1.8, tailN: 3, tailW: .34, legX: 1.0, legZ: 1.25 },
    parts: { head: 1.25, body: 1.0, legs: .85, tail: 1.1 },
    brk: { head: 230, tail: 150, legs: 260 },
    atks: { bite: 3, charge: 4, stomp: 2.2, sweep: 1.5 },
  },
  frost: {
    hp: 3200, scale: 1.15, speed: 7.0, turn: 2.9, dmg: 1.25, biome: 'snow', proj: 'ice',
    dims: { h: 1.9, bw: 1.2, bh: 1.15, hz: 2.2, headZ: 3.2, tailLen: 3.6, tailN: 5, tailW: .5, legX: .95, legZ: 1.45 },
    parts: { head: 1.3, body: .95, legs: .9, tail: 1.15 },
    brk: { head: 340, tail: 300, legs: 380 },
    atks: { bite: 3, sweep: 2.5, leap: 3, spit: 2.5, charge: 1.5 },
  },
  ember: {
    hp: 5000, scale: 1.35, speed: 6.0, turn: 2.2, dmg: 1.55, biome: 'volcano', proj: 'fire',
    dims: { h: 2.1, bw: 1.6, bh: 1.45, hz: 2.4, headZ: 3.6, tailLen: 4.4, tailN: 6, tailW: .62, legX: 1.15, legZ: 1.55 },
    parts: { head: 1.35, body: .9, legs: .85, tail: 1.1 },
    brk: { head: 480, tail: 420, legs: 520 },
    atks: { bite: 2.5, sweep: 2.5, charge: 1.5, fireball: 3, breath: 2.5, leap: 1.5 },
  },
};

export const QUESTS = [
  { id: 'q1', mon: 'boar', hr: 0, shards: 400, gold: 20, need: null },
  { id: 'q2', mon: 'frost', hr: 0, shards: 900, gold: 40, need: 'q1' },
  { id: 'q3', mon: 'ember', hr: 0, shards: 1600, gold: 60, need: 'q2' },
  { id: 'q4', mon: 'boar', hr: 1, shards: 1500, gold: 50, need: 'q3' },
  { id: 'q5', mon: 'frost', hr: 1, shards: 2400, gold: 70, need: 'q4' },
  { id: 'q6', mon: 'ember', hr: 1, shards: 3600, gold: 100, need: 'q5' },
];
export const HR = { hp: 1.9, dmg: 1.45, spd: 1.1 };
export const PREFIX = { boar: 'b', frost: 'f', ember: 'e' };
export const TIME_LIMIT = 600;
export const MAX_CARTS = 3;
export const POTIONS = 5;

export function rollLoot(q, broke, rnd = Math.random) {
  const p = PREFIX[q.mon], out = {};
  const add = (k, n = 1) => { out[k] = (out[k] || 0) + n; };
  for (let i = 0; i < 3 + (q.hr ? 1 : 0); i++) add(rnd() < .55 ? p + '_hide' : p + '_fang');
  if (broke.head) add(p + '_horn');
  if (broke.tail) add(p + '_tail');
  if (q.hr) add(p + '_gem');
  return out;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, spawnMonster, step, emptyInput } from '../js/sim/world.js';
import { ABILITIES, MONSTERS } from '../js/content/combat.js';

const input = (o = {}) => ({ ...emptyInput(), ...o });

// Lands one blade act on a heavy-poise target and reports the poise it lost.
function landed(type, { mods = {}, skill = false } = {}) {
  const w = createWorld({ seed: 72 });
  const p = addPlayer(w, { pid: 'a', weapon: 'blade', x: 400, y: 400, mods: { skills: ['heavy_cleave'], ...mods } });
  p.mp = 999;
  const m = spawnMonster(w, type, 470, 400);
  Object.assign(m, { spawnLeft: 0, staggerLeft: 0, hp: 1e6, maxHp: 1e6, poise: 1000, maxPoise: 1000, thinkLeft: 9999 });
  for (let i = 0; i < 40; i++) {
    m.x = 470; m.y = 400;
    const before = m.poise;
    const ev = step(w, { a: input(skill ? { skillEdge: i === 0, aimX: 1 } : { attack: i === 0, aimX: 1 }) });
    const hit = ev.find((e) => e.type === 'hit' && e.src === p.id);
    if (hit) return { lost: before - m.poise, crit: !!hit.crit };
  }
  assert.fail(`no hit on ${type}`);
}

test('heavy-poise bosses/elites ignore plain basic attacks for stagger', () => {
  for (const type of ['throne_dragon', 'goblin_chief', 'gargoyle', 'rune_guardian']) {
    assert.equal(MONSTERS[type].heavyPoise, true, type);
    assert.ok(landed(type).lost <= 0, `${type} basic`);
  }
  assert.ok(landed('goblin_grunt').lost > 0, 'normal monsters still lose poise to basics');
});

test('heavy-poise targets still lose poise to skills and to critical basics', () => {
  assert.ok(landed('goblin_chief', { skill: true }).lost >= ABILITIES.heavy_cleave.poise * 0.9);
  const crit = landed('goblin_chief', { mods: { critChance: 1 } });
  assert.equal(crit.crit, true);
  assert.ok(crit.lost > 0);
});

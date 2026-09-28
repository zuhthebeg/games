const { test } = require('node:test');
const a = require('node:assert/strict');
const S = require('../js/sim.js');
const N = require('../js/net.js');
const killBoss = w => { const b = w.enemies.find(e => e.type === 'boss_2'); b.hp = 0; S.kill(w, b, 'solo'); };
const bossWorld = endless => {
  const w = S.createWorld({ wave: 20, endless, players: { solo: { char: 'basic' } }, rng: () => .5 });
  w.spawnClock = -1e9; w.looterRolled = true; w.players.solo.immune = 1e9; w.players.solo.cool = [1e9];
  S.step(w, 1 / 30);
  return w;
};
test('normal mode wins on the wave-20 boss; endless keeps going', () => {
  const normal = bossWorld(false); killBoss(normal); S.step(normal, 1 / 30);
  a.equal(normal.ended, true); a.equal(normal.win, true);
  const endless = bossWorld(true); killBoss(endless); S.step(endless, 1 / 30);
  a.equal(endless.ended, true); a.equal(endless.win, false, 'endless does not end the run at 20');
});
test('endless waves past 20 spawn a boss every 10 waves and scale enemies with compounding', () => {
  const w = S.createWorld({ wave: 30, endless: true, players: { solo: { char: 'basic' } }, rng: () => .5 });
  w.spawnClock = -1e9; w.players.solo.immune = 1e9; S.step(w, 1 / 30);
  a.ok(w.enemies.some(e => e.type === 'boss_1'));
  const w21 = S.createWorld({ wave: 21, endless: true, players: { solo: { char: 'basic' } } });
  const w20 = S.createWorld({ wave: 20, players: { solo: { char: 'basic' } } });
  const hp21 = S.spawn(w21, 'blob', 0, 0).maxHp, hp20 = S.spawn(w20, 'blob', 0, 0).maxHp;
  a.ok(hp21 / hp20 > 1.1, `${hp21} vs ${hp20}`);
});
test('endless flag travels in WAVE_START and solo saves beyond wave 20 load', () => {
  const sent = [];
  const s = new N.Session({ uid: 'solo', host: 'solo', sendAction: x => sent.push(x) });
  s.sendAction.echo = true;
  s.roster({ players: [{ user: 'solo' }], hostUser: 'solo' });
  s.endless = true; s.start(21);
  a.equal(sent.at(-1).payload.endless, true);
  s.receive(sent.at(-1));
  a.equal(s.world.endless, true); a.equal(s.world.wave, 21);
  const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  const w = S.createWorld({ wave: 25, endless: true, players: { solo: { char: 'basic' } } });
  a.ok(S.soloSave.save(storage, { mode: 'wave', world: w, offers: null, cratesRemaining: 0, shopRolls: 0 }));
  a.equal(S.soloSave.load(storage)?.world.wave, 25);
});

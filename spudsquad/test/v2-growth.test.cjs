const { test } = require('node:test');
const a = require('node:assert/strict');
const S = require('../js/sim.js');
const N = require('../js/net.js');
test('upgrade grades distribution over 100k rolls within 1 percentage point', () => {
  let state = 23819231;
  const rng = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const counts = [0, 0, 0, 0, 0];
  for (let i = 0; i < 100000; i++) counts[S.rollGrade(rng)]++;
  [70, 22, 7, 1].forEach((pct, i) => a.ok(Math.abs(counts[i + 1] / 1000 - pct) < 1));
  a.equal(S.rollGrade(() => .8, 0), 2);
});
test('tier gated by wave and roll; crate item gated to the same tier', () => {
  const w = S.createWorld({ rng: () => .01 });
  const p = w.players.solo;
  a.equal(S.rollItemTier(w, p), 1);
  w.wave = 4;
  a.equal(S.rollItemTier(w, p), 2);
  w.wave = 8;
  a.equal(S.rollItemTier(w, p), 3);
  a.equal(typeof S.rollCrateItem(w, p), 'string');
});
test('snapshot with status bits and crates remains under 8KB at cap', () => {
  const w = S.createWorld();
  for (let i = 0; i < 220; i++) S.spawn(w, 'blob', i * 7, 10);
  w.enemies[0].status = { burn: { left: 1 } };
  w.enemies[0].flash = .08;
  w.fx = [];
  S.createCrate(w, 0, 0);
  const encoded = N.encode(w);
  a.equal(encoded.e[0][5] & 9, 9);
  a.ok(Buffer.byteLength(JSON.stringify(encoded)) < 8192);
});

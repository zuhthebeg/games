const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('HUD and teammate display round values without changing simulation precision', () => {
  const elements = new Map();
  const getElementById = id => {
    if (!elements.has(id)) elements.set(id, { style: {}, textContent: '', innerHTML: '', setAttribute() {} });
    return elements.get(id);
  };
  const document = { getElementById, body: { classList: { toggle() {}, remove() {} } } };
  const player = { uid: 'solo', hp: 6.6, maxHp: 15.4, mats: 8.7, xp: 2.5, lvl: 3.2 };
  const session = { wave: 2, players: { solo: {}, ally: { nick: 'Ally' } }, lastPlayers: {} };
  const SPUD = {
    data: {}, i18n: { language: 'ko' }, sim: { needXp: () => 10 },
    main: { session }
  };
  const source = fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8');
  vm.runInNewContext(source, { window: { SPUD }, document, requestAnimationFrame: fn => fn() });
  SPUD.ui.hud({ players: { solo: player, ally: { uid: 'ally', hp: 4.6, maxHp: 10.4, alive: true } }, tm: 13.6 }, 'solo');
  assert.equal(getElementById('hpText').textContent, '7/15');
  assert.equal(getElementById('mats').textContent, 9);
  assert.equal(getElementById('level').textContent, 3);
  assert.equal(getElementById('timer').textContent, 14);
  assert.match(getElementById('team').innerHTML, /❤️5\/10/);
  assert.equal(player.hp, 6.6);
  assert.equal(player.mats, 8.7);
  assert.equal(getElementById('hpBar').style.width, 6.6 / 15.4 * 100 + '%');
});

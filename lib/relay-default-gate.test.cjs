const assert = require('assert');
const path = require('path');

global.window = global.window || {};
// shim browser globals the helper reads (it try/catches, but we exercise real branches)
let _search = '';
let _kill = null;
global.location = { get search() { return _search; } };
global.localStorage = { getItem: (k) => (k === 'relayKill' ? _kill : null) };

const { MultiplayerWSClient } = require(path.join(__dirname, 'multiplayer.js'));
const R = MultiplayerWSClient.relayDefaultOn;

// --- explicit URL wins both ways ---
_search = '?relay=rest'; _kill = null;
assert.strictEqual(R(true), false, '?relay=rest forces REST even when default ON');
_search = '?relay=do';
assert.strictEqual(R(false), true, '?relay=do forces DO even when default OFF');

// --- global kill-switch beats the per-game default ---
_search = ''; _kill = '1';
assert.strictEqual(R(true), false, 'relayKill=1 forces REST');
assert.strictEqual(R(false), false, 'relayKill=1 forces REST (default off too)');

// --- per-game default when nothing overrides ---
_search = ''; _kill = null;
assert.strictEqual(R(true), true, 'doDefault=true -> DO on (flipped game)');
assert.strictEqual(R(false), false, 'doDefault=false -> opt-in preserved (not yet flipped)');
assert.strictEqual(R(), false, 'missing arg -> safe default OFF (behavior-identical adoption)');

// --- explicit ?relay=do still beats kill-switch (intentional: lets us test a killed fleet) ---
_search = '?relay=do'; _kill = '1';
assert.strictEqual(R(true), true, 'explicit ?relay=do wins over kill-switch for testing');

console.log('PASS relay default gate');

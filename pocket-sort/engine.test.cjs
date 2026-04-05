const test = require('node:test');
const assert = require('node:assert/strict');

const { LEVELS } = require('./levels.js');
const {
  createGameState,
  selectItem,
  placeSelectedIntoBin,
  restartLevel,
  nextLevel,
  serializeForDebug,
} = require('./engine.js');

function autoClear(state) {
  let current = state;
  while (!current.isCleared) {
    const item = current.tray[0];
    const binIndex = current.bins.findIndex((bin) => bin.type === item);
    current = selectItem(current, 0);
    current = placeSelectedIntoBin(current, binIndex);
  }
  return current;
}

test('ships 20 deterministic levels with labeled bins and tray items', () => {
  assert.equal(LEVELS.length, 20);
  for (const level of LEVELS) {
    assert.ok(level.bins.length >= 2);
    assert.ok(level.tray.length >= 4);
    for (const binType of level.bins) {
      assert.ok(level.tray.includes(binType));
    }
  }
});

test('selecting an item and placing it into the matching bin works', () => {
  const state = createGameState(LEVELS, 0);
  const selected = selectItem(state, 0);
  const binIndex = selected.bins.findIndex((bin) => bin.type === selected.selectedItem);
  const placed = placeSelectedIntoBin(selected, binIndex);

  assert.equal(placed.selectedItem, null);
  assert.equal(placed.moveCount, 1);
  assert.equal(placed.tray.length, state.tray.length - 1);
  assert.equal(placed.bins[binIndex].items.length, 1);
  assert.equal(placed.lastAction.valid, true);
});

test('wrong bin is blocked with a visible reason', () => {
  const state = createGameState([{ id: 1, name: 'Invalid', bins: ['lip', 'usb'], tray: ['lip', 'usb'] }], 0);
  const selected = selectItem(state, 0);
  const blocked = placeSelectedIntoBin(selected, 1);

  assert.equal(blocked.moveCount, 0);
  assert.equal(blocked.lastAction.valid, false);
  assert.equal(blocked.lastAction.reason, 'wrong-bin');
  assert.deepEqual(blocked.tray, ['lip', 'usb']);
});

test('clear state turns on when all tray items are sorted', () => {
  const state = createGameState([{ id: 1, name: 'Clear', bins: ['lip', 'usb'], tray: ['lip', 'usb'] }], 0);
  const afterLip = placeSelectedIntoBin(selectItem(state, 0), 0);
  const afterUsb = placeSelectedIntoBin(selectItem(afterLip, 0), 1);

  assert.equal(afterUsb.isCleared, true);
  assert.equal(afterUsb.showClear, true);
  assert.equal(afterUsb.tray.length, 0);
});

test('restart and next level restore deterministic state', () => {
  const state = createGameState(LEVELS, 0);
  const selected = selectItem(state, 0);
  const binIndex = selected.bins.findIndex((bin) => bin.type === selected.selectedItem);
  const moved = placeSelectedIntoBin(selected, binIndex);
  const restarted = restartLevel(moved);
  const advanced = nextLevel(restarted);

  assert.deepEqual(restarted.tray, LEVELS[0].tray);
  assert.equal(restarted.moveCount, 0);
  assert.equal(advanced.levelIndex, 1);
  assert.deepEqual(advanced.tray, LEVELS[1].tray);
});

test('every shipped level can be auto-cleared deterministically', () => {
  for (let index = 0; index < LEVELS.length; index += 1) {
    const cleared = autoClear(createGameState(LEVELS, index));
    assert.equal(cleared.isCleared, true, `level ${index + 1} should clear`);
  }
});

test('debug payload exposes tray, bins, clear state, and last action', () => {
  const state = createGameState(LEVELS, 0);
  const selected = selectItem(state, 0);
  const debug = JSON.parse(serializeForDebug(selected));

  assert.equal(debug.level, 1);
  assert.equal(debug.isCleared, false);
  assert.equal(debug.lastAction.reason, 'selected');
  assert.ok(Array.isArray(debug.tray));
  assert.ok(Array.isArray(debug.bins));
});

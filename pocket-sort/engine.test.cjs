const test = require('node:test');
const assert = require('node:assert/strict');

const { LEVELS } = require('./levels.js');
const {
  createGameState,
  selectPocket,
  restartLevel,
  nextLevel,
  serializeForDebug,
} = require('./engine.js');

test('ships 20 deterministic levels with spare pockets', () => {
  assert.equal(LEVELS.length, 20);
  for (const level of LEVELS) {
    assert.ok(level.pockets.length >= 5);
    assert.ok(level.pockets.some((pocket) => pocket.length === 0));
  }
});

test('first valid move transfers the top item into an empty pocket', () => {
  const state = createGameState(LEVELS, 0);
  const afterPick = selectPocket(state, 0);
  const moved = selectPocket(afterPick, 5);

  assert.equal(moved.selectedPocket, null);
  assert.equal(moved.moveCount, 1);
  assert.deepEqual(moved.pockets[0], ['lip']);
  assert.deepEqual(moved.pockets[5], ['usb']);
  assert.equal(moved.lastMove.valid, true);
});

test('invalid move is blocked with a visible reason', () => {
  const state = createGameState(LEVELS, 0);
  const afterPick = selectPocket(state, 0);
  const blocked = selectPocket(afterPick, 1);

  assert.equal(blocked.moveCount, 0);
  assert.equal(blocked.lastMove.valid, false);
  assert.equal(blocked.lastMove.reason, 'color-mismatch');
  assert.deepEqual(blocked.pockets[0], ['lip', 'usb']);
  assert.deepEqual(blocked.pockets[1], ['battery']);
});

test('clear state turns on when every pocket is grouped', () => {
  const customLevels = [{
    id: 1,
    name: 'Smoke',
    pockets: [
      ['lip', 'lip'],
      ['usb', 'usb'],
      [],
      [],
    ],
  }];
  const state = createGameState(customLevels, 0);
  const picked = selectPocket(state, 0);
  const moved = selectPocket(picked, 2);
  const pickedAgain = selectPocket(moved, 1);
  const cleared = selectPocket(pickedAgain, 3);

  assert.equal(cleared.isCleared, true);
  assert.equal(cleared.showClear, true);
  assert.equal(cleared.lockedCount, 2);
});

test('restart and next level restore deterministic state', () => {
  const state = createGameState(LEVELS, 0);
  const moved = selectPocket(selectPocket(state, 0), 5);
  const restarted = restartLevel(moved);
  const advanced = nextLevel(restarted);

  assert.deepEqual(restarted.pockets, LEVELS[0].pockets);
  assert.equal(restarted.moveCount, 0);
  assert.equal(advanced.levelIndex, 1);
  assert.deepEqual(advanced.pockets, LEVELS[1].pockets);
});

test('debug payload exposes level, board, clear state, and invalid move reason', () => {
  const state = createGameState(LEVELS, 0);
  const blocked = selectPocket(selectPocket(state, 0), 1);
  const debug = JSON.parse(serializeForDebug(blocked));

  assert.equal(debug.level, 1);
  assert.equal(debug.isCleared, false);
  assert.equal(debug.lastMove.reason, 'color-mismatch');
  assert.deepEqual(debug.board[0], ['lip', 'usb']);
});

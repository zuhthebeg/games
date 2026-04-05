const test = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('./engine.js');

test('ships a deterministic opening queue for QA', () => {
  const state = Engine.createGameState();

  assert.deepEqual(
    state.queue,
    Engine.OPENING_QUEUE.slice(0, Engine.VISIBLE_QUEUE)
  );
  assert.equal(state.openingIndex, Engine.VISIBLE_QUEUE);
});

test('dropping three matching sprouts creates the next tier and score', () => {
  let state = Engine.createGameState({
    openingQueue: [0, 0, 0, 1, 1, 1],
    seed: 7,
  });

  state = Engine.dropPiece(state, 0);
  state = Engine.dropPiece(state, 1);
  state = Engine.dropPiece(state, 2);

  assert.equal(state.board[state.rows - 1][0], 1);
  assert.equal(state.board[state.rows - 1][1], null);
  assert.equal(state.board[state.rows - 1][2], null);
  assert.equal(state.score, 72);
  assert.equal(state.lastAction.reason, 'merged');
  assert.equal(state.lastAction.merges.length, 1);
  assert.equal(state.lastAction.merges[0].createdLevel, 1);
});

test('hitting the target level ends the run in a win state', () => {
  let state = Engine.createGameState({
    targetLevel: 1,
    openingQueue: [0, 0, 0, 1],
  });

  state = Engine.dropPiece(state, 0);
  state = Engine.dropPiece(state, 1);
  state = Engine.dropPiece(state, 2);

  assert.equal(state.status, 'won');
  assert.equal(state.highestLevel, 1);
  assert.equal(state.lastAction.reason, 'target-reached');
});

test('single-cell board ends in game over when filled without a merge', () => {
  let state = Engine.createGameState({
    rows: 1,
    cols: 1,
    targetLevel: 6,
    openingQueue: [0, 0, 0],
  });

  state = Engine.dropPiece(state, 0);

  assert.equal(state.status, 'game-over');
  assert.deepEqual(state.availableColumns, []);
});

test('restart restores the same deterministic opener', () => {
  let state = Engine.createGameState({
    openingQueue: [0, 1, 2, 3, 0, 1],
    seed: 77,
  });

  state = Engine.dropPiece(state, 0);
  state = Engine.dropPiece(state, 0);

  const restarted = Engine.restartGame(state);

  assert.equal(restarted.turn, 0);
  assert.equal(restarted.score, 0);
  assert.deepEqual(restarted.board, Array.from({ length: restarted.rows }, () => Array(restarted.cols).fill(null)));
  assert.deepEqual(restarted.queue, [0, 1, 2, 3]);
});

test('debug payload exposes queue, board, remaining opening queue, and status', () => {
  const state = Engine.createGameState({
    openingQueue: [0, 1, 0, 1, 2],
  });
  const debug = JSON.parse(Engine.serializeForDebug(state));

  assert.equal(debug.status, 'ready');
  assert.deepEqual(debug.queue, [0, 1, 0, 1]);
  assert.deepEqual(debug.openingRemaining, [2]);
  assert.equal(debug.board.length, state.rows);
  assert.equal(debug.board[0].length, state.cols);
});

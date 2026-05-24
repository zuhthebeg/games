const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

function extractConst(name) {
  const re = new RegExp(`const ${name} = [^;]+;`);
  const match = html.match(re);
  if (!match) throw new Error(`Const not found: ${name}`);
  return match[0];
}

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`Function not found: ${name}`);
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`Could not parse function: ${name}`);
}

const script = [
  extractConst('COLORS'),
  extractFunction('isValidRun'),
  extractFunction('isValidGroup'),
  extractFunction('isValidSet'),
  extractFunction('setScore'),
  extractFunction('tileSortValue'),
  extractFunction('findRecommendedSets'),
  extractFunction('smartSort'),
].join('\n');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(script, ctx);

const tiles = [
  { id: 'r5', color: 'red', number: 5, isJoker: false },
  { id: 'b5', color: 'blue', number: 5, isJoker: false },
  { id: 'o5', color: 'orange', number: 5, isJoker: false },
  { id: 'k1', color: 'black', number: 1, isJoker: false },
  { id: 'k2', color: 'black', number: 2, isJoker: false },
  { id: 'k3', color: 'black', number: 3, isJoker: false },
  { id: 'x9', color: 'red', number: 9, isJoker: false },
];

const sets = ctx.findRecommendedSets(tiles, true);
assert.deepEqual(
  sets.map(set => set.map(t => t.id)),
  [['r5', 'b5', 'o5'], ['k1', 'k2', 'k3']],
  'recommended sets should list playable groups/runs first without reusing tiles'
);

const sortedIds = ctx.smartSort(tiles, true).map(t => t.id);
assert.deepEqual(
  sortedIds.slice(0, 6),
  ['r5', 'b5', 'o5', 'k1', 'k2', 'k3'],
  'smart sort should put playable sets first'
);
assert.equal(sortedIds[6], 'x9', 'unplayable remainder should stay after recommendations');

const firstMeldTiles = [
  { id: 'r5', color: 'red', number: 5, isJoker: false },
  { id: 'b5', color: 'blue', number: 5, isJoker: false },
  { id: 'o5', color: 'orange', number: 5, isJoker: false },
  { id: 'k10', color: 'black', number: 10, isJoker: false },
  { id: 'k11', color: 'black', number: 11, isJoker: false },
  { id: 'k12', color: 'black', number: 12, isJoker: false },
];

assert.deepEqual(
  ctx.findRecommendedSets(firstMeldTiles, false).map(set => set.map(t => t.id)),
  [['k10', 'k11', 'k12'], ['r5', 'b5', 'o5']],
  'first meld recommendations should surface playable sets when their combined score can satisfy 30 points'
);

assert(html.includes('id="btn-play-selected"'), 'UI should expose a selected-tile submit button');
assert(html.includes('selectedIds: new Set()'), 'state should track multiple selected hand tiles');
assert(html.includes('function placeSelectedHandTiles('), 'multi-select submit helper should exist');
assert(html.includes('function undoLastAction('), 'UI should support undoing the previous action, not only full turn reset');
assert(html.includes('actionLocked: false'), 'state should include an action lock to block repeated draw/pass taps');
assert(html.includes('viewPlayerIndex'), 'hand rendering should stay pinned to the human player instead of flashing AI hands');

const behaviorScript = [
  extractFunction('deepCloneBoard'),
  extractFunction('isValidRun'),
  extractFunction('isValidGroup'),
  extractFunction('isValidSet'),
  extractFunction('setScore'),
  extractFunction('normalizeGroupOrder'),
  `const mpState = { active: false, mySeat: -1 };
  const state = {
    players: [{ isAI: false, handIds: ['k1', 'k2', 'k3'] }],
    currentPlayer: 0,
    tileMap: {
      k1: { id: 'k1', color: 'black', number: 1, isJoker: false },
      k2: { id: 'k2', color: 'black', number: 2, isJoker: false },
      k3: { id: 'k3', color: 'black', number: 3, isJoker: false },
    },
    board: [],
    selected: null,
    selectedIds: new Set(),
    activeGid: null,
    actionLocked: false,
    gidCounter: 0,
    recentlyPlaced: new Set(),
    actionHistory: [],
  };
  function render() {}
  function showToast() {}
  function setTimeout(fn) { fn(); }`,
  extractFunction('newGid'),
  extractFunction('pushActionSnapshot'),
  extractFunction('selectTile'),
  extractFunction('createEmptyGroup'),
  extractFunction('orderedHandSelection'),
  extractFunction('orderTilesForSet'),
  extractFunction('placeSelectedHandTiles'),
  extractFunction('undoLastAction'),
  `selectTile('k3', 'hand');
  selectTile('k1', 'hand');
  selectTile('k2', 'hand');
  placeSelectedHandTiles();
  globalThis.multiResult = {
    handIds: state.players[0].handIds,
    board: state.board,
    selectedCount: state.selectedIds.size,
    activeGid: state.activeGid,
  };`,
].join('\n');

const behaviorCtx = {};
vm.createContext(behaviorCtx);
vm.runInContext(behaviorScript, behaviorCtx);

assert.deepEqual(behaviorCtx.multiResult.handIds, [], 'selected tiles should be removed from hand');
assert.deepEqual(behaviorCtx.multiResult.board[0].tileIds, ['k1', 'k2', 'k3'], 'selected run should submit together in playable order');
assert.equal(behaviorCtx.multiResult.selectedCount, 0, 'selection should clear after submit');
assert.equal(behaviorCtx.multiResult.activeGid, behaviorCtx.multiResult.board[0].gid, 'submitted group should become active');

const undoScript = [
  extractFunction('deepCloneBoard'),
  extractFunction('isValidRun'),
  extractFunction('isValidGroup'),
  extractFunction('isValidSet'),
  extractFunction('setScore'),
  extractFunction('normalizeGroupOrder'),
  `const state = {
    players: [{ isAI: false, handIds: ['k1', 'k2', 'k3'] }],
    currentPlayer: 0,
    tileMap: {
      k1: { id: 'k1', color: 'black', number: 1, isJoker: false },
      k2: { id: 'k2', color: 'black', number: 2, isJoker: false },
      k3: { id: 'k3', color: 'black', number: 3, isJoker: false },
    },
    board: [],
    selected: null,
    selectedIds: new Set(['k3', 'k1', 'k2']),
    activeGid: null,
    gidCounter: 0,
    recentlyPlaced: new Set(),
    actionHistory: [],
  };
  function render() {}
  function showToast() {}
  function setTimeout(fn) { fn(); }`,
  extractFunction('newGid'),
  extractFunction('pushActionSnapshot'),
  extractFunction('createEmptyGroup'),
  extractFunction('orderedHandSelection'),
  extractFunction('orderTilesForSet'),
  extractFunction('placeSelectedHandTiles'),
  extractFunction('undoLastAction'),
  `placeSelectedHandTiles();
  const afterPlace = { handIds: [...state.players[0].handIds], boardIds: [...state.board[0].tileIds] };
  undoLastAction();
  globalThis.undoResult = {
    afterPlace,
    handIds: state.players[0].handIds,
    board: state.board,
    selectedCount: state.selectedIds.size,
  };`,
].join('\n');

const undoCtx = {};
vm.createContext(undoCtx);
vm.runInContext(undoScript, undoCtx);

assert.deepEqual(undoCtx.undoResult.afterPlace.boardIds, ['k1', 'k2', 'k3'], 'submitted tiles should be normalized on the board');
assert.deepEqual(undoCtx.undoResult.handIds, ['k1', 'k2', 'k3'], 'undo should restore the hand before the previous action');
assert.deepEqual(undoCtx.undoResult.board, [], 'undo should remove the just-created group');
assert.equal(undoCtx.undoResult.selectedCount, 0, 'undo should clear transient selection');

const passLockScript = [
  extractFunction('deepCloneBoard'),
  `const mpState = { active: false, mySeat: -1 };`,
  `const state = {
    players: [{ isAI: false, handIds: ['h1'] }, { isAI: true, handIds: [] }],
    currentPlayer: 0,
    board: [],
    drawPile: ['d1', 'd2'],
    turnState: { boardSnapshot: [], handSnapshot: ['h1'] },
    selected: null,
    selectedIds: new Set(),
    activeGid: null,
    consecutivePasses: 0,
    actionLocked: false,
    pendingTurnTimer: null,
  };
  let scheduled = 0;
  function setTimeout(fn) { scheduled++; state.pendingTurnTimer = 'queued'; return 'queued'; }
  function clearTimeout() {}
  function stopTimer() {}
  function render() {}
  function showToast() {}
  function showStalemate() {}
  function nextPlayer() { state.currentPlayer++; }`,
  extractFunction('scheduleNextPlayer'),
  extractFunction('passTurn'),
  `passTurn();
  passTurn();
  globalThis.passLockResult = {
    handIds: state.players[0].handIds,
    drawPile: state.drawPile,
    scheduled,
    actionLocked: state.actionLocked,
    currentPlayer: state.currentPlayer,
  };`,
].join('\n');

const passLockCtx = {};
vm.createContext(passLockCtx);
vm.runInContext(passLockScript, passLockCtx);

assert.deepEqual(passLockCtx.passLockResult.handIds, ['h1', 'd1'], 'double tapping draw should only draw one tile');
assert.deepEqual(passLockCtx.passLockResult.drawPile, ['d2'], 'double tapping draw should leave the second draw tile in the pile');
assert.equal(passLockCtx.passLockResult.scheduled, 1, 'double tapping draw should only schedule one turn transition');
assert.equal(passLockCtx.passLockResult.actionLocked, true, 'draw should lock actions until the next turn starts');
assert.equal(passLockCtx.passLockResult.currentPlayer, 0, 'draw should not advance synchronously into the AI turn');

console.log('PASS ppingpae recommendation and multi-select contract');

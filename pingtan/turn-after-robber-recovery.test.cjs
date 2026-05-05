const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`Function not found: ${name}`);
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`Could not parse ${name}`);
}

const script = [
  extractFunction('normalizeTurnPhaseForDice'),
  'globalThis.normalizeTurnPhaseForDice = normalizeTurnPhaseForDice;'
].join('\n');

const ctx = {
  state: {
    screen: 'game',
    winner: null,
    phase: 'main',
    canEndTurn: true,
    currentPlayer: 1,
    lastDiceSum: 0,
    lastDiceValues: null,
    players: [{ name: 'A' }, { name: '내차례' }]
  },
  getCurrentPlayer: () => ({ name: '내차례' }),
  pt: (key, vars = {}) => key === 'turnRollHint' ? `${vars.player}의 차례: 주사위를 굴리세요.` : key
};
vm.createContext(ctx);
vm.runInContext(script, ctx);

assert.equal(ctx.normalizeTurnPhaseForDice(), true, 'invalid new turn main phase should be recovered');
assert.equal(ctx.state.phase, 'roll', 'turn should return to dice roll phase');
assert.equal(ctx.state.canEndTurn, false, 'turn should not be endable before dice roll');
assert(ctx.state.hint.includes('주사위'), 'hint should tell the player to roll dice');

ctx.state.lastDiceSum = 8;
ctx.state.lastDiceValues = [4, 4];
ctx.state.phase = 'main';
ctx.state.canEndTurn = true;
ctx.state.hint = '';
assert.equal(ctx.normalizeTurnPhaseForDice(), false, 'normal post-roll main phase should not be changed');
assert.equal(ctx.state.phase, 'main');

console.log('PASS pingtan turn-after-robber dice recovery');

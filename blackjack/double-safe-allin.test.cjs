const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`Function not found: ${name}`);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`Could not parse function: ${name}`);
}

const getDoubleSafeMaxBet = eval(`(${extractFunction('getDoubleSafeMaxBet').replace('function getDoubleSafeMaxBet', 'function')})`);
const generateBetAmounts = eval(`(${extractFunction('generateBetAmounts').replace('function generateBetAmounts', 'function')})`);

assert.strictEqual(getDoubleSafeMaxBet(1999), 999, 'double-safe max should floor odd wallet halves');
assert.strictEqual(getDoubleSafeMaxBet(2000), 1000, 'double-safe max should allow exact half');

for (const wallet of [1999, 2019, 9999, 19999, 199999, 1999999]) {
  const max = getDoubleSafeMaxBet(wallet);
  const amounts = generateBetAmounts(max);
  assert.strictEqual(amounts.at(-1), max, `last quick bet should be exact floor half for wallet ${wallet}`);
  assert(amounts.every((amount) => amount <= max), `quick bets must not exceed double-safe max for wallet ${wallet}`);
}

assert(html.includes('const gold = getDoubleSafeMaxBet(state.gold);'), 'solo ALL should bet the double-safe max, not full wallet');
assert(html.includes('amount = Math.min(getDoubleSafeMaxBet(state.gold), MULTI_BET_MAX);'), 'multi ALL should use double-safe max with the multi cap');
assert(html.includes('SFX.allInVoice();'), 'ALL bet should trigger the all-in voice cue');

console.log('PASS blackjack double-safe all-in betting');

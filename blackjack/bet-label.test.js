const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`Function not found: ${name}`);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`Could not parse function: ${name}`);
}

const formatBetLabel = eval(`(${extractFunction('formatBetLabel').replace('function formatBetLabel', 'function')})`);

assert.equal(formatBetLabel(1500), '1K', 'bet labels should floor K units instead of showing decimals');
assert.equal(formatBetLabel(9999), '9K', 'bet labels should never show decimal K values');
assert.equal(formatBetLabel(1250000), '1M', 'bet labels should floor M units instead of showing decimals');
assert(!formatBetLabel(1500).includes('.'), 'button labels should not contain decimal points');

console.log('PASS blackjack bet label flooring');

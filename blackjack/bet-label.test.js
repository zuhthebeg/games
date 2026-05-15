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
const renderBetButtons = eval(`(${extractFunction('renderBetButtons').replace('function renderBetButtons', 'function')})`);

assert.equal(formatBetLabel(1500), '1K', 'bet labels should floor K units instead of showing decimals');
assert.equal(formatBetLabel(9999), '9K', 'bet labels should never show decimal K values');
assert.equal(formatBetLabel(1250000), '1M', 'bet labels should floor M units instead of showing decimals');
assert(!formatBetLabel(1500).includes('.'), 'button labels should not contain decimal points');

global.generateBetAmounts = () => [40, 100, 200, 500, 6172];
global.document = {
  getElementById(id) {
    assert.equal(id, 'dynamicBetButtons');
    return this.container;
  },
  container: { innerHTML: '' }
};

renderBetButtons(6172, 'dynamicBetButtons', 'data-bet', 'HALF');
assert(document.container.innerHTML.includes('data-bet="6172"'), 'half button should preserve the actual floored bet amount');
assert(document.container.innerHTML.includes('>HALF</button>'), 'last dynamic bet button should render as HALF');
assert(!document.container.innerHTML.includes('6.172K'), 'half button label should not expose decimal K text');

console.log('PASS blackjack bet label flooring and half button');

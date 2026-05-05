const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

function extractConst(name) {
  const marker = `const ${name} =`;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`Const not found: ${name}`);
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1) + ';';
    }
  }
  throw new Error(`Could not parse const ${name}`);
}

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`Function not found: ${name}`);
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`Could not parse function ${name}`);
}


function extractPresetAssignments() {
  const start = html.indexOf('// ── Phase B: 별 1개 맵 6종');
  const end = html.indexOf('function resolveMapPreset', start);
  if (start === -1 || end === -1) throw new Error('preset block not found');
  return html.slice(start, end);
}

const script = [
  extractConst('MAP_PRESETS'),
  extractPresetAssignments(),
  extractFunction('resolveMapPreset'),
  extractFunction('clampTargetScore'),
  extractFunction('defaultTargetScoreForMap'),
  extractFunction('targetScoreForMap'),
  extractFunction('victoryPrizeForMap'),
  'globalThis.victoryPrizeForMap = victoryPrizeForMap;'
].join('\n');

const ctx = { state: { selectedMapId: 'standard', targetScore: 10 } };
vm.createContext(ctx);
vm.runInContext(script, ctx);

assert.equal(ctx.victoryPrizeForMap('standard', 10), 1000000, 'standard 10VP should keep existing 1-star prize');
assert.equal(ctx.victoryPrizeForMap('standard', 20), 2000000, '20VP should double standard prize');
assert.equal(ctx.victoryPrizeForMap('standard', 5), 500000, '5VP should halve standard prize');
assert.equal(ctx.victoryPrizeForMap('mega-catan', 13), 3000000, 'default mega prize should keep existing 3-star prize');
assert.equal(ctx.victoryPrizeForMap('mega-catan', 20), 4615385, 'custom mega prize should scale from default VP ratio');

assert(html.includes('victoryPrizeForMap(state.selectedMapId)'), 'wallet reward should use VP-scaled prize helper');
assert(html.includes('victoryPrizeForMap(state.selectedMapId)'), 'winner modal should use VP-scaled prize helper');
assert(html.includes('const prize = victoryPrizeForMap'), 'winner UI should render scaled prize');

console.log('PASS pingtan VP-scaled victory prize');

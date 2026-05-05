const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

function extractConst(name) {
  const marker = `const ${name} =`;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`Const not found: ${name}`);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1) + ';';
    }
  }
  throw new Error(`Could not parse const: ${name}`);
}

function extractNamedFunctionSource(name, nextName) {
  const start = html.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`Function not found: ${name}`);
  const end = nextName ? html.indexOf(`function ${nextName}(`, start) : -1;
  return html.slice(start, end === -1 ? html.length : end).trim();
}

const script = [
  extractConst('RESOURCE_ICONS'),
  extractNamedFunctionSource('getDiceRevealDelayMs', 'getHexLabel'),
  extractNamedFunctionSource('formatRobberMoveMessage', 'getLongestRoadBadge'),
  extractNamedFunctionSource('getLongestRoadBadge', 'handleSeven')
].join('\n');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(script, ctx);

assert.equal(ctx.getDiceRevealDelayMs(), 1000, 'dice reveal delay should be 1 second');

const msg = ctx.formatRobberMoveMessage({
  actorName: '티오',
  source: '기사',
  hexLabel: '6번 밀',
  victimName: 'cocy',
  stolenResource: 'grain'
});
assert.equal(msg, '티오가 기사로 6번 밀에 도둑을 옮기고 cocy에게서 🌾 1장을 가져갔습니다.');

const noVictimMsg = ctx.formatRobberMoveMessage({
  actorName: 'AI 1',
  source: '도둑',
  hexLabel: '8번 광석',
  victimName: '',
  stolenResource: null
});
assert.equal(noVictimMsg, 'AI 1가 도둑으로 8번 광석에 도둑을 옮겼지만 훔칠 대상은 없었습니다.');

assert.equal(ctx.getLongestRoadBadge(true), '🛣️');
assert.equal(ctx.getLongestRoadBadge(false), '');

console.log('PASS catan ui feedback helpers');

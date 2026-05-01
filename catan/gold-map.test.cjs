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

function extractFunction(name, nextName) {
  const start = html.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`Function not found: ${name}`);
  if (nextName) {
    const end = html.indexOf(`function ${nextName}(`, start);
    return html.slice(start, end === -1 ? html.length : end).trim();
  }
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1).trim();
    }
  }
  throw new Error(`Could not parse function: ${name}`);
}

function extractPresetAssignments() {
  const start = html.indexOf('// ── Phase B: 별 1개 맵 6종');
  const end = html.indexOf('function resolveMapPreset', start);
  if (start === -1 || end === -1) throw new Error('Could not locate preset assignment block');
  return html.slice(start, end);
}

const helperScript = [
  extractConst('RESOURCES'),
  extractConst('MAP_PRESETS'),
  extractPresetAssignments(),
  extractFunction('resolveMapPreset', 'assignBalancedNumbers'),
  extractFunction('assignBalancedNumbers', 'resolveProducedResources'),
  extractFunction('resolveProducedResources'),
  extractFunction('buildHexesFromPreset', 'generateBoard')
].join('\n');

const helperCtx = {
  shuffle: (arr) => arr.slice()
};
vm.createContext(helperCtx);
vm.runInContext(helperScript, helperCtx);

assert.equal(JSON.stringify(helperCtx.resolveProducedResources('grain', 2, 'ore')), JSON.stringify({ grain: 2 }), 'normal resource tiles should ignore preferred resource');
assert.equal(JSON.stringify(helperCtx.resolveProducedResources('gold', 1, 'ore')), JSON.stringify({ ore: 1 }), 'gold settlement should resolve to chosen resource');
assert.equal(JSON.stringify(helperCtx.resolveProducedResources('gold', 2, 'grain')), JSON.stringify({ grain: 2 }), 'gold city should resolve to 2 of chosen resource');
assert.equal(JSON.stringify(helperCtx.resolveProducedResources('gold', 1, 'invalid')), JSON.stringify({ brick: 1 }), 'gold should fall back safely when invalid resource is requested');

const goldPreset = helperCtx.resolveMapPreset('gold-rush');
assert.equal(goldPreset.vpGoal, 10, 'gold rush preset should have vp goal 10');
const goldHexes = helperCtx.buildHexesFromPreset('gold-rush');
assert.equal(goldHexes.length, 19, 'gold rush should have 19 hexes');
assert.equal(goldHexes.filter(h => h.type === 'gold').length, 3, 'gold rush should include 3 gold tiles');
assert(html.includes('gold: "💰"'), 'gold tiles should keep the money-bag icon');
assert(html.includes('💰 금광 수확!'), 'gold picker should keep money-bag title');
assert(html.includes('보유 ${(currentResources&&currentResources[r])||0}개'), 'gold picker should show currently owned resources');
assert(html.includes('10초 안에 고르지 않으면 랜덤 지급'), 'gold picker should explain timeout random fallback');

const twinPreset = helperCtx.resolveMapPreset('twin-continents');
assert.equal(twinPreset.vpGoal, 11, 'twin continents should have vp goal 11');
const twinHexes = helperCtx.buildHexesFromPreset('twin-continents');
assert.equal(twinHexes.length, 20, 'twin continents should have 20 hexes');
assert.equal(twinHexes.filter(h => h.type === 'strait').length, 1, 'twin continents should include 1 strait tile');

const gameplayScript = [
  'const BANK_MAX = 19;',
  extractConst('RESOURCES'),
  extractFunction('emptyResources', 'makePlayer'),
  extractFunction('makePlayer', 'resetCoreState'),
  extractFunction('isMultiMode', 'localPlayerIndex'),
  extractFunction('localPlayerIndex', 'isHumanTurn'),
  extractFunction('resolveProducedResources', 'buildHexesFromPreset'),
  extractFunction('pickBestAIGoldResource', 'distributeResources'),
  extractFunction('distributeResources', 'getDiceRevealDelayMs'),
  extractFunction('bankRemaining', 'resourceStrip')
].join('\n');

const gameplayCtx = {
  state: {
    mode: 'single',
    currentPlayer: 0,
    robber: -1,
    _pendingHumanGold: 0,
    players: [
      { name: '나', isAI: false, resources: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 } },
      { name: 'AI 1', isAI: true, resources: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 } }
    ],
    hexes: [
      { index: 0, number: 8, type: 'gold', vertices: [0, 1], robber: false }
    ],
    vertices: [
      { building: 'settlement', owner: 0 },
      { building: 'city', owner: 1 }
    ]
  },
  RESOURCE_ICONS: { brick: '🧱', lumber: '🪵', wool: '🐑', grain: '🌾', ore: '⛏️' },
  SFX: { resource() {} },
  showToast() {},
  openGoldPickModal() {}
};
vm.createContext(gameplayCtx);
vm.runInContext(gameplayScript, gameplayCtx);
gameplayCtx.distributeResources(8);

assert.equal(gameplayCtx.state._pendingHumanGold, 1, 'human gold production should defer 1 resource into pending picker state');
assert.equal(gameplayCtx.state.players[0].resources.brick, 0, 'human gold production should not auto-grant before picker resolves');
assert.equal(gameplayCtx.state.players[1].resources.grain, 2, 'ai gold city production should grant 2 grain by default');

console.log('PASS gold rush + twin continents helpers');

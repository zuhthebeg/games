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

const mapScript = [
  'const RESOURCES = ["brick","lumber","wool","grain","ore"];',
  extractFunction('shuffle'),
  extractConst('MAP_PRESETS'),
  extractPresetAssignments(),
  extractFunction('resolveMapPreset'),
  extractFunction('assignBalancedNumbers'),
  extractFunction('buildHexesFromPreset'),
  extractFunction('generateBoard'),
  extractFunction('generatePorts'),
  extractFunction('buildGraph')
].join('\n');

const mapCtx = { Math, state: {} };
vm.createContext(mapCtx);
vm.runInContext(mapScript, mapCtx);
mapCtx.generateBoard([], 'crescent-pingtan');
assert.equal(mapCtx.state.hexes.length, 19, 'crescent should generate from selected map when snapshot hexes are empty');
assert(mapCtx.state.vertices.length > 0, 'crescent should have vertices');
assert(mapCtx.state.edges.length > 0, 'crescent should have edges');
assert.equal(mapCtx.state.ports.length, 9, 'crescent should generate all ports');

const logScript = [
  extractFunction('clampTurnSeconds'),
  extractFunction('clampTargetScore'),
  extractFunction('addGameSettingsChangeLogs'),
  'globalThis.addGameSettingsChangeLogs = addGameSettingsChangeLogs;'
].join('\n');
const logs = [];
const logCtx = {
  state: {},
  addActivityLog: (kind, message) => logs.push({ kind, message }),
  pt: (key, vars = {}) => key === 'turnTimeChangedLog' ? `턴 시간 변경: ${vars.seconds}초` : key === 'victoryVpChangedLog' ? `승리 VP 변경: ${vars.vp}점` : key
};
vm.createContext(logCtx);
vm.runInContext(logScript, logCtx);
logCtx.addGameSettingsChangeLogs({ turnSeconds: 60, targetScore: 10 }, { turnSeconds: 90, targetScore: 12 });
assert(logs.some(x => x.message === '턴 시간 변경: 90초'), 'turn seconds change should be logged separately');
assert(logs.some(x => x.message === '승리 VP 변경: 12점'), 'victory VP change should be logged separately');

console.log('PASS crescent map fallback and settings change logs');

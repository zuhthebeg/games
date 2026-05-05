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
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1) + ';';
    }
  }
  throw new Error(`Could not parse const: ${name}`);
}

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = html.indexOf(marker);
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

function extractPresetAssignments() {
  const start = html.indexOf('// ── Phase B: 별 1개 맵 6종');
  const end = html.indexOf('function resolveMapPreset', start);
  if (start === -1 || end === -1) throw new Error('Could not locate preset assignment block');
  return html.slice(start, end);
}

const script = [
  extractFunction('shuffle'),
  extractFunction('clone'),
  extractConst('MAP_PRESETS'),
  extractPresetAssignments(),
  extractFunction('resolveMapPreset'),
  extractFunction('assignBalancedNumbers'),
  extractFunction('buildHexesFromPreset'),
  extractFunction('generateBoard'),
  extractFunction('generatePorts'),
  extractFunction('buildGraph'),
  'globalThis.MAP_PRESETS = MAP_PRESETS; globalThis.state = { hexes: [], vertices: [], edges: [], geometry: {}, ports: [] };'
].join('\n');

const ctx = { Math: Object.create(Math) };
ctx.Math.random = () => 0.42;
vm.createContext(ctx);
vm.runInContext(script, ctx);

for (const mapId of Object.keys(ctx.MAP_PRESETS)) {
  ctx.generateBoard(null, mapId);
  const angles = ctx.state.ports.map(port => {
    const a = ctx.state.vertices[port.vertices[0]];
    const b = ctx.state.vertices[port.vertices[1]];
    return Math.atan2((a.y + b.y) / 2, (a.x + b.x) / 2) * 180 / Math.PI;
  }).sort((a, b) => a - b);
  const gaps = angles.map((a, i) => (angles[(i + 1) % angles.length] - a + 360) % 360);
  const maxGap = Math.max(...gaps);
  assert(maxGap < 100, `${mapId} ports are clustered; max angular gap ${maxGap.toFixed(1)}°`);
}

assert(html.includes('outerEdges'), 'ports should be placed on perimeter edges, not consecutive angle-sorted vertices');
assert(!html.includes('selectedVertexCount = portCount * 2'), 'old vertex selection clusters ports on one side');

console.log('PASS catan port distribution');

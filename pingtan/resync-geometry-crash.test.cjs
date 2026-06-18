// 회귀: 좀비방 입장 시 __resync 스냅샷만으로 복원하면 보드 렌더가 터지던 버그.
// 원인: createpingtanStateSnapshot은 state.geometry(centers/bounds/size)를 안 담는다(파생값).
//   보드를 한 번도 안 그린 입장자는 geometry.centers=[] → render 7534의
//   `state.geometry.centers[hex.index].x` 가 undefined.x → "Cannot read properties of undefined (reading 'x')".
// 수정: applypingtanStateSnapshot이 hexes로부터 geometry를 재계산한다.
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
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return html.slice(start, i + 1); }
  }
  throw new Error(`Could not parse function: ${name}`);
}
function extractConst(name) {
  const marker = `const ${name} =`;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`Const not found: ${name}`);
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return html.slice(start, i + 1) + ';'; }
  }
  throw new Error(`Could not parse const: ${name}`);
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
  extractFunction('buildGraph'),
  extractFunction('generatePorts'),
  extractFunction('computeIslandClusters'),
  extractFunction('generateBoard'),
  extractFunction('createpingtanStateSnapshot'),
  extractFunction('applypingtanStateSnapshot'),
  // apply가 호출하는 의존성은 이 회귀에 무관 → 가벼운 스텁.
  'globalThis.recalcAllVP = function(){};',
  'globalThis.state = { screen:"game", mode:"multi", hexes:[], vertices:[], edges:[], geometry:{ centers:[], minX:0,minY:0,maxX:0,maxY:0,size:0 }, ports:[], players:[], robber:-1 };',
].join('\n');

const ctx = { Math: Object.create(Math), console };
ctx.Math.random = () => 0.42;
vm.createContext(ctx);
vm.runInContext(script, ctx);

// 1) 호스트가 보드를 만들고 스냅샷을 찍는다(geometry는 스냅샷에서 빠짐).
ctx.generateBoard(null, 'standard');
ctx.state.players = [{ color: '#e11', name: 'A' }, { color: '#1a1', name: 'B' }];
const snap = vm.runInContext('createpingtanStateSnapshot()', ctx);
assert(snap.geometry === undefined, '스냅샷은 geometry를 담지 않아야 한다(파생값) — 그래서 재계산이 필요');
assert(Array.isArray(snap.hexes) && snap.hexes.length > 0, '스냅샷에 hexes가 있어야 함');

// 2) 신규 입장자: 보드를 한 번도 안 그림 → geometry 비어있음.
ctx.state.hexes = [];
ctx.state.vertices = [];
ctx.state.edges = [];
ctx.state.geometry = { centers: [], minX: 0, minY: 0, maxX: 0, maxY: 0, size: 0 };

// 3) resync 스냅샷 적용.
const ok = vm.runInContext(`applypingtanStateSnapshot(${JSON.stringify(snap)})`, ctx);
assert(ok === true, 'applypingtanStateSnapshot은 유효 스냅샷에 true를 반환');

// 4) 핵심 단언: geometry가 hexes 기준으로 재계산됐는가.
assert.strictEqual(
  ctx.state.geometry.centers.length, ctx.state.hexes.length,
  'resync 후 geometry.centers가 hexes 수만큼 재계산돼야 함'
);

// 5) render의 hex 루프(index.html:7534)를 그대로 흉내 → 더 이상 안 터지는지.
for (const hex of ctx.state.hexes) {
  const c = ctx.state.geometry.centers[hex.index];
  assert(c && typeof c.x === 'number' && typeof c.y === 'number',
    `hex#${hex.index}의 center가 유효해야 함(이게 없으면 c.x 크래시)`);
}

// 6) 소스에 재계산 로직이 실제로 들어있는지(회귀 가드).
assert(html.includes('geometry 재계산') || /state\.geometry\s*=\s*\{\s*centers:\s*g\.centers/.test(html),
  'applypingtanStateSnapshot에 geometry 재계산 코드가 있어야 함');

console.log('PASS pingtan resync geometry crash');

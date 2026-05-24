const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
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

const script = [
  extractFunction('isValidRun'),
  extractFunction('isValidGroup'),
  extractFunction('isValidSet'),
].join('\n');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(script, ctx);

const J = (id = 'j1') => ({ id, color: 'joker', number: 0, isJoker: true });
const T = (color, number, id) => ({ id: id || `${color[0]}${number}`, color, number, isJoker: false });

// === RUN: 조커가 양끝을 확장하는 경우 ===

// 끝에서 확장: [5,6,joker] = 5-6-7 또는 4-5-6
assert(ctx.isValidRun([T('red', 5), T('red', 6), J()]),
  '[red5, red6, joker]는 5-6-7로 유효해야 함 (조커가 끝에서 확장)');

// 시작에서 확장: [joker,12,13] = 11-12-13
assert(ctx.isValidRun([J(), T('blue', 12), T('blue', 13)]),
  '[joker, blue12, blue13]은 11-12-13으로 유효해야 함');

// 양끝 모두: [joker,7,joker] = 6-7-8 등
assert(ctx.isValidRun([J('j1'), T('black', 7), J('j2')]),
  '[joker, 7, joker]는 6-7-8로 유효해야 함');

// 끝쪽 13 한계: [12,13,joker] = 11-12-13 (12-13-14 불가)
assert(ctx.isValidRun([T('orange', 12), T('orange', 13), J()]),
  '[orange12, orange13, joker]는 11-12-13으로 유효');

// 시작쪽 1 한계: [joker,1,2] = 1-2-3 (0-1-2 불가, joker는 3 자리)
assert(ctx.isValidRun([J(), T('orange', 1), T('orange', 2)]),
  '[joker, orange1, orange2]는 1-2-3로 유효');

// 중간 간격 채우기 (기존 동작)
assert(ctx.isValidRun([T('red', 4), J(), T('red', 6)]),
  '[red4, joker, red6]은 4-5-6으로 유효');

// 조커 2개로 끝 확장: [joker,joker,5] = 5-6-7 또는 3-4-5
assert(ctx.isValidRun([J('j1'), J('j2'), T('black', 5)]),
  '[joker, joker, black5]는 5-6-7 등으로 유효');

// === RUN: 무효 케이스 ===

assert(!ctx.isValidRun([T('red', 1), T('red', 13), J()]),
  '[red1, red13, joker]는 길이 3에 비해 범위가 너무 커서 무효');

assert(!ctx.isValidRun([T('red', 5), T('blue', 6), J()]),
  '색이 다른 [red5, blue6, joker]는 무효');

assert(!ctx.isValidRun([T('red', 5), T('red', 5), J()]),
  '같은 숫자 중복 [red5, red5, joker]는 무효');

assert(!ctx.isValidRun([T('red', 5), J()]),
  '2장 [red5, joker]는 무효 (최소 3장)');

// === GROUP: 조커 케이스 ===

assert(ctx.isValidGroup([T('red', 3), T('black', 3), J()]),
  '[red3, black3, joker]는 유효한 그룹 (조커가 다른 색의 3)');

assert(ctx.isValidGroup([T('red', 3), T('black', 3), T('blue', 3), J()]),
  '[red3, black3, blue3, joker]는 유효한 4장 그룹');

assert(!ctx.isValidGroup([T('red', 3), T('red', 3), J()]),
  '같은 색 중복은 무효');

assert(!ctx.isValidGroup([T('red', 3), T('black', 3), T('blue', 3), T('orange', 3), J()]),
  '5장 그룹은 무효 (최대 4장)');

// === 사용자 시나리오 통합: [3,3,joker]에서 조커를 빼서 [5,6,joker] 새 조합 ===
const groupBefore = [T('red', 3, 'r3'), T('black', 3, 'k3'), J('jx')];
assert(ctx.isValidSet(groupBefore), '시작 상태 [red3, black3, joker]는 유효');

// 조커를 빼고 새로운 3 추가
const groupAfter = [T('red', 3, 'r3'), T('black', 3, 'k3'), T('blue', 3, 'b3')];
assert(ctx.isValidSet(groupAfter), '조커 제거 후 [red3, black3, blue3]는 유효한 그룹');

// 빠진 조커를 5,6 옆에 붙임
const newRun = [T('orange', 5, 'o5'), T('orange', 6, 'o6'), J('jx')];
assert(ctx.isValidSet(newRun), '[orange5, orange6, joker]는 유효한 런 (수정 후)');

// === orderTilesForSet: 조커가 올바른 자리에 표시되는지 ===
const orderScript = [
  extractFunction('isValidRun'),
  extractFunction('isValidGroup'),
  extractFunction('isValidSet'),
  `const tileMap = {};
   const state = { tileMap };
   function makeTile(t) { tileMap[t.id] = t; return t; }`,
  extractFunction('orderTilesForSet'),
].join('\n');

const orderCtx = {};
vm.createContext(orderCtx);
vm.runInContext(orderScript, orderCtx);

function runOrder(tiles) {
  tiles.forEach(t => orderCtx.makeTile(t));
  return orderCtx.orderTilesForSet(tiles.map(t => t.id));
}

// [4, 6, joker] → 조커가 5 자리에 들어가야 함
const ordered1 = runOrder([T('red', 6, 'r6'), T('red', 4, 'r4'), J('jA')]);
assert.deepEqual(ordered1, ['r4', 'jA', 'r6'],
  '런 [4,6,joker]는 [4, joker(=5), 6] 순서로 표시');

// [5, 6, joker] → 조커는 끝 (= 7)
const ordered2 = runOrder([T('blue', 5, 'b5'), T('blue', 6, 'b6'), J('jB')]);
assert.deepEqual(ordered2, ['b5', 'b6', 'jB'],
  '런 [5,6,joker]는 [5, 6, joker(=7)] 순서');

// [12, 13, joker] → 조커는 앞 (= 11)
const ordered3 = runOrder([T('black', 12, 'k12'), T('black', 13, 'k13'), J('jC')]);
assert.deepEqual(ordered3, ['jC', 'k12', 'k13'],
  '런 [12,13,joker]는 [joker(=11), 12, 13] 순서');

console.log('PASS ppingpae joker validation');

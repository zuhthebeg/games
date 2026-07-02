'use strict';
// physics-presets.cjs — 프리셋 해법 재검증 + 실패 시 근방 재탐색 (node physics-presets.cjs)
const fs = require('fs'), path = require('path');
const physSrc = fs.readFileSync(path.join(__dirname, 'physics.js'), 'utf8');
const sandbox = {};
new Function('module', 'require', physSrc + '\n; this.simulate=simulate; this.PHYSICS=PHYSICS;').call(sandbox, { exports: {} }, () => ({ main: null }));
const { simulate, PHYSICS } = sandbox;
const MAXPOW = 8600;

// index.html PRESETS 사본 (b:[[id,fx,fy]], sol=대대, solM=중대)
const PRESETS = [
  { n: '초구',      b: [[0, .75, .37], [1, .75, .50], [2, .25, .50]], sol: { aim: 171.6, pow: 80, sx: 0.2, sy: 0, stroke: 'follow' },  solM: { aim: 176.6, pow: 55, sx: 0.5, sy: -0.2, stroke: 'follow' } },
  { n: '옆돌리기',   b: [[0, .80, .30], [2, .55, .50], [1, .30, .70]], sol: { aim: 155.2, pow: 82, sx: 0, sy: 0.2, stroke: 'normal' },  solM: { aim: 155.7, pow: 77, sx: 0.3, sy: 0.2, stroke: 'normal' } },
  { n: '뒤돌리기',   b: [[0, .85, .22], [2, .55, .50], [1, .28, .30]], sol: { aim: 177, pow: 85, sx: -0.3, sy: -0.1, stroke: 'normal' }, solM: { aim: 173, pow: 82, sx: -0.3, sy: 0, stroke: 'normal' } },
  { n: '앞돌리기',   b: [[0, .82, .50], [2, .50, .32], [1, .40, .68]], sol: { aim: 170.4, pow: 80, sx: 0.1, sy: 0, stroke: 'normal' },  solM: { aim: 166.4, pow: 80, sx: 0.3, sy: 0.2, stroke: 'normal' } },
  { n: '제각돌리기', b: [[0, .75, .20], [2, .45, .40], [1, .62, .66]], sol: { aim: 163.6, pow: 85, sx: 0.2, sy: 0, stroke: 'normal' },  solM: { aim: 165.6, pow: 85, sx: 0.3, sy: 0.2, stroke: 'normal' } },
  { n: '횡단',      b: [[0, .85, .50], [2, .50, .18], [1, .50, .82]], sol: { aim: -157.9, pow: 80, sx: 0, sy: -0.2, stroke: 'normal' }, solM: { aim: -158.9, pow: 75, sx: 0, sy: 0, stroke: 'normal' } },
];

function tableFor(medium) {
  return medium
    ? { mode: '3ball-medium', tw: PHYSICS.TABLE_W_MEDIUM, th: PHYSICS.TABLE_H_MEDIUM, r: PHYSICS.BALL_RADIUS_MEDIUM }
    : { mode: '3ball', tw: PHYSICS.TABLE_W_LARGE, th: PHYSICS.TABLE_H_LARGE, r: PHYSICS.BALL_RADIUS_LARGE };
}

function tryShot(preset, sol, medium) {
  const tb = tableFor(medium);
  const rad = sol.aim * Math.PI / 180;
  const v = sol.pow / 100 * MAXPOW;
  const balls = preset.b.map(([id, fx, fy]) => ({
    id, x: fx * tb.tw, y: fy * tb.th,
    vx: id === 0 ? Math.cos(rad) * v : 0, vy: id === 0 ? Math.sin(rad) * v : 0,
    spinX: id === 0 ? sol.sx : 0, spinY: id === 0 ? sol.sy : 0,
  }));
  const res = simulate({ mode: tb.mode, tableW: tb.tw, tableH: tb.th, ballRadius: tb.r, balls, cueId: 0, stroke: sol.stroke });
  return res.score === 1;
}

function search(preset, sol, medium) {
  // 단계적 근방 탐색: 각도 → 각도×파워 → 각도×파워×스핀
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const stages = [
    { aims: 61, aStep: 0.4, pows: [0], sxs: [0], sys: [0], strokes: [sol.stroke] },
    { aims: 61, aStep: 0.4, pows: [-8, -4, 4, 8], sxs: [0], sys: [0], strokes: [sol.stroke] },
    { aims: 41, aStep: 0.6, pows: [-8, 0, 8], sxs: [-0.2, 0.2], sys: [-0.2, 0.2], strokes: [sol.stroke] },
    { aims: 41, aStep: 0.6, pows: [-10, 0, 10], sxs: [-0.3, 0, 0.3], sys: [-0.2, 0, 0.2], strokes: ['normal', 'follow'] },
  ];
  for (const st of stages) {
    for (let i = 0; i < st.aims; i++) {
      // 0, +s, -s, +2s, -2s ... 순서로 가까운 각도부터
      const k = i === 0 ? 0 : (i % 2 ? (i + 1) / 2 : -i / 2);
      const aim = sol.aim + k * st.aStep;
      for (const dp of st.pows) for (const dsx of st.sxs) for (const dsy of st.sys) for (const stk of st.strokes) {
        const cand = {
          aim: +aim.toFixed(1), pow: clamp(sol.pow + dp, 45, 98),
          sx: +clamp(sol.sx + dsx, -0.85, 0.85).toFixed(2),
          sy: +clamp(sol.sy + dsy, -0.85, 0.85).toFixed(2), stroke: stk,
        };
        if (tryShot(preset, cand, medium)) return cand;
      }
    }
  }
  return null;
}

let ok = 0, fixed = 0, lost = 0;
const out = [];
for (const p of PRESETS) {
  const row = { n: p.n };
  for (const [key, medium] of [['sol', false], ['solM', true]]) {
    const sol = p[key];
    if (tryShot(p, sol, medium)) { ok++; row[key] = sol; row[key + '_status'] = 'OK(기존)'; continue; }
    const found = search(p, sol, medium);
    if (found) { fixed++; row[key] = found; row[key + '_status'] = '재탐색OK'; }
    else { lost++; row[key] = sol; row[key + '_status'] = '실패'; }
  }
  out.push(row);
}

console.log('=== 프리셋 해법 재검증 (엔진 v2) ===');
for (const r of out) {
  console.log(`\n${r.n}`);
  console.log(`  대대: ${r.sol_status}  ${JSON.stringify(r.sol)}`);
  console.log(`  중대: ${r.solM_status}  ${JSON.stringify(r.solM)}`);
}
console.log(`\n기존유지 ${ok} · 재탐색 ${fixed} · 실패 ${lost} / 12`);

// index.html 갱신용 라인 출력
console.log('\n=== index.html PRESETS 교체 라인 ===');
for (const r of out) {
  const f = s => `{aim:${s.aim},pow:${s.pow},sx:${s.sx},sy:${s.sy},stroke:'${s.stroke}'}`;
  console.log(`  ${r.n}: sol:${f(r.sol)},   solM:${f(r.solM)}`);
}
process.exit(lost ? 1 : 0);

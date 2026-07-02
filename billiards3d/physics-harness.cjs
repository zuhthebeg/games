'use strict';
// physics-harness.cjs — 엔진 거동 리얼리즘 하니스 (node physics-harness.cjs)
// 실물 캐롬 기준 수치(Dr.Dave/캐롬 교본 근사)와 비교해 PASS/FAIL 판정.
const path = require('path');
global.window = undefined;
const { execSync } = require('child_process');
// physics.js는 module 체크로 runTests를 실행하니 require로 로드
const physSrc = require('fs').readFileSync(path.join(__dirname, 'physics.js'), 'utf8');
const sandbox = {};
new Function('module', 'require', physSrc + '\n; this.simulate=simulate; this.makeShotInput=makeShotInput; this.PHYSICS=PHYSICS;').call(sandbox, { exports: {} }, () => ({ main: null }));
const { simulate, makeShotInput, PHYSICS } = sandbox;

let pass = 0, fail = 0;
function check(label, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}: ${label}${detail ? ' — ' + detail : ''}`);
  cond ? pass++ : fail++;
}
function lastPos(res, id) {
  const f = res.frames[res.frames.length - 1].balls;
  return f.find(b => b.id === id);
}
function shot3(balls, extra) {
  return Object.assign(makeShotInput('3ball', balls), extra || {});
}
const CY = 710, TW = 2840, TH = 1420;

console.log('=== 거동 리얼리즘 하니스 v2 ===\n');

// 1) 사이드만 주고 직진 → 자유주행 경로 거의 직선(스쿼트 소각 제외 곡률 없음)
{
  const res = simulate(shot3([
    { id: 0, x: 400, y: CY, vx: 3000, vy: 0, spinX: 0.7, spinY: 0 },
    { id: 1, x: 2700, y: 100, vx: 0, vy: 0 }, { id: 2, x: 2700, y: 1300, vx: 0, vy: 0 },
  ]));
  // 첫 쿠션/충돌 전까지 y 편차
  let maxDev = 0, y0 = null, ang0 = null;
  for (const f of res.frames) {
    const b = f.balls.find(x => x.id === 0);
    if (b.x > 2500) break;
    if (y0 === null) { y0 = b.y; ang0 = Math.atan2(b.vy, b.vx); }
    const expY = y0 + Math.tan(ang0) * (b.x - 400);
    maxDev = Math.max(maxDev, Math.abs(b.y - expY));
  }
  check('사이드 온리 직진: 경로 곡률 < 6mm/2m', maxDev < 6, `dev=${maxDev.toFixed(1)}mm`);
}

// 2) 스트로크: 정면 충돌 후 수구 전진거리 stun < normal < follow, draw는 후퇴
//    (적구가 쿠션 맞고 돌아와 재타격하기 전, 충돌+0.6s 시점에서 측정)
{
  const go = (sy, stroke) => {
    const res = simulate(shot3([
      { id: 0, x: 800, y: CY, vx: 3000, vy: 0, spinX: 0, spinY: sy },
      { id: 1, x: 1600, y: CY, vx: 0, vy: 0 }, { id: 2, x: 100, y: 100, vx: 0, vy: 0 },
    ], { stroke }));
    const hit = res.events.find(e => e.type === 'ball-ball');
    let px = null;
    for (const f of res.frames) { if (f.t <= hit.t + 0.6) px = f.balls.find(b => b.id === 0).x; else break; }
    return px - 1600;
  };
  const st = go(0.3, 'stun'), no = go(0.3, 'normal'), fo = go(0.3, 'follow'), dr = go(-0.7, 'normal');
  check('스트로크 순서: stun < normal < follow 전진', st < no && no < fo, `stun=${st.toFixed(0)} norm=${no.toFixed(0)} follow=${fo.toFixed(0)}mm`);
  check('끌어치기: 충돌 후 후퇴', dr < -100, `draw=${dr.toFixed(0)}mm`);
}

// 3) 쿠션 자연각: 45° 무회전 입사 → 반사각 살짝 짧아짐(tan비 0.75~0.98)
{
  const v = 2500;
  const res = simulate(shot3([
    { id: 0, x: 1400, y: 300, vx: v * 0.707, vy: -v * 0.707, spinX: 0, spinY: 0 },
    { id: 1, x: 100, y: 1300, vx: 0, vy: 0 }, { id: 2, x: 2700, y: 1300, vx: 0, vy: 0 },
  ]));
  const cush = res.events.find(e => e.type === 'cushion');
  // 쿠션 직후 프레임에서 반사각 측정
  let out = null;
  for (const f of res.frames) { if (f.t > cush.t + 0.02) { out = f.balls.find(b => b.id === 0); break; } }
  const ratio = Math.abs(out.vx / out.vy);   // in: |vx/vy|=1
  check('쿠션 자연각(무회전 45°): 반사 tan비 0.75~0.98', ratio > 0.75 && ratio < 0.98, `ratio=${ratio.toFixed(3)}`);
}

// 4) 잉글리시 쿠션 반응: 러닝 = 길어짐, 역 = 짧아짐 (반사 tan비 차이 뚜렷)
{
  const go = sx => {
    const res = simulate(shot3([
      { id: 0, x: 1400, y: 300, vx: 2500 * 0.707, vy: -2500 * 0.707, spinX: sx, spinY: 0 },
      { id: 1, x: 100, y: 1300, vx: 0, vy: 0 }, { id: 2, x: 2700, y: 1300, vx: 0, vy: 0 },
    ]));
    const cush = res.events.find(e => e.type === 'cushion');
    for (const f of res.frames) { if (f.t > cush.t + 0.02) { const b = f.balls.find(x => x.id === 0); return Math.abs(b.vx / b.vy); } }
  };
  const run = go(0.7), rev = go(-0.7), neu = go(0);
  check('러닝 잉글리시: 반사각 길어짐 (+15% 이상)', run > neu * 1.15, `run=${run.toFixed(2)} neutral=${neu.toFixed(2)}`);
  check('역 잉글리시: 반사각 짧아짐 (-15% 이상)', rev < neu * 0.85, `rev=${rev.toFixed(2)} neutral=${neu.toFixed(2)}`);
}

// 5) 쿠션 속도 손실: 45° 입사에서 20~40% (살아있는 3구 쿠션)
{
  const res = simulate(shot3([
    { id: 0, x: 1400, y: 300, vx: 2500 * 0.707, vy: -2500 * 0.707, spinX: 0, spinY: 0 },
    { id: 1, x: 100, y: 1300, vx: 0, vy: 0 }, { id: 2, x: 2700, y: 1300, vx: 0, vy: 0 },
  ]));
  const cush = res.events.find(e => e.type === 'cushion');
  let vin = null, vout = null;
  for (const f of res.frames) {
    const b = f.balls.find(x => x.id === 0);
    if (f.t < cush.t) vin = Math.hypot(b.vx, b.vy);
    if (f.t > cush.t + 0.02 && !vout) vout = Math.hypot(b.vx, b.vy);
  }
  const loss = 1 - vout / vin;
  check('쿠션 속도손실 20~40%', loss > 0.20 && loss < 0.40, `loss=${(loss * 100).toFixed(0)}%`);
}

// 6) 속도의존 복원: 빠른 수직 입사가 느린 것보다 복원비 낮음
//    (쿠션 도달 직전 속도 대비 — 주행 감속 오염 제거)
{
  const go = v => {
    const res = simulate(shot3([
      { id: 0, x: 1400, y: 500, vx: 0, vy: -v, spinX: 0, spinY: 0 },
      { id: 1, x: 100, y: 1300, vx: 0, vy: 0 }, { id: 2, x: 2700, y: 1300, vx: 0, vy: 0 },
    ]));
    const cush = res.events.find(e => e.type === 'cushion');
    let vin = null;
    for (const f of res.frames) {
      const b = f.balls.find(x => x.id === 0);
      if (f.t < cush.t) vin = Math.abs(b.vy);
      else if (f.t > cush.t + 0.02) return Math.abs(b.vy) / vin;
    }
  };
  const slow = go(1200), fast = go(6000);
  check('속도의존 쿠션: 빠른 샷 복원비 < 느린 샷', fast < slow - 0.03, `slow=${slow.toFixed(2)} fast=${fast.toFixed(2)}`);
}

// 7) 다회 쿠션 생존: 강샷이 4쿠션 이상 돌 수 있어야(3구 성립 조건)
{
  const res = simulate(shot3([
    { id: 0, x: 1420, y: 710, vx: 6500 * 0.94, vy: 6500 * 0.34, spinX: 0, spinY: 0 },
    { id: 1, x: 200, y: 200, vx: 0, vy: 0 }, { id: 2, x: 200, y: 1200, vx: 0, vy: 0 },
  ]));
  check('강샷 4쿠션 이상 주행', res.cushionCount >= 4, `cushions=${res.cushionCount}`);
}

// 8) 느린 컷샷 throw: 상대표면속도 느릴수록 밀림각 큼
{
  const go = v => {
    const res = simulate(shot3([
      { id: 0, x: 800, y: CY - 31, vx: v, vy: 0, spinX: 0, spinY: 0 },   // 반두께(30° 컷)
      { id: 1, x: 1400, y: CY, vx: 0, vy: 0 }, { id: 2, x: 100, y: 100, vx: 0, vy: 0 },
    ]));
    // 충돌 직후(쿠션 오염 전) 적구 진행각 측정
    const hit = res.events.find(e => e.type === 'ball-ball');
    for (const f of res.frames) {
      if (f.t > hit.t + 0.05) { const b1 = f.balls.find(b => b.id === 1); return Math.atan2(b1.vy, b1.vx) * 180 / Math.PI; }
    }
  };
  const slowA = go(900), fastA = go(5500);
  // throw = 기하각(~30°)에서 수구 진행방향(0°)으로 끌리는 편차 → 밀림 클수록 각이 작아짐
  check('throw 속도의존: 느린 샷 밀림각 > 빠른 샷', slowA < fastA - 0.5, `slow=${(30.3 - slowA).toFixed(1)}° fast=${(30.3 - fastA).toFixed(1)}° 밀림`);
}

// 9) 정지 거동: 마지막 0.5초 감속이 평균보다 큼(냅 램프 = 자연스런 소멸)
{
  const res = simulate(shot3([
    { id: 0, x: 400, y: CY, vx: 900, vy: 0, spinX: 0, spinY: 0 },   // 쿠션 도달 전 정지(순수 구름 관찰)
    { id: 1, x: 2700, y: 100, vx: 0, vy: 0 }, { id: 2, x: 2700, y: 1300, vx: 0, vy: 0 },
  ]));
  const fr = res.frames.filter(f => { const b = f.balls.find(x => x.id === 0); return Math.hypot(b.vx, b.vy) > 1; });
  const sp = f => { const b = f.balls.find(x => x.id === 0); return Math.hypot(b.vx, b.vy); };
  // 순수 구름 중간구간(400~800mm/s) 감속 vs 말미(<130mm/s) 감속 — 냅 램프면 말미가 1.5배 이상
  const win = (lo, hi) => {
    const seg = fr.filter(f => { const v = sp(f); return v >= lo && v <= hi; });
    if (seg.length < 2) return null;
    return (sp(seg[0]) - sp(seg[seg.length - 1])) / (seg[seg.length - 1].t - seg[0].t);
  };
  const dMid = win(300, 550), dLate = win(20, 130);   // 300~550=순수 구름(슬라이드 오염 제거)
  check('정지 냅 램프: 말미 감속 > 중간구름 감속 ×1.5', dMid != null && dLate != null && dLate > dMid * 1.5, `late=${dLate && dLate.toFixed(0)} mid=${dMid && dMid.toFixed(0)} mm/s²`);
}

// 10) 잉글리시 스핀 소모: 쿠션 3방이면 wz 대부분 소진(무한 접시 방지)
{
  const res = simulate(shot3([
    { id: 0, x: 1420, y: 710, vx: 5000 * 0.9, vy: 5000 * 0.42, spinX: 0.8, spinY: 0 },
    { id: 1, x: 200, y: 200, vx: 0, vy: 0 }, { id: 2, x: 2600, y: 1300, vx: 0, vy: 0 },
  ]));
  let wz0 = null, wzAfter3 = null, nc = 0;
  for (const e of res.events) if (e.type === 'cushion' && e.ball1 === 0) { nc++; if (nc === 3) { const f = res.frames.find(f => f.t > e.t + 0.05); if (f) wzAfter3 = Math.abs(f.balls.find(b => b.id === 0).wz); } }
  wz0 = Math.abs(res.frames[1].balls.find(b => b.id === 0).wz);
  if (wzAfter3 == null) check('스핀 소모(3쿠션 후)', false, '3쿠션 미도달');
  else check('스핀 소모: 3쿠션 후 잔존 < 55%', wzAfter3 < wz0 * 0.55, `${(wzAfter3 / wz0 * 100).toFixed(0)}% 잔존`);
}

console.log(`\n결과: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);

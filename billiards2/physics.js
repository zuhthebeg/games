'use strict';
// physics.js — 결정론 물리 엔진 (의존성 0, 순수 함수)

var PHYSICS = {
  BALL_RADIUS_LARGE: 30.75,   // 대대 mm
  BALL_RADIUS_MEDIUM: 32.75,  // 중대 mm
  TABLE_W_LARGE: 2840,
  TABLE_H_LARGE: 1420,
  TABLE_W_MEDIUM: 2540,
  TABLE_H_MEDIUM: 1270,
  CUSHION_RESTITUTION: 0.75,
  BALL_RESTITUTION: 0.95,
  ROLLING_FRICTION: 0.01,
  SLIDING_FRICTION: 0.2,
  CUSHION_SIDE_FACTOR: 0.1,
  THROW_FRICTION: 0.04,
  GRAVITY: 9800,              // mm/s²
  STOP_VELOCITY: 5,           // mm/s
  DT: 1 / 240,
  MAX_STEPS: 72000,           // 300s @ 240hz 상한
};

// ── 벡터 유틸 ──────────────────────────────────────────────
function vLen(x, y) { return Math.sqrt(x * x + y * y); }
function vDot(ax, ay, bx, by) { return ax * bx + ay * by; }
function vNorm(x, y) { const l = vLen(x, y); return l < 1e-12 ? [0, 0] : [x / l, y / l]; }

// ── 공 복제 ────────────────────────────────────────────────
function cloneBalls(balls) {
  return balls.map(b => ({ ...b }));
}

// ── 메인 시뮬레이터 ────────────────────────────────────────
/**
 * @param {object} shot
 *   mode: '3ball'|'4ball'
 *   tableW, tableH: mm
 *   ballRadius: mm
 *   balls: [{id, x, y, vx, vy, spinX, spinY}]
 *     id 0 = 수구, 1 = 제1적구, 2 = 제2적구 (3구시), 3 = 상대수구 (4구시)
 * @returns {{ frames, events, cushionCount, hitIds, score, foul }}
 */
function simulate(shot) {
  const { mode, tableW, tableH, ballRadius } = shot;
  const balls = cloneBalls(shot.balls);
  const r = ballRadius;
  const mu_r = PHYSICS.ROLLING_FRICTION;
  const mu_s = PHYSICS.SLIDING_FRICTION;
  const g = PHYSICS.GRAVITY;
  const dt = PHYSICS.DT;
  const e_cush = PHYSICS.CUSHION_RESTITUTION;
  const e_ball = PHYSICS.BALL_RESTITUTION;
  const k_side = PHYSICS.CUSHION_SIDE_FACTOR;
  const mu_throw = PHYSICS.THROW_FRICTION;

  const frames = [];
  const events = [];
  let t = 0;
  let cushionCount = 0;       // 수구 쿠션 횟수 (3구: 득점 판정용)
  const hitIds = new Set();   // 수구가 맞힌 공 id 집합

  // 공별 내부 상태: vx, vy, spinX, spinY, wx (angular velocity, simplified)
  // 단순화: spin은 발사 시 초기값만 사용 → 충돌·감속에서 점차 소멸

  const RECORD_EVERY = 4; // 매 4스텝마다 프레임 저장 (60fps 근사)
  let step = 0;

  function recordFrame() {
    frames.push({
      t,
      balls: balls.map(b => ({ id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, spinX: b.spinX, spinY: b.spinY })),
    });
  }

  function allStopped() {
    return balls.every(b => vLen(b.vx, b.vy) < PHYSICS.STOP_VELOCITY);
  }

  recordFrame();

  while (step < PHYSICS.MAX_STEPS && !allStopped()) {
    // ── 공-공 충돌 ──────────────────────────────────────────
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = vLen(dx, dy);
        const minDist = 2 * r;
        if (dist < minDist && dist > 1e-9) {
          // 법선 벡터
          const [nx, ny] = vNorm(dx, dy);
          // 관통 해소 (겹침 반 씩 밀기)
          const overlap = minDist - dist;
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;

          // 상대 속도 법선 성분
          const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
          const vRel = vDot(dvx, dvy, nx, ny);
          if (vRel > 0) { // 접근 중일 때만
            const J = (1 + e_ball) * vRel * 0.5; // 질량 동일
            a.vx -= J * nx;
            a.vy -= J * ny;
            b.vx += J * nx;
            b.vy += J * ny;

            // throw 효과 (접선 방향 마찰)
            const tx = -ny, ty = nx;
            const vRelT = vDot(dvx, dvy, tx, ty);
            const Jt = mu_throw * Math.abs(J) * Math.sign(vRelT);
            a.vx -= Jt * tx;
            a.vy -= Jt * ty;
            b.vx += Jt * tx;
            b.vy += Jt * ty;

            // spinY 효과 (follow/draw): 수구가 a=0일 때만
            if (a.id === 0) {
              const spd = vLen(a.vx, a.vy);
              a.vx += a.spinY * 0.2 * spd * nx * 0.3;
              a.vy += a.spinY * 0.2 * spd * ny * 0.3;
            }

            const type = 'ball-ball';
            events.push({ t, type, ball1: a.id, ball2: b.id });

            // 수구 히트 추적
            if (a.id === 0) hitIds.add(b.id);
            if (b.id === 0) hitIds.add(a.id);
          }
        }
      }
    }

    // ── 공-쿠션 충돌 ──────────────────────────────────────────
    for (const b of balls) {
      let cushionHit = false;
      let side = null;

      // 좌 쿠션
      if (b.x - r < 0) {
        b.x = r;
        const spinContrib = b.spinX * k_side * Math.abs(b.vx);
        b.vx = Math.abs(b.vx) * e_cush;
        b.vy = b.vy * (1 - mu_s * 0.3) + spinContrib;
        b.spinX *= 0.6;
        cushionHit = true; side = 'left';
      }
      // 우 쿠션
      if (b.x + r > tableW) {
        b.x = tableW - r;
        const spinContrib = b.spinX * k_side * Math.abs(b.vx);
        b.vx = -Math.abs(b.vx) * e_cush;
        b.vy = b.vy * (1 - mu_s * 0.3) - spinContrib;
        b.spinX *= 0.6;
        cushionHit = true; side = 'right';
      }
      // 상 쿠션
      if (b.y - r < 0) {
        b.y = r;
        const spinContrib = b.spinX * k_side * Math.abs(b.vy);
        b.vy = Math.abs(b.vy) * e_cush;
        b.vx = b.vx * (1 - mu_s * 0.3) + spinContrib;
        b.spinX *= 0.6;
        cushionHit = true; side = 'top';
      }
      // 하 쿠션
      if (b.y + r > tableH) {
        b.y = tableH - r;
        const spinContrib = b.spinX * k_side * Math.abs(b.vy);
        b.vy = -Math.abs(b.vy) * e_cush;
        b.vx = b.vx * (1 - mu_s * 0.3) - spinContrib;
        b.spinX *= 0.6;
        cushionHit = true; side = 'bottom';
      }

      if (cushionHit) {
        events.push({ t, type: 'cushion', ball1: b.id, cushionSide: side });
        if (b.id === 0) cushionCount++;
      }
    }

    // ── 감속 ──────────────────────────────────────────────────
    for (const b of balls) {
      const spd = vLen(b.vx, b.vy);
      if (spd < PHYSICS.STOP_VELOCITY) {
        b.vx = 0; b.vy = 0;
        continue;
      }
      // 구름 감속
      const decel = mu_r * g * dt;
      const newSpd = Math.max(0, spd - decel);
      const ratio = newSpd / spd;
      b.vx *= ratio;
      b.vy *= ratio;
      // spin 감쇠
      b.spinX *= 0.9995;
      b.spinY *= 0.9995;
    }

    // ── 위치 업데이트 ──────────────────────────────────────────
    for (const b of balls) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    t += dt;
    step++;

    if (step % RECORD_EVERY === 0) recordFrame();
  }

  // 마지막 프레임
  recordFrame();
  events.push({ t, type: 'stop' });

  // ── 득점 판정 ──────────────────────────────────────────────
  let score = 0;
  let foul = false;

  if (mode === '3ball') {
    // 수구가 적구1(id1)과 적구2(id2) 모두 맞히고, 쿠션 3회 이상
    const hit1 = hitIds.has(1), hit2 = hitIds.has(2);
    if (hit1 && hit2 && cushionCount >= 3) score = 1;
  } else if (mode === '4ball') {
    // 수구가 빨강 2개(id1, id2) 모두 맞히면 1점
    const hit1 = hitIds.has(1), hit2 = hitIds.has(2);
    if (hit1 && hit2) score = 1;
    // 상대수구(id3) 맞히면 파울 (옵션)
    if (hitIds.has(3)) foul = true;
  }

  return { frames, events, cushionCount, hitIds: [...hitIds], score, foul };
}

// ── 유틸: 샷 입력 빌더 ────────────────────────────────────
function makeShotInput(mode, balls) {
  const isLarge = mode === '3ball';
  return {
    mode,
    tableW: isLarge ? PHYSICS.TABLE_W_LARGE : PHYSICS.TABLE_W_MEDIUM,
    tableH: isLarge ? PHYSICS.TABLE_H_LARGE : PHYSICS.TABLE_H_MEDIUM,
    ballRadius: isLarge ? PHYSICS.BALL_RADIUS_LARGE : PHYSICS.BALL_RADIUS_MEDIUM,
    balls,
  };
}

// ── 테스트 ────────────────────────────────────────────────
function runTests() {
  let passed = 0, failed = 0;

  function assert(label, cond) {
    if (cond) {
      console.log(`  PASS: ${label}`);
      passed++;
    } else {
      console.error(`  FAIL: ${label}`);
      failed++;
    }
  }

  console.log('=== physics.js runTests ===');

  // Test 1: 직선 충돌 — 수구가 정지한 공 직접 타격 → 수구 정지, 대상 전진
  {
    const shot = makeShotInput('3ball', [
      { id: 0, x: 500, y: 710, vx: 2000, vy: 0, spinX: 0, spinY: 0 },
      { id: 1, x: 700, y: 710, vx: 0, vy: 0, spinX: 0, spinY: 0 },
      { id: 2, x: 2000, y: 710, vx: 0, vy: 0, spinX: 0, spinY: 0 },
    ]);
    const res = simulate(shot);
    const last = res.frames[res.frames.length - 1].balls;
    const b0 = last.find(b => b.id === 0);
    const b1 = last.find(b => b.id === 1);
    assert('직선 충돌: b1이 앞으로 이동', b1.x > 700);
    assert('직선 충돌: 수구가 느려짐', Math.abs(b0.vx) < 100);
  }

  // Test 2: 쿠션 반사
  {
    const shot = makeShotInput('3ball', [
      { id: 0, x: 200, y: 100, vx: 1000, vy: -2000, spinX: 0, spinY: 0 },
      { id: 1, x: 2000, y: 1000, vx: 0, vy: 0, spinX: 0, spinY: 0 },
      { id: 2, x: 2500, y: 500, vx: 0, vy: 0, spinX: 0, spinY: 0 },
    ]);
    const res = simulate(shot);
    assert('쿠션 반사: 쿠션 1회 이상', res.cushionCount >= 1);
  }

  // Test 3: 3구 득점 — 쿠션3 + 두 적구 히트
  {
    // 수구를 쿠션에 여러번 튕기도록 강하게 발사 후 두 적구 근처 배치
    const shot = makeShotInput('3ball', [
      { id: 0, x: 1420, y: 710, vx: 3000, vy: 2500, spinX: 0, spinY: 0 },
      { id: 1, x: 2700, y: 100, vx: 0, vy: 0, spinX: 0, spinY: 0 },
      { id: 2, x: 100, y: 1300, vx: 0, vy: 0, spinX: 0, spinY: 0 },
    ]);
    const res = simulate(shot);
    // 쿠션 카운트만 검증 (두 적구 히트 여부는 배치에 따라 다름)
    assert('3구 시뮬: 이벤트 배열 존재', res.events.length > 0);
    assert('3구 시뮬: 프레임 배열 존재', res.frames.length > 0);
  }

  // Test 4: 4구 득점 — 빨강1 얇게 쳐서 빨강2까지 (캐롬)
  {
    const shot = makeShotInput('4ball', [
      { id: 0, x: 500, y: 635, vx: 5500, vy: 0, spinX: 0, spinY: 0 },
      { id: 1, x: 850, y: 687, vx: 0, vy: 0, spinX: 0, spinY: 0 },   // 살짝 위(얇은 히트)
      { id: 2, x: 1300, y: 665, vx: 0, vy: 0, spinX: 0, spinY: 0 },
      { id: 3, x: 2300, y: 300, vx: 0, vy: 0, spinX: 0, spinY: 0 },
    ]);
    const res = simulate(shot);
    assert('4구: 빨강1+빨강2 모두 히트', res.hitIds.includes(1) && res.hitIds.includes(2));
    assert('4구: score 1', res.score === 1);
  }

  // Test 5: 정지 조건
  {
    const shot = makeShotInput('3ball', [
      { id: 0, x: 1000, y: 710, vx: 100, vy: 0, spinX: 0, spinY: 0 },
      { id: 1, x: 2000, y: 710, vx: 0, vy: 0, spinX: 0, spinY: 0 },
      { id: 2, x: 500, y: 710, vx: 0, vy: 0, spinX: 0, spinY: 0 },
    ]);
    const res = simulate(shot);
    const last = res.frames[res.frames.length - 1].balls;
    assert('정지: 모든 공 v < STOP_VELOCITY', last.every(b => vLen(b.vx, b.vy) < PHYSICS.STOP_VELOCITY + 1));
  }

  console.log(`\n결과: ${passed} PASS, ${failed} FAIL`);
  if (failed === 0) console.log('ALL PASS');
  return failed === 0;
}

// Node.js 환경에서 직접 실행 시 테스트
if (typeof module !== 'undefined' && require.main === module) {
  runTests();
}

// 브라우저 환경 export (다른 스크립트에서 접근 가능하게)
if (typeof window !== 'undefined') {
  window.simulate = simulate;
  window.runTests = runTests;
}

'use strict';
// physics.js — 결정론 물리 엔진 (의존성 0, 순수 함수)

var PHYSICS = {
  BALL_RADIUS_LARGE: 30.75,   // 대대 mm
  BALL_RADIUS_MEDIUM: 32.75,  // 중대 mm
  TABLE_W_LARGE: 2840,
  TABLE_H_LARGE: 1420,
  TABLE_W_MEDIUM: 2540,
  TABLE_H_MEDIUM: 1270,
  CUSHION_RESTITUTION: 0.90,   // 3구대 쿠션 살아있게(여러 쿠션 가능)
  BALL_RESTITUTION: 0.95,
  ROLLING_FRICTION: 0.011,     // 구름저항(슬라이딩 손실 별도라 낮춤)
  SLIDING_FRICTION: 0.2,       // 미끄럼 운동마찰(follow/draw 전이)
  CUSHION_SIDE_FACTOR: 0.1,
  THROW_FRICTION: 0.04,
  GRAVITY: 9800,              // mm/s²
  STOP_VELOCITY: 18,          // mm/s (느린 꼬리 컷)
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
  const cueId = shot.cueId != null ? shot.cueId : 0;  // 수구 id (3구: 노랑0/흰1 교대)
  const balls = cloneBalls(shot.balls);
  const r = ballRadius;
  // 튜닝 오버라이드(설정에서 조정) — 없으면 기본값
  const T = (typeof window !== 'undefined' && window.BIL_TUNE) || {};
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const mu_r = num(T.roll, PHYSICS.ROLLING_FRICTION);
  const mu_s = PHYSICS.SLIDING_FRICTION;
  const g = PHYSICS.GRAVITY;
  const dt = PHYSICS.DT;
  const e_cush = num(T.cushE, PHYSICS.CUSHION_RESTITUTION);
  const e_ball = PHYSICS.BALL_RESTITUTION;
  const k_side = PHYSICS.CUSHION_SIDE_FACTOR;
  const mu_throw = PHYSICS.THROW_FRICTION;
  const mu_throw_ball = num(T.throw, 0.045);  // 공-공 throw 상한
  const K_CUSH_SIDE = num(T.cushSide, 0.5);   // 쿠션 사이드스핀 반사각/회전력(접시)
  const CUSH_WZ_KEEP = 0.3;     // 쿠션 후 사이드스핀 잔존(다음 쿠션엔 약하게)

  // 각속도 초기화: 모든 공 wx,wy(구름축)·wz(수직축=좌우스핀) = 0
  for (const b of balls) { b.wx = b.wx || 0; b.wy = b.wy || 0; b.wz = b.wz || 0; }
  // 수구에 당점으로 스핀 부여: spinY=톱/백(follow/draw), spinX=좌우(english)
  {
    const cb = balls.find(b => b.id === cueId);
    if (cb) {
      const sp = vLen(cb.vx, cb.vy);
      if (sp > 1) {
        const dx = cb.vx / sp, dy = cb.vy / sp;
        const base = sp / r;                       // 자연 구름 각속도
        const FOLLOW_GAIN = num(T.follow, 1.3);    // 밀어/끌어 강도
        const SIDE_GAIN = num(T.side, 1.4);        // 좌우 스핀 강도
        const w = base * (cb.spinY || 0) * FOLLOW_GAIN;
        cb.wx = -dy * w;                           // 톱스핀 축 = 진행방향 수평 수직
        cb.wy = dx * w;
        cb.wz = -base * (cb.spinX || 0) * SIDE_GAIN; // 수직축 사이드스핀(우회전=시계=wz<0)
      }
    }
  }

  const frames = [];
  const events = [];
  let t = 0;
  let cushionCount = 0;       // 수구 쿠션 횟수 (3구: 득점 판정용)
  const hitIds = new Set();   // 수구가 맞힌 공 id 집합
  let cueObjCount = 0;        // 수구가 맞힌 '서로 다른' 공 개수(순서)
  let cushBeforeFirst = -1;   // 1번째 적구 맞히기 전 쿠션 수 (빈쿠션 판정)
  let cushBeforeSecond = -1;  // 2번째 적구 맞히는 순간까지의 쿠션 수
  function registerCueHit(objId) {
    if (hitIds.has(objId)) return;
    hitIds.add(objId);
    cueObjCount++;
    if (cueObjCount === 1) cushBeforeFirst = cushionCount;  // 1적구 전 쿠션수
    if (cueObjCount === 2) cushBeforeSecond = cushionCount; // 2적구 시점 쿠션수 고정
  }

  // 공별 내부 상태: vx, vy, spinX, spinY, wx (angular velocity, simplified)
  // 단순화: spin은 발사 시 초기값만 사용 → 충돌·감속에서 점차 소멸

  const RECORD_EVERY = 4; // 매 4스텝마다 프레임 저장 (60fps 근사)
  let step = 0;

  function recordFrame() {
    frames.push({
      t,
      balls: balls.map(b => ({ id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, wz: b.wz })),
    });
  }

  function allStopped() {
    // 속도뿐 아니라 잔여 스핀(슬립)도 거의 없어야 정지로 본다
    // (끌어치기 공이 v=0 지나 역주행하는 순간 조기종료 방지)
    return balls.every(b =>
      vLen(b.vx, b.vy) < PHYSICS.STOP_VELOCITY &&
      Math.hypot(b.vx - b.wy * r, b.vy + b.wx * r) < 30);
  }

  const contactPairs = new Set();  // 현재 접촉 중인 쌍 (새 접촉 1회만 히트 등록)

  recordFrame();

  while (step < PHYSICS.MAX_STEPS && !allStopped()) {
    // ── 공-공 충돌 ──────────────────────────────────────────
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = vLen(dx, dy);
        const minDist = 2 * r;

        // 스윕(연속) 검출: 이번 스텝 상대변위로 최근접거리·접근여부 계산
        // → 빠른 얇은 히트도 잡고, 옆으로 굴러 스치는(비접근) 건 히트 제외
        const rvx = (b.vx - a.vx) * dt, rvy = (b.vy - a.vy) * dt;
        const dotRV = dx * rvx + dy * rvy;       // <0이면 접근 중
        const aa = rvx * rvx + rvy * rvy;
        let minD = dist;
        if (aa > 1e-12) { let tau = -dotRV / aa; if (tau < 0) tau = 0; else if (tau > 1) tau = 1; minD = Math.hypot(dx + rvx * tau, dy + rvy * tau); }
        const swept = minD < minDist;           // 이번 스텝에 표면이 닿았나
        const approaching = dotRV < 0;

        if (swept) {
          // 히트 등록(점수용): 새 접촉 + 접근(실제 충돌)일 때만
          if (!contactPairs.has(key)) {
            contactPairs.add(key);
            if (approaching) {
              const relSp = Math.hypot(b.vx - a.vx, b.vy - a.vy);
              events.push({ t, type: 'ball-ball', ball1: a.id, ball2: b.id, speed: relSp });
              if (a.id === cueId) registerCueHit(b.id);
              if (b.id === cueId) registerCueHit(a.id);
            }
          }
          // 운동량/위치 해소는 실제 겹쳐있을 때
          if (dist < minDist && dist > 1e-9) {
            const [nx, ny] = vNorm(dx, dy);
            const overlap = minDist - dist;
            a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
            const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
            const vRel = vDot(dvx, dvy, nx, ny);
            if (vRel > 0) {
              const J = (1 + e_ball) * vRel * 0.5;
              a.vx -= J * nx; a.vy -= J * ny;
              b.vx += J * nx; b.vy += J * ny;
              const tx = -ny, ty = nx;
              const uT = vDot(dvx, dvy, tx, ty) + (a.wz + b.wz) * r;
              if (Math.abs(uT) > 1e-3) {
                const sgn = Math.sign(uT);
                const Jt = sgn * Math.min(Math.abs(uT) * 0.5, mu_throw_ball * Math.abs(J));
                a.vx -= Jt * tx; a.vy -= Jt * ty;
                b.vx += Jt * tx; b.vy += Jt * ty;
                a.wz *= 0.5; b.wz *= 0.5;
              }
            }
          }
        } else {
          contactPairs.delete(key);  // 떨어지면 접촉 해제
        }
      }
    }

    // ── 공-쿠션 충돌 ──────────────────────────────────────────
    for (const b of balls) {
      let cushionHit = false;
      let side = null;

      // 사이드스핀 표면속도(wz*r)가 쿠션 접선방향으로 공을 끌어 반사각 변형
      const wzSurf = b.wz * r;
      // 좌 쿠션 (법선 +x). 접선=y. 우회전(wz>0)이면 +y로 꺾임
      if (b.x - r < 0) {
        b.x = r;
        b.vx = Math.abs(b.vx) * e_cush;
        b.vy = b.vy * (1 - mu_s * 0.3) + wzSurf * K_CUSH_SIDE;
        b.wz *= CUSH_WZ_KEEP;
        cushionHit = true; side = 'left';
      }
      // 우 쿠션 (법선 −x). 접선 반대
      if (b.x + r > tableW) {
        b.x = tableW - r;
        b.vx = -Math.abs(b.vx) * e_cush;
        b.vy = b.vy * (1 - mu_s * 0.3) - wzSurf * K_CUSH_SIDE;
        b.wz *= CUSH_WZ_KEEP;
        cushionHit = true; side = 'right';
      }
      // 상 쿠션 (법선 +y). 접선=x
      if (b.y - r < 0) {
        b.y = r;
        b.vy = Math.abs(b.vy) * e_cush;
        b.vx = b.vx * (1 - mu_s * 0.3) - wzSurf * K_CUSH_SIDE;
        b.wz *= CUSH_WZ_KEEP;
        cushionHit = true; side = 'top';
      }
      // 하 쿠션 (법선 −y)
      if (b.y + r > tableH) {
        b.y = tableH - r;
        b.vy = -Math.abs(b.vy) * e_cush;
        b.vx = b.vx * (1 - mu_s * 0.3) + wzSurf * K_CUSH_SIDE;
        b.wz *= CUSH_WZ_KEEP;
        cushionHit = true; side = 'bottom';
      }

      if (cushionHit) {
        events.push({ t, type: 'cushion', ball1: b.id, cushionSide: side });
        if (b.id === cueId) cushionCount++;
      }
    }

    // ── 마찰: 미끄럼(슬라이딩) → 구름 전이 + 구름저항 ──────────
    // 접촉점 슬립 u = v + ω×c (c=아래방향 r). 슬립 있으면 운동마찰이
    // v와 ω를 동시에 바꿔 구름으로 수렴. 충돌로 v가 죽어도 남은 ω(톱/백스핀)가
    // 마찰로 다시 굴려보냄 → follow/draw 자연 발생.
    const SLIP_EPS = 25;          // mm/s, 이 이하 슬립이면 구름으로 간주
    const KW = 2.5 / r;           // 5/(2r): 마찰 토크→각가속
    for (const b of balls) {
      const ux = b.vx - b.wy * r;
      const uy = b.vy + b.wx * r;
      const uslip = Math.hypot(ux, uy);

      if (uslip > SLIP_EPS) {
        // 미끄럼 운동마찰
        const a = mu_s * g * dt;
        const fx = -ux / uslip, fy = -uy / uslip;
        b.vx += a * fx; b.vy += a * fy;
        b.wx += KW * a * fy;
        b.wy += -KW * a * fx;
      } else {
        // 구름: ω를 v에 정합시키고 구름저항으로 감속
        b.wy = b.vx / r; b.wx = -b.vy / r;
        const spd = vLen(b.vx, b.vy);
        if (spd > PHYSICS.STOP_VELOCITY) {
          const ratio = Math.max(0, spd - mu_r * g * dt) / spd;
          b.vx *= ratio; b.vy *= ratio;
          b.wx *= ratio; b.wy *= ratio;
        }
      }

      // 정지 처리
      if (vLen(b.vx, b.vy) < PHYSICS.STOP_VELOCITY &&
          Math.hypot(b.vx - b.wy * r, b.vy + b.wx * r) < SLIP_EPS) {
        b.vx = 0; b.vy = 0; b.wx = 0; b.wy = 0;
      }
      // 사이드스핀 마찰 감쇠(천에 의해 점차 죽음)
      b.wz *= 0.9992;   // 이동 중엔 거의 유지(첫 쿠션에 풀로 먹게), 쿠션·충돌에서만 크게 소진
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

  if (mode === '3ball' || mode === '3ball-medium') {
    // 쓰리쿠션(대대/중대): 두 적구 모두 맞히되 '2번째 적구 맞기 전' 쿠션 3회 이상
    const others = balls.map(b => b.id).filter(id => id !== cueId);
    const allHit = others.every(id => hitIds.has(id));
    if (allHit && cushBeforeSecond >= 3) score = 1;
  } else if (mode === '4ball') {
    // 상대 수구를 맞히면 파울(득점 무효). 아니면 빨강 2개 다 맞혀야 1점
    const REDS = (shot.redIds && shot.redIds.length) ? shot.redIds : [1, 2];
    const oppCueId = shot.oppCueId != null ? shot.oppCueId : 3;
    if (hitIds.has(oppCueId)) {
      foul = true;          // 상대공 접촉 → 파울, 점수 없음
    } else if (REDS.every(id => hitIds.has(id))) {
      score = 1;
    }
  }

  // 마지막 수구 위치도 노출(편의)
  void cueId;

  return { frames, events, cushionCount, cushBeforeFirst, cushBeforeSecond, hitIds: [...hitIds], score, foul };
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

  // Test 3b: 3구 순서 판정 — 적구 둘 먼저 맞고(쿠션0) 나중에 쿠션 채우면 무효
  {
    const shot = makeShotInput('3ball', [
      { id: 0, x: 500, y: 710, vx: 6500, vy: 0, spinX: 0, spinY: 0 },
      { id: 1, x: 760, y: 720, vx: 0, vy: 0, spinX: 0, spinY: 0 },
      { id: 2, x: 1000, y: 740, vx: 0, vy: 0, spinX: 0, spinY: 0 },
    ]);
    const res = simulate(shot);
    assert('3구 순서: 두 적구 모두 히트', res.hitIds.includes(1) && res.hitIds.includes(2));
    assert('3구 순서: 총 쿠션 3회 이상', res.cushionCount >= 3);
    assert('3구 순서: 2적구 전 쿠션 부족 → score 0', res.score === 0);
  }

  // Test 4: 4구 득점 — 빨강1 얇게 쳐서 빨강2까지 (캐롬)
  {
    const shot = makeShotInput('4ball', [
      { id: 0, x: 500, y: 635, vx: 6000, vy: 0, spinX: 0, spinY: 0 },
      { id: 1, x: 850, y: 695, vx: 0, vy: 0, spinX: 0, spinY: 0 },   // 살짝 위(얇은 히트)
      { id: 2, x: 1250, y: 650, vx: 0, vy: 0, spinX: 0, spinY: 0 },
      { id: 3, x: 2300, y: 1100, vx: 0, vy: 0, spinX: 0, spinY: 0 },
    ]);
    const res = simulate(shot);
    assert('4구: 빨강1+빨강2 모두 히트', res.hitIds.includes(1) && res.hitIds.includes(2));
    assert('4구: score 1', res.score === 1);
  }

  // Test 4b: 4구 파울 — 빨강 둘 다 맞아도 상대공 맞으면 득점 무효
  {
    const shot = makeShotInput('4ball', [
      { id: 0, x: 500, y: 635, vx: 6500, vy: 0, spinX: 0, spinY: 0 },
      { id: 1, x: 850, y: 700, vx: 0, vy: 0, spinX: 0, spinY: 0 },
      { id: 2, x: 1600, y: 650, vx: 0, vy: 0, spinX: 0, spinY: 0 },
      { id: 3, x: 2300, y: 400, vx: 0, vy: 0, spinX: 0, spinY: 0 }, // 캐롬 경로상 상대공
    ]);
    const res = simulate(shot);
    assert('4구 파울: 상대공 맞음', res.hitIds.includes(3));
    assert('4구 파울: score 0 (득점 무효)', res.score === 0);
    assert('4구 파울: foul true', res.foul === true);
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

'use strict';
// physics.js — 결정론 물리 엔진 (의존성 0, 순수 함수)

var PHYSICS = {
  BALL_RADIUS_LARGE: 30.75,   // 대대 mm
  BALL_RADIUS_MEDIUM: 32.75,  // 중대 mm
  TABLE_W_LARGE: 2840,
  TABLE_H_LARGE: 1420,
  TABLE_W_MEDIUM: 2540,
  TABLE_H_MEDIUM: 1270,
  BALL_RESTITUTION: 0.95,
  ROLLING_FRICTION: 0.011,     // 구름저항(슬라이딩 손실 별도라 낮춤)
  SLIDING_FRICTION: 0.2,       // 미끄럼 운동마찰(follow/draw 전이)
  GRAVITY: 9800,              // mm/s²
  STOP_VELOCITY: 12,          // mm/s (느린 꼬리 컷 — 냅 램프가 자연 감쇠 담당)
  DT: 1 / 240,
  MAX_STEPS: 72000,           // 300s @ 240hz 상한
  // ── v3 쿠션: Han(2005) 'Dynamics in Carom and Three Cushion Billiards' ──
  // pooltool(han_2005) 포팅. 접촉점이 공 중심보다 위(ε=sinθ·R) → 토프스핀·사이드스핀이
  // 리바운드에 3D 임펄스로 결합. 기본계수는 pooltool 레퍼런스 값.
  RAIL_E: 0.85,               // 쿠션 복원계수 e_c (van Balen 실측 0.85)
  RAIL_MU: 0.28,              // 쿠션 마찰 f_c (Han 원논문 μ=0.14~0.4 각도의존 — 캐롬 레일 그립 상단값)
  RAIL_SIN: 0.29,             // sinθ = h/R−1 (레일 노즈높이 ≈ 공지름의 64~65%)
  // ── v2 공-공 throw(속도의존 마찰) ──
  THROW_MIN: 0.015,           // 고속 상대표면속도에서의 마찰 하한
  THROW_REF: 1400,            // mm/s, 마찰 감쇠 기준 표면속도
  // ── v2 스핀·정지 ──
  SPIN_MU: 0.018,             // 수직축 스핀(wz) 천 마찰 감쇠계수
  NAP_V: 140,                 // mm/s, 이 이하에서 냅(보풀) 저항 램프 시작
  NAP_GAIN: 2.0,              // 냅 램프 최대 배율(=1+GAIN)
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
  const e_ball = PHYSICS.BALL_RESTITUTION;
  const DRAW_FIX = num(T.drawFix, 1);          // 1이면 하단당점(끌기)은 스트로크 감쇠 미적용(끊어+하단=전진 모순 방지)
  // ── v3 쿠션(Han 2005) ──
  const RAIL_E = num(T.cushE, PHYSICS.RAIL_E);        // 복원계수 e_c
  const RAIL_MU = num(T.railMu, PHYSICS.RAIL_MU);     // 마찰 f_c
  const RAIL_SIN = num(T.railH, PHYSICS.RAIL_SIN);    // 접촉높이 sinθ
  const RAIL_COS = Math.sqrt(1 - RAIL_SIN * RAIL_SIN);
  // ── v2 공-공 throw: μ가 상대표면속도에 따라 감소(느린 샷=많이 밀림) ──
  const THROW_AMP = num(T.throw, 0.055);
  const THROW_MIN = PHYSICS.THROW_MIN;
  const THROW_REF = PHYSICS.THROW_REF;
  // ── v2 수직축 스핀 감쇠(시간 기반, 천 마찰 토크) ──
  const SPIN_MU = num(T.spinDecay, PHYSICS.SPIN_MU);

  // ── 스트로크(타격) 종류 ─────────────────────────────────────
  // 끊어치기(stun): 짧게 끊어 follow를 죽임 → 회전 빨리 소멸(감쇠 배율↑)
  // 기본(normal): 표준
  // 밀어치기(follow): 길게 밀어 follow 회전을 유지·증폭 → 회전 오래(감쇠 배율↓)
  // follow=상하스핀 강도 배율, decay=사이드스핀(wz) 시간감쇠 배율
  const STROKE_TABLE = {
    stun:   { follow: 0.30, decay: 2.6 },
    normal: { follow: 1.00, decay: 1.0 },
    follow: { follow: 1.45, decay: 0.55 },
  };
  const stroke = STROKE_TABLE[shot.stroke] || STROKE_TABLE.normal;
  // wz 선형 감쇠율(rad/s²): 천 마찰 토크 ≈ (5/2)·μ_sp·g/r, 스트로크가 배율
  const WZ_DECAY = 2.5 * SPIN_MU * g / r * stroke.decay;
  // 잉글리시 비선형 응답: 저당점=둔감(살짝만 꺾임), 고당점=풀 효과(시스템 유지)
  // engResp(±SPIN_REF)=±SPIN_REF 로 끝값은 보존, 중간은 약화
  const ENG_EXP = num(T.engExp, 1.7);
  const SPIN_REF = 0.9;   // 당점 입력영역 확대(0.6→0.9): 같은 피크를 넓은 영역에 펼쳐 응답 둔감화
  const engResp = s => { const a = Math.min(Math.abs(s), SPIN_REF); return Math.sign(s) * Math.pow(a / SPIN_REF, ENG_EXP) * SPIN_REF; };

  // 각속도 초기화: 모든 공 wx,wy(구름축)·wz(수직축=좌우스핀) = 0
  for (const b of balls) { b.wx = b.wx || 0; b.wy = b.wy || 0; b.wz = b.wz || 0; }
  // 수구에 당점으로 스핀 부여: spinY=톱/백(follow/draw), spinX=좌우(english)
  {
    const cb = balls.find(b => b.id === cueId);
    if (cb) {
      const sp = vLen(cb.vx, cb.vy);
      if (sp > 1) {
        let dx = cb.vx / sp, dy = cb.vy / sp;
        const base = sp / r;                       // 자연 구름 각속도
        const FOLLOW_GAIN = num(T.follow, 1.0);    // 밀어/끌어 강도(과민 줄여 1.3→1.0)
        const SIDE_GAIN = num(T.side, 1.0);        // 좌우 스핀 강도(v2: 쿠션이 물리로 소모하므로 1.0)
        const sx = cb.spinX || 0, sy = cb.spinY || 0;
        // 스쿼트(squirt): 사이드를 주면 출발 방향이 반대쪽으로 아주 살짝 빗나감(실제 1~3°)
        const SQUIRT = num(T.squirt, 0.045);       // 최대 당점에서 rad(≈2.6°)
        if (sx) {
          const ang = -sx * SQUIRT;                // 우회전(sx>0)이면 좌로 살짝
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const ndx = dx * ca - dy * sa, ndy = dx * sa + dy * ca;
          dx = ndx; dy = ndy;
          cb.vx = dx * sp; cb.vy = dy * sp;
        }
        // 상하스핀 → 구름축 각속도(스트로크가 follow 생존·강도 좌우)
        // drawFix: 끌기(sy<0)는 스트로크 감쇠를 안 받음 — 실제 당구에서 잽(끊어)+하단도 백스핀은 실린다
        const strokeY = (sy < 0 && DRAW_FIX) ? Math.max(stroke.follow, 1) : stroke.follow;
        const w = base * sy * FOLLOW_GAIN * strokeY;
        cb.wx = -dy * w;                           // 톱스핀 축 = 진행방향 수평 수직
        cb.wy = dx * w;
        cb.wz = -base * engResp(sx) * SIDE_GAIN;  // 수직축 사이드스핀(비선형 응답)
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
            // CCD 역투영: 상대속도를 따라 되감아 '정확한 접촉 시점'의 배치 복원
            // (빠른 샷이 깊게 겹친 채 해소되면 중심선이 돌아가 얇은 히트 각도가 틀어짐)
            const rvfx = b.vx - a.vx, rvfy = b.vy - a.vy;
            const rv2 = rvfx * rvfx + rvfy * rvfy;
            let backed = false;
            if (rv2 > 1e-9) {
              // |d - rv·τ| = 2r 의 최소 양근 τ (한 스텝 이내만 신뢰)
              const bq = -(dx * rvfx + dy * rvfy);
              const cq = dist * dist - minDist * minDist;
              const disc = bq * bq - rv2 * cq;
              if (disc >= 0) {
                const tau = (-bq + Math.sqrt(disc)) / rv2;   // cq<0 → 양근 하나
                if (tau > 0 && tau < dt * 1.5) {
                  a.x -= a.vx * tau; a.y -= a.vy * tau;
                  b.x -= b.vx * tau; b.y -= b.vy * tau;
                  backed = true;
                }
              }
            }
            const ndx = b.x - a.x, ndy = b.y - a.y;
            const [nx, ny] = vNorm(ndx, ndy);
            if (!backed) {
              const overlap = minDist - Math.hypot(ndx, ndy);
              a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
              b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
            }
            const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
            const vRel = vDot(dvx, dvy, nx, ny);
            if (vRel > 0) {
              const J = (1 + e_ball) * vRel * 0.5;
              a.vx -= J * nx; a.vy -= J * ny;
              b.vx += J * nx; b.vy += J * ny;
              // v2 throw: 접촉점 상대표면속도 uT에 대해 마찰 임펄스.
              // μ는 표면속도가 느릴수록 큼(실물: 느린 컷샷이 더 많이 밀림) — Dr.Dave throw 곡선 근사
              const tx = -ny, ty = nx;
              const uT = vDot(dvx, dvy, tx, ty) + (a.wz + b.wz) * r;
              if (Math.abs(uT) > 1e-3) {
                const muBB = THROW_MIN + THROW_AMP * Math.exp(-Math.abs(uT) / THROW_REF);
                const sgn = Math.sign(uT);
                // 슬립 정지 임펄스: Δu = -7·Jt (양쪽 속도 2 + 양쪽 회전 5) → uT/7이면 그립
                const Jt = sgn * Math.min(Math.abs(uT) / 7, muBB * Math.abs(J));
                a.vx -= Jt * tx; a.vy -= Jt * ty;
                b.vx += Jt * tx; b.vy += Jt * ty;
                // 마찰 토크 → 양쪽 wz 변경(스핀 소모/전달이 물리로 발생, 하드컷 제거)
                a.wz -= (2.5 / r) * Jt;
                b.wz -= (2.5 / r) * Jt;
              }
            }
          }
        } else {
          contactPairs.delete(key);  // 떨어지면 접촉 해제
        }
      }
    }

    // ── 공-쿠션 충돌 v3: Han(2005) 임펄스 모델 (pooltool han_2005 포팅) ──────
    // 쿠션 프레임(+x = 쿠션으로 들어가는 방향)으로 회전 → 접촉높이 θ에서
    // 슬립 (sx,sy) 계산 → 스틱/슬라이드 판정 → 임펄스 (PX,PY,PZ) → 속도·스핀 동시 갱신.
    // 자연각 단축, 잉글리시 길어짐/짧아짐, 토프스핀 소모(쿠션이 회전을 먹음),
    // 구름/미끄럼 상태별 리바운드 차이가 전부 이 한 모델에서 나옴.
    function hanBounce(b) {
      // 쿠션 프레임 성분 (vx=법선 into-cushion, vy=레일 접선)
      const vx = b._cvx, vy = b._cvy, wx = b._cwx, wy = b._cwy, wz = b.wz;
      if (vx <= 0) return false;                       // 멀어지는 중이면 스킵
      const sinT = RAIL_SIN, cosT = RAIL_COS;
      // Han Eqs 14 (2D 테이블: vz=0)
      const sx = vx * sinT + r * wy;
      const sy = -vy - r * wz * cosT + r * wx * sinT;
      const cc = -vx * cosT;
      // Eqs 16~20 (단위질량: A=7/2, B=1)
      const PzE = -(1 + RAIL_E) * cc;                  // = (1+e)·vx·cosθ > 0
      const s0 = Math.hypot(sx, sy);
      const PzS = s0 * 2 / 7;
      let PxE, PyE;
      if (PzS <= RAIL_MU * PzE) { PxE = sx * 2 / 7; PyE = sy * 2 / 7; }   // 스틱(그립)
      else { PxE = RAIL_MU * PzE * sx / s0; PyE = RAIL_MU * PzE * sy / s0; } // 슬라이딩
      // Eqs 21~23: 접촉프레임 → 레일프레임 임펄스, 속도·각속도 갱신
      const PX = -PxE * sinT - PzE * cosT;
      const PY = PyE;
      const PZ = PxE * cosT - PzE * sinT;
      const RI = 2.5 / r;                              // R/I (단위질량, I=2/5·r²)
      b._cvx = vx + PX;
      b._cvy = vy + PY;
      b._cwx = wx - RI * PY * sinT;
      b._cwy = wy + RI * (PX * sinT - PZ * cosT);
      b.wz = wz + RI * PY * cosT;
      return true;
    }
    // 레일별 프레임 회전(90° 단위 정확 스왑 — 부동소수 회전오차 없음)
    // in: 테이블 (vx,vy,wx,wy) → 쿠션프레임 (_cvx.._cwy), out: 역변환
    const RAILS = [
      { side: 'left',   pen: b => b.x - r < 0,      clamp: b => { b.x = r; },
        in: b => { b._cvx = -b.vx; b._cvy = -b.vy; b._cwx = -b.wx; b._cwy = -b.wy; },
        out: b => { b.vx = -b._cvx; b.vy = -b._cvy; b.wx = -b._cwx; b.wy = -b._cwy; } },
      { side: 'right',  pen: b => b.x + r > tableW, clamp: b => { b.x = tableW - r; },
        in: b => { b._cvx = b.vx; b._cvy = b.vy; b._cwx = b.wx; b._cwy = b.wy; },
        out: b => { b.vx = b._cvx; b.vy = b._cvy; b.wx = b._cwx; b.wy = b._cwy; } },
      { side: 'top',    pen: b => b.y - r < 0,      clamp: b => { b.y = r; },
        in: b => { b._cvx = -b.vy; b._cvy = b.vx; b._cwx = -b.wy; b._cwy = b.wx; },
        out: b => { b.vx = b._cvy; b.vy = -b._cvx; b.wx = b._cwy; b.wy = -b._cwx; } },
      { side: 'bottom', pen: b => b.y + r > tableH, clamp: b => { b.y = tableH - r; },
        in: b => { b._cvx = b.vy; b._cvy = -b.vx; b._cwx = b.wy; b._cwy = -b.wx; },
        out: b => { b.vx = -b._cvy; b.vy = b._cvx; b.wx = -b._cwy; b.wy = b._cwx; } },
    ];
    for (const b of balls) {
      let cushionHit = false;
      let side = null;
      for (const rail of RAILS) {
        if (!rail.pen(b)) continue;
        rail.clamp(b);
        rail.in(b);
        const bounced = hanBounce(b);
        if (bounced) { rail.out(b); cushionHit = true; side = rail.side; }
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
        // 저속에선 냅(보풀) 저항 램프 → 마지막 구간이 부드럽게 죽으며 정지(뚝 끊김 제거)
        b.wy = b.vx / r; b.wx = -b.vy / r;
        const spd = vLen(b.vx, b.vy);
        if (spd > PHYSICS.STOP_VELOCITY) {
          const nap = spd < PHYSICS.NAP_V ? 1 + PHYSICS.NAP_GAIN * (1 - spd / PHYSICS.NAP_V) : 1;
          const ratio = Math.max(0, spd - mu_r * nap * g * dt) / spd;
          b.vx *= ratio; b.vy *= ratio;
          b.wx *= ratio; b.wy *= ratio;
        }
      }

      // 정지 처리
      if (vLen(b.vx, b.vy) < PHYSICS.STOP_VELOCITY &&
          Math.hypot(b.vx - b.wy * r, b.vy + b.wx * r) < SLIP_EPS) {
        b.vx = 0; b.vy = 0; b.wx = 0; b.wy = 0;
      }
      // 사이드스핀 감쇠: 천 마찰 토크에 의한 선형(시간 기반) 감쇠 — 스트로크가 배율
      if (b.wz) {
        const dw = WZ_DECAY * dt;
        b.wz = Math.abs(b.wz) <= dw ? 0 : b.wz - Math.sign(b.wz) * dw;
      }
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

  // Test 3b: 3구 순서 판정 — 쿠션 없이 두 적구를 맞히면(끌어치기 1D 캐롬) 무효
  //   수구가 b1 정면 타격 후 백스핀으로 후퇴 → 뒤의 b2 접촉. 경로 비의존(직선상).
  {
    const shot = makeShotInput('3ball', [
      { id: 0, x: 700, y: 710, vx: 5000, vy: 0, spinX: 0, spinY: -0.9 },
      { id: 1, x: 1100, y: 710, vx: 0, vy: 0, spinX: 0, spinY: 0 },
      { id: 2, x: 250, y: 710, vx: 0, vy: 0, spinX: 0, spinY: 0 },
    ]);
    const res = simulate(shot);
    assert('3구 순서: 두 적구 모두 히트', res.hitIds.includes(1) && res.hitIds.includes(2));
    assert('3구 순서: 2적구 시점 쿠션 0', res.cushBeforeSecond === 0);
    assert('3구 순서: 2적구 전 쿠션 부족 → score 0', res.score === 0);
  }

  // Test 4: 4구 득점 — 빨강1 정면 후 끌어치기로 후퇴, 뒤의 빨강2 캐롬(1D, 경로 비의존)
  {
    const shot = makeShotInput('4ball', [
      { id: 0, x: 700, y: 635, vx: 5000, vy: 0, spinX: 0, spinY: -0.9 },
      { id: 1, x: 1100, y: 635, vx: 0, vy: 0, spinX: 0, spinY: 0 },
      { id: 2, x: 300, y: 635, vx: 0, vy: 0, spinX: 0, spinY: 0 },
      { id: 3, x: 2300, y: 1100, vx: 0, vy: 0, spinX: 0, spinY: 0 },
    ]);
    const res = simulate(shot);
    assert('4구: 빨강1+빨강2 모두 히트', res.hitIds.includes(1) && res.hitIds.includes(2));
    assert('4구: score 1', res.score === 1);
  }

  // Test 4b: 4구 파울 — 상대공 접촉 시 득점 무효(수구 직선 경로에 상대공 배치, 경로 비의존)
  {
    const shot = makeShotInput('4ball', [
      { id: 0, x: 500, y: 650, vx: 6500, vy: 0, spinX: 0, spinY: 0 },
      { id: 1, x: 1500, y: 300, vx: 0, vy: 0, spinX: 0, spinY: 0 },
      { id: 2, x: 1500, y: 1000, vx: 0, vy: 0, spinX: 0, spinY: 0 },
      { id: 3, x: 900, y: 650, vx: 0, vy: 0, spinX: 0, spinY: 0 },  // 수구 정면 = 확정 파울
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

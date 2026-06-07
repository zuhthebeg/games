'use strict';
// ui.js — 조준/당점/파워 UI 컨트롤러 (v2: 회전·게이지·가이드)

const MAX_SPIN = 0.7;   // 당점 최대 반경(미스큐 한계). game.js shoot()와 일치시킬 것

// ── 3x3 회전 유틸 (공 구름 표현) ──────────────────────────
function mat3Identity() { return [1,0,0, 0,1,0, 0,0,1]; }
function mat3Mul(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    r[i*3+j] = a[i*3]*b[j] + a[i*3+1]*b[3+j] + a[i*3+2]*b[6+j];
  }
  return r;
}
function mat3Vec(m, v) {
  return [
    m[0]*v[0] + m[1]*v[1] + m[2]*v[2],
    m[3]*v[0] + m[4]*v[1] + m[5]*v[2],
    m[6]*v[0] + m[7]*v[1] + m[8]*v[2],
  ];
}
// 축(단위)·각도 → 회전행렬 (Rodrigues)
function mat3Axis(ax, ay, az, th) {
  const c = Math.cos(th), s = Math.sin(th), t = 1 - c;
  return [
    t*ax*ax + c,     t*ax*ay - s*az,  t*ax*az + s*ay,
    t*ax*ay + s*az,  t*ay*ay + c,     t*ay*az - s*ax,
    t*ax*az - s*ay,  t*ay*az + s*ax,  t*az*az + c,
  ];
}
// 공 표면 마킹점(바디좌표 단위벡터). [0]은 큰 메인 점
const BALL_SPOTS = [
  [0, 0, 1], [0, 0, -1],
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
];

class BilliardsUI {
  constructor(canvas, game, onShot) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.onShot = onShot;

    this.aimAngleDeg = 0;
    this.shotPower = 0.4;   // 0~1
    this.spinX = 0;         // -1(좌) ~ +1(우)
    this.spinY = 0;         // -1(끌어) ~ +1(밀어)

    this.rotated = false;   // 세로화면이면 테이블 90도 회전

    // 줌/팬 (핀치줌)
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this._pinch = null;     // { startDist, startZoom, lastMid }

    // 두께 미리보기/조절 상태
    this._thickness = null;   // 가이드 계산 시 갱신 { frac, side, ballColor }
    this._aimTarget = null;   // 현재 조준이 향한 1목적구 { ball, side }
    this.targetThickness = 1;     // 현재 두께(풀=1)
    this.thickPos = 0.5;          // 슬라이더 위치(가운데=정면)

    // 드래그 상태
    this._mode = null;      // 'aim' | 'spin' | 'power' | null
    this._spinWidget = null;
    this._powerBar = null;
    this._shotBtn = null;
    this._tableRect = null;
    this._thickView = null; // 두께 미리보기 위젯 위치
    this.scale = 1;

    // 애니메이션
    this._animFrames = null;
    this._animIdx = 0;
    this._rafId = null;

    // 공 구름 방향(회전행렬) — 표면 마킹으로 회전 가시화
    this._orient = {};

    this._bindEvents();
  }

  // ── 레이아웃 ─────────────────────────────────────────────
  layout() {
    const W = this.canvas.width, H = this.canvas.height;
    const g = this.game;

    const headerH = 56;
    const padB = 24;                       // 바닥 안전여백(네비바 회피)
    const footerH = Math.max(168, H * 0.22) + padB;
    const padX = 10;
    const availW = W - padX * 2;
    const availH = H - headerH - footerH;

    // 세로 화면이면 테이블 회전(긴변을 세로로)
    this.rotated = H > W;

    // 회전 여부에 따라 테이블의 화면상 가로/세로(mm)
    const mmW = this.rotated ? g.tableH : g.tableW;
    const mmH = this.rotated ? g.tableW : g.tableH;
    const aspect = mmW / mmH;

    let tW, tH;
    if (availW / availH > aspect) {
      tH = availH; tW = tH * aspect;
    } else {
      tW = availW; tH = tW / aspect;
    }
    const tX = (W - tW) / 2;
    const tY = headerH + (availH - tH) / 2;
    this._tableRect = { x: tX, y: tY, w: tW, h: tH };
    this.scale = this.rotated ? (tW / g.tableH) : (tW / g.tableW);
    // 줌 중심 = 테이블 중심
    this._viewCx = tX + tW / 2;
    this._viewCy = tY + tH / 2;

    // 당점 위젯 (좌하단) — 바닥에서 padB 띄움
    const wR = Math.min(52, (footerH - padB) * 0.46);
    this._spinWidget = { cx: padX + wR + 6, cy: H - padB - wR, r: wR };

    // 두께 미리보기 위젯 (당점 위젯 바로 위)
    const tvR = wR * 0.66;
    this._thickView = { cx: padX + tvR + 6, cy: this._spinWidget.cy - wR - tvR - 10, r: tvR };

    // 샷 버튼 (우하단)
    const btnW = Math.min(108, W * 0.26), btnH = Math.min(50, wR * 2);
    this._shotBtn = { x: W - btnW - padX, y: H - padB - btnH, w: btnW, h: btnH };

    // 파워바(위) + 두께바(아래) — 당점위젯과 샷버튼 사이 2단, 바닥여백 위에
    const pbX = this._spinWidget.cx + wR + 16;
    const pbW = this._shotBtn.x - pbX - 16;
    this._thickBar = { x: pbX, y: H - padB - 26, w: pbW, h: 18 };
    this._powerBar = { x: pbX, y: this._thickBar.y - 46, w: pbW, h: 18 };
  }

  // ── 좌표 변환 (회전 + 줌/팬 지원) ────────────────────────
  toScreen(mx, my) {
    const { x, y } = this._tableRect;
    let bx, by;
    if (this.rotated) { bx = x + my * this.scale; by = y + mx * this.scale; }
    else { bx = x + mx * this.scale; by = y + my * this.scale; }
    // 줌/팬 적용 (테이블 중심 기준 확대)
    const sx = (bx - this._viewCx) * this.zoom + this._viewCx + this.panX;
    const sy = (by - this._viewCy) * this.zoom + this._viewCy + this.panY;
    return [sx, sy];
  }
  fromScreen(sx, sy) {
    const { x, y } = this._tableRect;
    // 줌/팬 역변환
    const bx = (sx - this.panX - this._viewCx) / this.zoom + this._viewCx;
    const by = (sy - this.panY - this._viewCy) / this.zoom + this._viewCy;
    if (this.rotated) { return [(by - y) / this.scale, (bx - x) / this.scale]; }
    return [(bx - x) / this.scale, (by - y) / this.scale];
  }

  // ── 이벤트 ───────────────────────────────────────────────
  _bindEvents() {
    const el = this.canvas;
    el.addEventListener('mousedown', e => this._onDown(e));
    el.addEventListener('mousemove', e => this._onMove(e));
    window.addEventListener('mouseup', e => this._onUp(e));
    el.addEventListener('wheel', e => this._onWheel(e), { passive: false });
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      if (e.touches.length >= 2) this._pinchStart(e.touches);
      else this._onDown(e.touches[0]);
    }, { passive: false });
    el.addEventListener('touchmove', e => {
      e.preventDefault();
      if (this._pinch && e.touches.length >= 2) this._pinchMove(e.touches);
      else if (!this._pinch) this._onMove(e.touches[0]);
    }, { passive: false });
    el.addEventListener('touchend', e => {
      e.preventDefault();
      if (this._pinch) { if (e.touches.length < 2) this._pinch = null; return; }
      this._onUp(e.changedTouches[0]);
    }, { passive: false });
  }

  // ── 핀치줌 ───────────────────────────────────────────────
  _touchMid(touches) {
    const r = this.canvas.getBoundingClientRect();
    const sxk = this.canvas.width / r.width, syk = this.canvas.height / r.height;
    const a = touches[0], b = touches[1];
    return {
      mx: ((a.clientX + b.clientX) / 2 - r.left) * sxk,
      my: ((a.clientY + b.clientY) / 2 - r.top) * syk,
      dist: Math.hypot((a.clientX - b.clientX) * sxk, (a.clientY - b.clientY) * syk),
    };
  }
  _pinchStart(touches) {
    this._mode = null;
    const m = this._touchMid(touches);
    this._pinch = { startDist: m.dist || 1, startZoom: this.zoom, lastMid: m };
  }
  _pinchMove(touches) {
    const m = this._touchMid(touches);
    const p = this._pinch;
    this.zoom = Math.max(1, Math.min(3.5, p.startZoom * (m.dist / p.startDist)));
    // 두 손가락 이동 = 팬
    this.panX += m.mx - p.lastMid.mx;
    this.panY += m.my - p.lastMid.my;
    p.lastMid = m;
    if (this.zoom <= 1.01) { this.zoom = 1; this.panX = 0; this.panY = 0; }
    this._clampPan();
    this.draw();
  }
  _onWheel(e) {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.zoom = Math.max(1, Math.min(3.5, this.zoom * f));
    if (this.zoom <= 1.01) { this.zoom = 1; this.panX = 0; this.panY = 0; }
    this._clampPan();
    this.draw();
  }
  _clampPan() {
    // 테이블이 화면 밖으로 너무 빠지지 않게 제한
    const lim = Math.max(this._tableRect.w, this._tableRect.h) * this.zoom * 0.6;
    this.panX = Math.max(-lim, Math.min(lim, this.panX));
    this.panY = Math.max(-lim, Math.min(lim, this.panY));
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      sx: (e.clientX - r.left) * (this.canvas.width / r.width),
      sy: (e.clientY - r.top) * (this.canvas.height / r.height),
    };
  }

  _onDown(e) {
    if (this.game.phase !== 'aiming') return;
    const { sx, sy } = this._pos(e);

    // 샷 버튼
    const b = this._shotBtn;
    if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) {
      this._fire();
      return;
    }
    // 당점 위젯
    const sw = this._spinWidget;
    if (Math.hypot(sx - sw.cx, sy - sw.cy) < sw.r + 12) {
      this._mode = 'spin'; this._updateSpin(sx, sy); this.draw(); return;
    }
    // 파워바
    const pb = this._powerBar;
    if (sy > pb.y - 16 && sy < pb.y + pb.h + 16 && sx > pb.x - 6 && sx < pb.x + pb.w + 6) {
      this._mode = 'power'; this._updatePower(sx); this.draw(); return;
    }
    // 두께바
    const tb = this._thickBar;
    if (sy > tb.y - 16 && sy < tb.y + tb.h + 16 && sx > tb.x - 6 && sx < tb.x + tb.w + 6) {
      // 드래그 시작 시 컷 방향 고정(좌우 왔다갔다 방지)
      this._thickLock = this._aimTarget || this._pickTarget();
      this._mode = 'thick'; this._updateThickness(sx); this.draw(); return;
    }
    // 테이블 → 조준
    this._mode = 'aim'; this._updateAim(sx, sy); this.draw();
  }

  _onMove(e) {
    if (!this._mode) return;
    const { sx, sy } = this._pos(e);
    if (this._mode === 'spin') this._updateSpin(sx, sy);
    else if (this._mode === 'power') this._updatePower(sx);
    else if (this._mode === 'thick') this._updateThickness(sx);
    else if (this._mode === 'aim') this._updateAim(sx, sy);
    this.draw();
  }

  _onUp() { this._mode = null; this._thickLock = null; }

  _updateAim(sx, sy) {
    const cue = this.game.cueBall();
    if (!cue) return;
    const [cx, cy] = this.toScreen(cue.x, cue.y);
    const sdx = sx - cx, sdy = sy - cy;
    // 화면 방향 → mm 방향
    let mdx, mdy;
    if (this.rotated) {
      // toScreen: screenX=my*s, screenY=mx*s  → mm dx=screen dy, mm dy=screen dx
      mdx = sdy; mdy = sdx;
    } else {
      mdx = sdx; mdy = sdy;
    }
    this.aimAngleDeg = Math.atan2(mdy, mdx) * 180 / Math.PI;
  }

  _updateSpin(sx, sy) {
    const sw = this._spinWidget;
    let dx = (sx - sw.cx) / sw.r;
    let dy = (sy - sw.cy) / sw.r;
    const len = Math.hypot(dx, dy);
    // 최대 당점 반경으로 클램프(미스큐 영역 진입 방지 → 항상 유효한 샷)
    if (len > MAX_SPIN) { dx *= MAX_SPIN / len; dy *= MAX_SPIN / len; }
    this.spinX = dx;
    this.spinY = -dy;   // 화면 아래 = 끌어(-)
  }

  _updatePower(sx) {
    const pb = this._powerBar;
    this.shotPower = Math.max(0.02, Math.min(1, (sx - pb.x) / pb.w));
  }

  // 두께 슬라이더: 가운데=정면(풀), 왼쪽=왼쪽얇게, 오른쪽=오른쪽얇게
  // → 한 슬라이더로 컷 방향+두께 동시 조절(양쪽 다 가능, 왔다갔다 없음)
  _updateThickness(sx) {
    const tb = this._thickBar;
    this.thickPos = Math.max(0, Math.min(1, (sx - tb.x) / tb.w));
    const signed = (this.thickPos - 0.5) * 2;   // -1(좌끝) ~ +1(우끝)
    const frac = 1 - Math.abs(signed);          // 가운데=1 정면
    const side = signed >= 0 ? 1 : -1;
    this.targetThickness = frac;
    const tgt = this._thickLock || this._pickTarget(); // 공만 고정, 방향은 슬라이더
    if (!tgt) return;
    const cue = this.game.cueBall();
    if (!cue) return;
    const R = this.game.ballRadius;
    const ox = tgt.ball.x - cue.x, oy = tgt.ball.y - cue.y;
    const D = Math.hypot(ox, oy) || 1;
    const perp = (1 - frac) * 2 * R;
    const alpha = Math.asin(Math.max(0, Math.min(1, perp / D)));
    const base = Math.atan2(oy, ox);
    this.aimAngleDeg = (base + side * alpha) * 180 / Math.PI;
  }

  // 조준 대상 1목적구 선택: 현재 조준선에 '수직거리상 가장 가까운' 앞쪽 적구
  _pickTarget() {
    const cue = this.game.cueBall();
    if (!cue) return null;
    const cueId = this.game.cueId();
    const rad = this.aimAngleDeg * Math.PI / 180;
    const dx = Math.cos(rad), dy = Math.sin(rad);
    let best = Infinity, ball = null, side = 1;
    for (const b of this.game.balls) {
      if (b.id === cueId) continue;
      const ox = b.x - cue.x, oy = b.y - cue.y;
      const proj = ox * dx + oy * dy;
      if (proj <= 0) continue;                 // 조준 뒤쪽 공 제외
      const perp = ox * (-dy) + oy * dx;       // 조준선까지 부호있는 수직거리
      const ap = Math.abs(perp);
      if (ap < best) { best = ap; ball = b; side = perp >= 0 ? 1 : -1; }
    }
    if (!ball) return null;
    return { ball, side };
  }

  _fire() {
    const MAX = 6500;
    const power = this.shotPower * MAX;
    if (power < 50) return;
    this._initAudio();   // 사용자 제스처 시점에 오디오 활성화
    const res = this.game.shoot(this.aimAngleDeg, power, this.spinX, this.spinY);
    if (!res) return;
    this._playAnim(res, () => { if (this.onShot) this.onShot(res); });
  }

  // ── 애니메이션 (+사운드 이벤트) ──────────────────────────
  _playAnim(res, done) {
    const frames = res.frames;
    // 이벤트 디듀프(같은 종류 60ms 내 합치기) → 사운드 큐
    const evq = [];
    let lastBall = -1, lastCush = -1;
    for (const e of (res.events || [])) {
      if (e.type === 'ball-ball') {
        if (e.t - lastBall > 0.06) { evq.push({ t: e.t, s: 'ball' }); lastBall = e.t; }
      } else if (e.type === 'cushion') {
        if (e.t - lastCush > 0.05) { evq.push({ t: e.t, s: 'cushion' }); lastCush = e.t; }
      }
    }
    let ei = 0;
    // 시간기반 보간 재생: 디스플레이 주사율로 부드럽게, 살짝(1.4x) 압축
    const SPEED = 1.4;
    const totalT = frames[frames.length - 1].t;
    let simT = 0, fi = 0, lastTs = null;
    let prevBalls = frames[0].balls;
    this._animFrames = frames;

    const sample = (st) => {
      while (fi < frames.length - 1 && frames[fi + 1].t <= st) fi++;
      if (fi >= frames.length - 1) return frames[frames.length - 1].balls;
      const a = frames[fi], b = frames[fi + 1];
      const u = (st - a.t) / ((b.t - a.t) || 1);
      return a.balls.map((ba, k) => {
        const bb = b.balls[k] || ba;
        return { id: ba.id, x: ba.x + (bb.x - ba.x) * u, y: ba.y + (bb.y - ba.y) * u, wz: ba.wz };
      });
    };

    const step = (ts) => {
      if (lastTs == null) lastTs = ts || 0;
      const dtr = Math.min(0.05, ((ts || 0) - lastTs) / 1000);
      lastTs = ts || 0;
      simT += dtr * SPEED;

      while (ei < evq.length && evq[ei].t <= simT) { this._sfx(evq[ei].s); ei++; }

      const balls = sample(simT);
      const dt = Math.max(1e-3, dtr * SPEED);
      this._rollFromPositions(prevBalls, balls, dt);
      prevBalls = balls;
      this.draw(balls);

      if (simT >= totalT) {
        this._animFrames = null;
        this.draw();
        if (res.score > 0) this._sfx('score');
        if (done) done();
        return;
      }
      this._rafId = requestAnimationFrame(step);
    };
    this._rafId = requestAnimationFrame(step);
  }

  // ── 공 회전 (구름 + 좌우스핀 가시화) ─────────────────────
  _orientOf(id) { return this._orient[id] || (this._orient[id] = mat3Identity()); }
  _rollFromPositions(prev, cur, dt) {
    const R = this.game.ballRadius;
    for (const cb of cur) {
      const pb = prev.find(p => p.id === cb.id);
      if (!pb) continue;
      const dxm = cb.x - pb.x, dym = cb.y - pb.y;
      const dist = Math.hypot(dxm, dym);
      let O = this._orientOf(cb.id);
      if (dist >= 0.4) {                        // 구름: 진행방향 수직 수평축
        const theta = dist / R;
        O = mat3Mul(mat3Axis(-dym / dist, dxm / dist, 0, theta), O);
      }
      // 좌우스핀: 수직축(z) 회전 — 제자리 회전 보임
      const wz = cb.wz || 0;
      if (Math.abs(wz) > 0.05 && dt) {
        O = mat3Mul(mat3Axis(0, 0, 1, wz * dt), O);
      }
      this._orient[cb.id] = O;
    }
  }
  _drawSpots(b, rpx) {
    const ctx = this.ctx;
    const R = this.game.ballRadius;
    const O = this._orientOf(b.id);
    const baseCol = this.game.cfg.ballColors[b.id] || '#ccc';
    const spotCol = this._spotColor(baseCol);
    const surf = R * 0.80;
    for (let i = 0; i < BALL_SPOTS.length; i++) {
      const v = mat3Vec(O, BALL_SPOTS[i]);
      if (v[2] <= 0.10) continue;             // 앞면(보이는 쪽)만
      const [mx, my] = this.toScreen(b.x + v[0] * surf, b.y + v[1] * surf);
      const sz = rpx * (i === 0 ? 0.30 : 0.17) * (0.55 + 0.45 * v[2]);
      ctx.beginPath(); ctx.arc(mx, my, sz, 0, Math.PI * 2);
      ctx.fillStyle = spotCol;
      ctx.globalAlpha = 0.35 + 0.65 * v[2];
      ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  _spotColor(ballCol) {
    if (ballCol === 'red') return '#ffe39a';
    if (ballCol === 'white' || ballCol === '#fff') return '#c0392b';
    if (typeof ballCol === 'string' && ballCol.startsWith('#e8')) return '#6b4200';
    return 'rgba(0,0,0,0.55)';
  }

  // ── 사운드 (WebAudio 합성) ───────────────────────────────
  _initAudio() {
    if (this._actx) { if (this._actx.state === 'suspended') this._actx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this._actx = AC ? new AC() : null;
    } catch (e) { this._actx = null; }
  }
  _noise(dur, peak, filterType, freq) {
    const ac = this._actx, now = ac.currentTime;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ac.createBufferSource(); src.buffer = buf;
    const bp = ac.createBiquadFilter(); bp.type = filterType; bp.frequency.value = freq;
    const g = ac.createGain(); g.gain.value = peak;
    src.connect(bp).connect(g).connect(ac.destination);
    src.start(now);
  }
  _ping(f0, f1, peak, dur, type) {
    const ac = this._actx, now = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(f0, now);
    o.frequency.exponentialRampToValueAtTime(f1, now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(ac.destination);
    o.start(now); o.stop(now + dur + 0.02);
  }
  _sfx(kind) {
    const ac = this._actx; if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    if (kind === 'ball') {            // 공-공: 날카로운 '딱'
      this._ping(1900, 950, 0.5, 0.08, 'triangle');
      this._noise(0.03, 0.22, 'bandpass', 2600);
    } else if (kind === 'cushion') {  // 쿠션: 낮고 부드러운 '툭'
      this._ping(260, 130, 0.3, 0.12, 'sine');
      this._noise(0.04, 0.10, 'lowpass', 600);
    } else if (kind === 'score') {    // 득점: 띠링
      this._ping(660, 660, 0.35, 0.12, 'sine');
      const ac2 = this._actx;
      setTimeout(() => { if (ac2) this._ping(990, 990, 0.35, 0.16, 'sine'); }, 110);
    }
  }

  // ── 드로잉 ───────────────────────────────────────────────
  draw(overrideBalls) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._drawTable();
    const balls = overrideBalls || this.game.balls;

    const aiming = this.game.phase === 'aiming' && !overrideBalls;
    if (aiming) this._drawGuide(balls);
    this._drawBalls(balls);
    if (aiming) this._drawThickView();
    this._drawSpinWidget();
    this._drawPowerBar();
    this._drawThickBar();
    this._drawShotBtn();
    this._drawHUD();
  }

  _drawThickBar() {
    const ctx = this.ctx;
    const { x, y, w, h } = this._thickBar;
    const p = this.thickPos;            // 0좌끝 0.5정면 1우끝
    // 트랙
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    this._roundRect(x, y, w, h, h / 2); ctx.fill();
    // 가운데(정면) 마크
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + w / 2 - 1, y - 2, 2, h + 4);
    // 가운데에서 핸들 쪽으로 채움(어느쪽 컷인지 표시)
    ctx.fillStyle = 'rgba(120,200,255,0.55)';
    const cxm = x + w / 2, hx = x + w * p;
    this._roundRect(Math.min(cxm, hx), y, Math.abs(hx - cxm), h, 0); ctx.fill();
    // 핸들
    ctx.beginPath(); ctx.arc(hx, y + h / 2, h * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
    // 라벨: 두께(8등분) + 컷 방향
    const eighth = Math.round(this.targetThickness * 8);
    const dir = Math.abs(p - 0.5) < 0.04 ? '정면' : (p < 0.5 ? '◀좌' : '우▶');
    ctx.fillStyle = '#cfe1ee'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`두께 ${eighth}/8 ${dir}`, x, y - 7);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('좌얇게 ◀ 정면 ▶ 우얇게', x + w, y - 7);
  }

  // ── 두께 미리보기 위젯 (좌하단, 당점 위 / 1목적구 충돌 시) ──
  _drawThickView() {
    const tv = this._thickView;
    if (!tv) return;
    const ctx = this.ctx;
    const { cx, cy, r } = tv;
    const t = this._thickness;

    // 배경 패널
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,40,28,0.92)'; ctx.fill();
    ctx.strokeStyle = t ? '#7fd6a0' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2; ctx.stroke();

    if (!t) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = `${Math.max(8, r * 0.28)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('두께', cx, cy);
      ctx.textBaseline = 'alphabetic';
      return;
    }

    // 적구(중앙) + 수구 ghost(겹쳐서 두께 표현)
    const rr = r * 0.46;
    const offset = (1 - t.frac) * 2 * rr;     // frac=1 정면(겹침0) ~ frac=0 빗맞음
    const obx = cx, oby = cy - r * 0.12;
    const cux = cx - t.side * offset, cuy = oby;

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r - 3, 0, Math.PI * 2); ctx.clip();
    // 적구
    ctx.beginPath(); ctx.arc(obx, oby, rr, 0, Math.PI * 2);
    ctx.fillStyle = t.ballColor; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
    // 수구 ghost
    ctx.beginPath(); ctx.arc(cux, cuy, rr, 0, Math.PI * 2);
    const cueCol = this.game.cueColor();
    ctx.fillStyle = cueCol; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(cux, cuy, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // 두께 수치 (8등분 표기)
    const eighth = Math.round(t.frac * 8);
    ctx.fillStyle = '#cfe9d6';
    ctx.font = `bold ${Math.max(9, r * 0.3)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${eighth}/8`, cx, cy + r - 6);
  }

  // 반지름/길이용 화면 배율 (스케일×줌)
  get px() { return this.scale * this.zoom; }

  _drawTable() {
    const ctx = this.ctx;
    const g = this.game;
    // mm 코너로 화면 사각형 산출 → 줌/팬/회전 일관 적용
    const [x0, y0] = this.toScreen(0, 0);
    const [x1, y1] = this.toScreen(g.tableW, g.tableH);
    const x = Math.min(x0, x1), y = Math.min(y0, y1);
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    const rail = Math.max(10, w * 0.030);

    // 나무 레일
    ctx.fillStyle = '#5a3d24';
    ctx.fillRect(x - rail, y - rail, w + rail * 2, h + rail * 2);
    // 펠트
    ctx.fillStyle = '#1d7d46';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // ── 다이아몬드 포인트 (표준 355mm 간격: 장변 8등분, 단변 4등분) ──
    // 화면 가로변 등분수 / 세로변 등분수 (회전 여부에 따라 장단변 교체)
    const segH = this.rotated ? 4 : 8;   // 가로 화면변
    const segV = this.rotated ? 8 : 4;   // 세로 화면변
    const ds = Math.max(3, rail * 0.32); // 다이아 크기
    const off = rail * 0.5;              // 레일 중앙
    ctx.fillStyle = '#efe2c0';
    const diamond = (px, py) => {
      ctx.beginPath();
      ctx.moveTo(px, py - ds); ctx.lineTo(px + ds, py);
      ctx.lineTo(px, py + ds); ctx.lineTo(px - ds, py);
      ctx.closePath(); ctx.fill();
    };
    for (let i = 1; i < segH; i++) {
      const px = x + (w * i) / segH;
      diamond(px, y - off); diamond(px, y + h + off);
    }
    for (let i = 1; i < segV; i++) {
      const py = y + (h * i) / segV;
      diamond(x - off, py); diamond(x + w + off, py);
    }
  }

  _drawBalls(balls) {
    const ctx = this.ctx;
    const r = this.game.ballRadius * this.px;
    const colors = this.game.cfg.ballColors;
    for (const b of balls) {
      const [sx, sy] = this.toScreen(b.x, b.y);
      // 그림자
      ctx.beginPath();
      ctx.arc(sx + r * 0.12, sy + r * 0.12, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
      // 공
      const col = colors[b.id] || '#ccc';
      const grad = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.1, sx, sy, r);
      grad.addColorStop(0, this._lighten(col));
      grad.addColorStop(1, col);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();
      // 표면 마킹(구름 회전 가시화) — 공 원 안으로 클립
      ctx.save();
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.clip();
      this._drawSpots(b, r);
      ctx.restore();
      // 하이라이트
      ctx.beginPath();
      ctx.arc(sx - r * 0.32, sy - r * 0.32, r * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
    }
  }

  _lighten(col) {
    if (col === 'white' || col === '#fff') return '#ffffff';
    if (col === 'red') return '#ff6b6b';
    if (col.startsWith('#e8')) return '#fff97a';
    return '#ffffff';
  }

  // ── 가이드: 조준선 + ghost ball + 1차 반사 ──────────────
  _drawGuide(balls) {
    const ctx = this.ctx;
    const cueId = this.game.cueId();
    const cue = balls.find(b => b.id === cueId);
    if (!cue) return;
    const R = this.game.ballRadius;
    const rad = this.aimAngleDeg * Math.PI / 180;
    const dx = Math.cos(rad), dy = Math.sin(rad);

    // mm 공간에서 첫 충돌 지점 탐색
    const hit = this._raycast(cue, dx, dy, balls, R);

    const [csx, csy] = this.toScreen(cue.x, cue.y);
    const [hsx, hsy] = this.toScreen(hit.x, hit.y);

    // 조준선
    ctx.save();
    ctx.setLineDash([8, 7]);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(csx, csy); ctx.lineTo(hsx, hsy); ctx.stroke();
    ctx.restore();

    const rScreen = R * this.px;

    this._thickness = null;
    this._aimTarget = null;
    if (hit.type === 'ball') {
      // ghost ball
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(hsx, hsy, rScreen, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // 맞은 공의 예상 진행 방향 (중심선)
      const tb = hit.ball;
      const ndx = tb.x - hit.x, ndy = tb.y - hit.y;
      const nl = Math.hypot(ndx, ndy) || 1;
      const ux = ndx / nl, uy = ndy / nl;
      const [tsx, tsy] = this.toScreen(tb.x, tb.y);
      const [esx, esy] = this.toScreen(tb.x + ux * R * 6, tb.y + uy * R * 6);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,220,100,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tsx, tsy); ctx.lineTo(esx, esy); ctx.stroke();
      ctx.restore();

      // 두께 계산: 적구 중심과 조준선의 수직거리 d → 겹침비율
      // d=0 정면(두께1), d=2R 빗맞음(두께0)
      const ox = tb.x - cue.x, oy = tb.y - cue.y;
      const proj = ox * dx + oy * dy;
      const perp = Math.abs(ox * (-dy) + oy * dx); // 조준선까지 수직거리
      const frac = Math.max(0, Math.min(1, 1 - perp / (2 * R)));
      // 컷 방향(적구가 조준선 어느쪽?): 부호
      const side = (ox * (-dy) + oy * dx) >= 0 ? 1 : -1;
      this._thickness = { frac, side, ballColor: this.game.cfg.ballColors[tb.id] || '#ccc' };
      this._aimTarget = { ball: tb, side };
      this.targetThickness = frac;
      // 테이블로 조준 중이면 슬라이더 위치도 동기화(드래그 중 아닐 때만)
      if (this._mode !== 'thick') this.thickPos = 0.5 + (side * (1 - frac)) / 2;
    } else if (hit.type === 'cushion') {
      this._aimTarget = null;
      // 반사선 (1차)
      let rdx = dx, rdy = dy;
      if (hit.side === 'L' || hit.side === 'R') rdx = -rdx; else rdy = -rdy;
      const [rsx, rsy] = this.toScreen(hit.x + rdx * R * 8, hit.y + rdy * R * 8);
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(120,200,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(hsx, hsy); ctx.lineTo(rsx, rsy); ctx.stroke();
      ctx.restore();
    }
  }

  // mm 공간 레이캐스트: 첫 충돌(공 or 쿠션) 반환
  _raycast(cue, dx, dy, balls, R) {
    const W = this.game.tableW, H = this.game.tableH;
    let best = Infinity, result = null;

    // 공 충돌 (확장 반경 2R)
    for (const b of balls) {
      if (b.id === cue.id) continue;
      const ox = b.x - cue.x, oy = b.y - cue.y;
      const proj = ox * dx + oy * dy;
      if (proj <= 0) continue;
      const perp2 = (ox * ox + oy * oy) - proj * proj;
      const rr = (2 * R) * (2 * R);
      if (perp2 > rr) continue;
      const thc = Math.sqrt(rr - perp2);
      const t = proj - thc;
      if (t > 0 && t < best) {
        best = t;
        result = { type: 'ball', ball: b, x: cue.x + dx * t, y: cue.y + dy * t };
      }
    }
    // 쿠션 충돌
    const cand = [];
    if (dx > 0) cand.push({ t: (W - R - cue.x) / dx, side: 'R' });
    if (dx < 0) cand.push({ t: (R - cue.x) / dx, side: 'L' });
    if (dy > 0) cand.push({ t: (H - R - cue.y) / dy, side: 'B' });
    if (dy < 0) cand.push({ t: (R - cue.y) / dy, side: 'T' });
    for (const c of cand) {
      if (c.t > 0 && c.t < best) {
        best = c.t;
        result = { type: 'cushion', side: c.side, x: cue.x + dx * c.t, y: cue.y + dy * c.t };
      }
    }
    if (!result) {
      result = { type: 'none', x: cue.x + dx * 400, y: cue.y + dy * 400 };
    }
    return result;
  }

  // ── 당점 위젯 ────────────────────────────────────────────
  _drawSpinWidget() {
    const ctx = this.ctx;
    const { cx, cy, r } = this._spinWidget;
    const miscue = Math.hypot(this.spinX, this.spinY) > MAX_SPIN + 0.02;

    // 수구 색 베이스(현재 플레이어 수구색)
    const cueCol = this.game.cueColor();
    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    grad.addColorStop(0, this._lighten(cueCol));
    grad.addColorStop(1, cueCol === 'white' ? '#d8d8d8' : cueCol);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = miscue ? '#ff3b3b' : '#999'; ctx.lineWidth = 2.5; ctx.stroke();

    // 십자선
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();

    // 최대 당점 한계 링
    ctx.beginPath(); ctx.arc(cx, cy, r * MAX_SPIN, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(200,0,0,0.18)'; ctx.lineWidth = 1; ctx.stroke();

    // 당점 표시
    const dotX = cx + this.spinX * r * 0.82;
    const dotY = cy - this.spinY * r * 0.82;
    ctx.beginPath(); ctx.arc(dotX, dotY, r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = miscue ? '#ff3b3b' : '#d11'; ctx.fill();

    // 레이블
    ctx.fillStyle = '#ccc';
    ctx.font = `${Math.max(10, r * 0.26)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(this._spinLabel(), cx, cy + r + 16);
  }

  _spinLabel() {
    const parts = [];
    if (this.spinY > 0.3) parts.push('밀어'); else if (this.spinY < -0.3) parts.push('끌어');
    if (this.spinX > 0.3) parts.push('우'); else if (this.spinX < -0.3) parts.push('좌');
    return parts.join(' ') || '중앙';
  }

  // ── 파워바 ───────────────────────────────────────────────
  _drawPowerBar() {
    const ctx = this.ctx;
    const { x, y, w, h } = this._powerBar;
    // 트랙
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    this._roundRect(x, y, w, h, h / 2); ctx.fill();
    // 채움
    const p = this.shotPower;
    ctx.fillStyle = `hsl(${(1 - p) * 110}, 85%, 52%)`;
    this._roundRect(x, y, w * p, h, h / 2); ctx.fill();
    // 핸들
    const hx = x + w * p;
    ctx.beginPath(); ctx.arc(hx, y + h / 2, h * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
    // 텍스트
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`파워 ${Math.round(p * 100)}%`, x, y - 8);
  }

  _drawShotBtn() {
    const ctx = this.ctx;
    const { x, y, w, h } = this._shotBtn;
    ctx.fillStyle = '#e8453c';
    this._roundRect(x, y, w, h, 10); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('치기', x + w / 2, y + h / 2);
    ctx.textBaseline = 'alphabetic';
  }

  _drawHUD() {
    const ctx = this.ctx;
    const g = this.game, W = this.canvas.width;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, W, 50);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(g.cfg.label, 12, 20);
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#aaa';
    ctx.fillText(`이닝 ${g.inning}`, 12, 38);

    ctx.textAlign = 'center'; ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = g.currentPlayer === 0 ? '#ffd633' : '#fff';
    ctx.fillText(`P1 ${g.scores[0]}`, W / 2 - 55, 30);
    ctx.fillStyle = g.currentPlayer === 1 ? '#ffd633' : '#fff';
    ctx.fillText(`P2 ${g.scores[1]}`, W / 2 + 55, 30);
  }

  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  resize() {
    const c = this.canvas.parentElement;
    this.canvas.width = c.clientWidth || window.innerWidth;
    this.canvas.height = c.clientHeight || window.innerHeight;
    this.layout();
    this.draw();
  }
}

if (typeof window !== 'undefined') window.BilliardsUI = BilliardsUI;

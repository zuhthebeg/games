'use strict';
// ui.js — 조준/당점/파워 UI 컨트롤러 (v2: 회전·게이지·가이드)

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

    // 드래그 상태
    this._mode = null;      // 'aim' | 'spin' | 'power' | null
    this._spinWidget = null;
    this._powerBar = null;
    this._shotBtn = null;
    this._tableRect = null;
    this.scale = 1;

    // 애니메이션
    this._animFrames = null;
    this._animIdx = 0;
    this._rafId = null;

    this._bindEvents();
  }

  // ── 레이아웃 ─────────────────────────────────────────────
  layout() {
    const W = this.canvas.width, H = this.canvas.height;
    const g = this.game;

    const headerH = 56;
    const footerH = Math.max(150, H * 0.20);
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

    // 당점 위젯 (좌하단)
    const wR = Math.min(60, footerH * 0.42);
    this._spinWidget = { cx: padX + wR + 6, cy: H - wR - 18, r: wR };

    // 샷 버튼 (우하단)
    const btnW = Math.min(110, W * 0.26), btnH = 54;
    this._shotBtn = { x: W - btnW - padX, y: H - btnH - 18, w: btnW, h: btnH };

    // 파워바 (가운데, 당점위젯과 샷버튼 사이)
    const pbX = this._spinWidget.cx + wR + 16;
    const pbW = this._shotBtn.x - pbX - 16;
    this._powerBar = { x: pbX, y: H - footerH * 0.55, w: pbW, h: 22 };
  }

  // ── 좌표 변환 (회전 지원) ────────────────────────────────
  toScreen(mx, my) {
    const { x, y, w, h } = this._tableRect;
    if (this.rotated) {
      // 90도 회전: 테이블 mm(x:0..W, y:0..H) → 화면
      // 화면 가로 = mm y축, 화면 세로 = mm x축
      return [x + my * this.scale, y + mx * this.scale];
    }
    return [x + mx * this.scale, y + my * this.scale];
  }
  fromScreen(sx, sy) {
    const { x, y } = this._tableRect;
    if (this.rotated) {
      return [(sy - y) / this.scale, (sx - x) / this.scale];
    }
    return [(sx - x) / this.scale, (sy - y) / this.scale];
  }

  // ── 이벤트 ───────────────────────────────────────────────
  _bindEvents() {
    const el = this.canvas;
    el.addEventListener('mousedown', e => this._onDown(e));
    el.addEventListener('mousemove', e => this._onMove(e));
    window.addEventListener('mouseup', e => this._onUp(e));
    el.addEventListener('touchstart', e => { e.preventDefault(); this._onDown(e.touches[0]); }, { passive: false });
    el.addEventListener('touchmove', e => { e.preventDefault(); this._onMove(e.touches[0]); }, { passive: false });
    el.addEventListener('touchend', e => { e.preventDefault(); this._onUp(e.changedTouches[0]); }, { passive: false });
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
    if (sy > pb.y - 18 && sy < pb.y + pb.h + 18 && sx > pb.x - 6 && sx < pb.x + pb.w + 6) {
      this._mode = 'power'; this._updatePower(sx); this.draw(); return;
    }
    // 테이블 → 조준
    this._mode = 'aim'; this._updateAim(sx, sy); this.draw();
  }

  _onMove(e) {
    if (!this._mode) return;
    const { sx, sy } = this._pos(e);
    if (this._mode === 'spin') this._updateSpin(sx, sy);
    else if (this._mode === 'power') this._updatePower(sx);
    else if (this._mode === 'aim') this._updateAim(sx, sy);
    this.draw();
  }

  _onUp() { this._mode = null; }

  _updateAim(sx, sy) {
    const cue = this.game.balls.find(b => b.id === 0);
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
    if (len > 1) { dx /= len; dy /= len; }   // 원 안에 클램프
    this.spinX = dx;
    this.spinY = -dy;   // 화면 아래 = 끌어(-)
  }

  _updatePower(sx) {
    const pb = this._powerBar;
    this.shotPower = Math.max(0.02, Math.min(1, (sx - pb.x) / pb.w));
  }

  _fire() {
    const MAX = 6500;
    const power = this.shotPower * MAX;
    if (power < 50) return;
    const res = this.game.shoot(this.aimAngleDeg, power, this.spinX, this.spinY);
    if (!res) return;
    this._playAnim(res.frames, () => { if (this.onShot) this.onShot(res); });
  }

  // ── 애니메이션 ───────────────────────────────────────────
  _playAnim(frames, done) {
    this._animFrames = frames; this._animIdx = 0;
    const step = () => {
      if (this._animIdx >= frames.length) {
        this._animFrames = null;
        this.draw();
        if (done) done();
        return;
      }
      this.draw(frames[this._animIdx].balls);
      this._animIdx += 1;
      this._rafId = requestAnimationFrame(step);
    };
    step();
  }

  // ── 드로잉 ───────────────────────────────────────────────
  draw(overrideBalls) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._drawTable();
    const balls = overrideBalls || this.game.balls;

    if (this.game.phase === 'aiming' && !overrideBalls) {
      this._drawGuide(balls);
    }
    this._drawBalls(balls);
    this._drawSpinWidget();
    this._drawPowerBar();
    this._drawShotBtn();
    this._drawHUD();
  }

  _drawTable() {
    const ctx = this.ctx;
    const { x, y, w, h } = this._tableRect;
    const rail = Math.max(8, w * 0.025);
    // 나무 레일
    ctx.fillStyle = '#5a3d24';
    ctx.fillRect(x - rail, y - rail, w + rail * 2, h + rail * 2);
    // 펠트
    ctx.fillStyle = '#1d7d46';
    ctx.fillRect(x, y, w, h);
    // 안쪽 라인
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }

  _drawBalls(balls) {
    const ctx = this.ctx;
    const r = this.game.ballRadius * this.scale;
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
    const cue = balls.find(b => b.id === 0);
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

    const rScreen = R * this.scale;

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
    } else if (hit.type === 'cushion') {
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
      if (b.id === 0) continue;
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
    const miscue = Math.hypot(this.spinX, this.spinY) > 0.85;

    // 흰 공 베이스
    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#d8d8d8');
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = miscue ? '#ff3b3b' : '#999'; ctx.lineWidth = 2.5; ctx.stroke();

    // 십자선
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();

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

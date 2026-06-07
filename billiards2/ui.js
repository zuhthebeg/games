'use strict';
// ui.js — 조준/당점/파워 UI 컨트롤러

class BilliardsUI {
  constructor(canvas, game, onShot) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.onShot = onShot; // callback(angleDeg, power, spinX, spinY)

    // 조준 상태
    this.aimAngleDeg = 0;
    this.shotPower = 0.5;   // 0~1
    this.spinX = 0;
    this.spinY = 0;

    // pull-back 드래그
    this._drag = null;       // { startX, startY, cueBallScreenX, cueBallScreenY }
    this._isPullingBack = false;
    this._pullDist = 0;

    // 당점 위젯
    this.spinWidget = null;  // { cx, cy, r } — layout 시 설정
    this._spinDragging = false;

    // 파워 슬라이더
    this.slider = null;      // { x, y, w, h }

    this._animFrameId = null;
    this._animFrames = null;
    this._animIdx = 0;
    this._animBalls = null;

    this._bindEvents();
  }

  // ── 레이아웃 ────────────────────────────────────────────
  layout() {
    const W = this.canvas.width, H = this.canvas.height;
    const game = this.game;

    // 테이블 비율 유지
    const tableAspect = game.tableW / game.tableH;
    let tW, tH, tX, tY;
    const headerH = 60, footerH = 120;
    const availW = W, availH = H - headerH - footerH;

    if (availW / availH > tableAspect) {
      tH = availH;
      tW = tH * tableAspect;
    } else {
      tW = availW;
      tH = tW / tableAspect;
    }
    tX = (W - tW) / 2;
    tY = headerH + (availH - tH) / 2;

    this.tableRect = { x: tX, y: tY, w: tW, h: tH };
    this.scale = tW / game.tableW; // mm → px

    // 당점 위젯 (좌하단)
    const wR = Math.min(50, footerH * 0.45);
    this.spinWidget = { cx: wR + 10, cy: H - wR - 10, r: wR };

    // 파워 슬라이더
    const slX = this.spinWidget.cx * 2 + 20;
    const slW = W - slX - 20;
    this.slider = { x: slX, y: H - footerH * 0.5 - 6, w: slW, h: 12 };
  }

  // ── mm → screen ─────────────────────────────────────────
  toScreen(x, y) {
    const { x: tx, y: ty } = this.tableRect;
    return [tx + x * this.scale, ty + y * this.scale];
  }
  fromScreen(sx, sy) {
    const { x: tx, y: ty } = this.tableRect;
    return [(sx - tx) / this.scale, (sy - ty) / this.scale];
  }

  // ── 이벤트 바인딩 ───────────────────────────────────────
  _bindEvents() {
    const el = this.canvas;
    const onDown = e => this._onDown(e);
    const onMove = e => this._onMove(e);
    const onUp = e => this._onUp(e);

    el.addEventListener('mousedown', onDown);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseup', onUp);
    el.addEventListener('touchstart', e => { e.preventDefault(); onDown(e.touches[0]); }, { passive: false });
    el.addEventListener('touchmove', e => { e.preventDefault(); onMove(e.touches[0]); }, { passive: false });
    el.addEventListener('touchend', e => { e.preventDefault(); onUp(e.changedTouches[0]); }, { passive: false });
  }

  _getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const sy = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    return { sx, sy };
  }

  _onDown(e) {
    if (this.game.phase !== 'aiming') return;
    const { sx, sy } = this._getPos(e);

    // 당점 위젯 체크
    const sw = this.spinWidget;
    const dSpinX = sx - sw.cx, dSpinY = sy - sw.cy;
    if (Math.sqrt(dSpinX * dSpinX + dSpinY * dSpinY) < sw.r + 10) {
      this._spinDragging = true;
      this._updateSpin(sx, sy);
      return;
    }

    // 파워 슬라이더 체크
    const sl = this.slider;
    if (sy > sl.y - 15 && sy < sl.y + sl.h + 15 && sx > sl.x && sx < sl.x + sl.w) {
      this._sliderDragging = true;
      this._updateSlider(sx);
      return;
    }

    // 테이블 드래그 → 조준 또는 pull-back
    const cueBall = this.game.balls.find(b => b.id === 0);
    if (!cueBall) return;
    const [cbsx, cbsy] = this.toScreen(cueBall.x, cueBall.y);

    const distToCue = Math.sqrt((sx - cbsx) ** 2 + (sy - cbsy) ** 2);
    if (distToCue < 40 * this.scale + 20) {
      // pull-back 시작
      this._isPullingBack = true;
    }
    this._drag = { startX: sx, startY: sy, cueBallScreenX: cbsx, cueBallScreenY: cbsy };
  }

  _onMove(e) {
    const { sx, sy } = this._getPos(e);

    if (this._spinDragging) {
      this._updateSpin(sx, sy);
      return;
    }
    if (this._sliderDragging) {
      this._updateSlider(sx);
      return;
    }

    if (!this._drag) return;

    const dx = sx - this._drag.cueBallScreenX;
    const dy = sy - this._drag.cueBallScreenY;

    if (this._isPullingBack) {
      // pull-back: 거리 → 파워
      this._pullDist = Math.sqrt(dx * dx + dy * dy);
      this.shotPower = Math.min(1, this._pullDist / 150);
      // pull 방향 = 조준 반대 → 방향은 역방향
      this.aimAngleDeg = (Math.atan2(-dy, -dx) * 180 / Math.PI + 360) % 360;
    } else {
      // 조준 드래그
      this.aimAngleDeg = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    }
  }

  _onUp(e) {
    const wasPullingBack = this._isPullingBack;
    const wasDrag = !!this._drag;

    this._spinDragging = false;
    this._sliderDragging = false;
    this._drag = null;
    this._isPullingBack = false;
    this._pullDist = 0;

    if (wasPullingBack && wasDrag && this.game.phase === 'aiming') {
      // pull-back 놓으면 샷
      this._fireShot();
    }
  }

  _updateSpin(sx, sy) {
    const sw = this.spinWidget;
    const dx = (sx - sw.cx) / sw.r;
    const dy = (sy - sw.cy) / sw.r;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len <= 1.0) {
      this.spinX = dx;
      this.spinY = -dy; // y축 반전 (화면 아래 = draw)
    }
  }

  _updateSlider(sx) {
    const sl = this.slider;
    this.shotPower = Math.max(0, Math.min(1, (sx - sl.x) / sl.w));
  }

  _fireShot() {
    const MAX_POWER_MM_S = 6000;
    const power = this.shotPower * MAX_POWER_MM_S;
    if (power < 50) return; // 너무 약한 샷 무시

    const result = this.game.shoot(this.aimAngleDeg, power, this.spinX, this.spinY);
    if (!result) return;

    // 애니메이션 재생
    this._playAnimation(result.frames, () => {
      if (this.onShot) this.onShot(result);
    });
  }

  // ── 애니메이션 ──────────────────────────────────────────
  _playAnimation(frames, onDone) {
    this._animFrames = frames;
    this._animIdx = 0;

    const step = () => {
      if (this._animIdx >= this._animFrames.length) {
        this._animFrames = null;
        if (onDone) onDone();
        this.draw();
        return;
      }
      this._animBalls = this._animFrames[this._animIdx].balls;
      this._animIdx++;
      this.draw(this._animBalls);
      this._animFrameId = requestAnimationFrame(step);
    };
    step();
  }

  // ── 드로잉 ──────────────────────────────────────────────
  draw(overrideBalls) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    this.drawTable();
    const balls = overrideBalls || this.game.balls;
    this.drawBalls(balls);

    if (this.game.phase === 'aiming' && !overrideBalls) {
      this.drawAimLine(balls);
      this.drawGhostBall(balls);
    }

    this.drawSpinWidget();
    this.drawPowerSlider();
    this.drawHUD();
  }

  drawTable() {
    const ctx = this.ctx;
    const { x, y, w, h } = this.tableRect;
    // 테이블 펠트
    ctx.fillStyle = '#2d7a2d';
    ctx.fillRect(x, y, w, h);
    // 쿠션 테두리
    ctx.strokeStyle = '#1a4d1a';
    ctx.lineWidth = Math.max(3, w * 0.015);
    ctx.strokeRect(x, y, w, h);
    // 중앙선
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.stroke();
  }

  drawBalls(balls) {
    const ctx = this.ctx;
    const r = this.game.ballRadius * this.scale;
    const colors = this.game.cfg.ballColors;

    for (const b of balls) {
      const [sx, sy] = this.toScreen(b.x, b.y);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = colors[b.id] || 'gray';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // id 텍스트 (디버그)
      // ctx.fillStyle = '#000'; ctx.font = '10px sans-serif'; ctx.fillText(b.id, sx-4, sy+4);
    }
  }

  drawAimLine(balls) {
    const ctx = this.ctx;
    const cue = balls.find(b => b.id === 0);
    if (!cue) return;
    const [sx, sy] = this.toScreen(cue.x, cue.y);
    const rad = this.aimAngleDeg * Math.PI / 180;
    const len = 120;

    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(rad) * len, sy + Math.sin(rad) * len);
    ctx.stroke();
    ctx.restore();
  }

  drawGhostBall(balls) {
    // 첫 번째 적구 방향으로 ghost ball 표시
    const ctx = this.ctx;
    const cue = balls.find(b => b.id === 0);
    const target = balls.find(b => b.id === 1);
    if (!cue || !target) return;

    const r = this.game.ballRadius * this.scale;
    const rad = this.aimAngleDeg * Math.PI / 180;
    const [tsx, tsy] = this.toScreen(target.x, target.y);
    const [csx, csy] = this.toScreen(cue.x, cue.y);

    // ghost ball 위치: 조준선과 타겟 중심 사이 가장 가까운 점 계산
    // 단순화: 조준선 위 타겟 반사점
    const dx = Math.cos(rad), dy = Math.sin(rad);
    const t = (tsx - csx) * dx + (tsy - csy) * dy;
    const gx = csx + dx * t - r * 2 * dx;
    const gy = csy + dy * t - r * 2 * dy;

    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(gx, gy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.restore();
  }

  drawSpinWidget() {
    const ctx = this.ctx;
    const { cx, cy, r } = this.spinWidget;
    const isMiscue = Math.sqrt(this.spinX ** 2 + this.spinY ** 2) > 0.5;

    // 배경
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30,30,30,0.85)';
    ctx.fill();
    ctx.strokeStyle = isMiscue ? '#ff4444' : '#888';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 중심점
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // 당점 표시
    const dotX = cx + this.spinX * r * 0.85;
    const dotY = cy - this.spinY * r * 0.85;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
    ctx.fillStyle = isMiscue ? '#ff4444' : '#ffdd00';
    ctx.fill();

    // 레이블
    ctx.fillStyle = '#aaa';
    ctx.font = `${Math.max(9, r * 0.22)}px sans-serif`;
    ctx.textAlign = 'center';
    const spinLabel = this._spinLabel();
    ctx.fillText(spinLabel, cx, cy + r + 14);
  }

  _spinLabel() {
    const { spinX: x, spinY: y } = this;
    const labels = [];
    if (y > 0.25) labels.push('밀어');
    else if (y < -0.25) labels.push('끌어');
    if (x > 0.25) labels.push('우회전');
    else if (x < -0.25) labels.push('좌회전');
    return labels.join(' ') || '센터';
  }

  drawPowerSlider() {
    const ctx = this.ctx;
    const { x, y, w, h } = this.slider;

    // 트랙
    ctx.fillStyle = 'rgba(50,50,50,0.8)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();

    // 채움
    ctx.fillStyle = `hsl(${120 - this.shotPower * 120}, 90%, 50%)`;
    ctx.beginPath();
    ctx.roundRect(x, y, w * this.shotPower, h, h / 2);
    ctx.fill();

    // 레이블
    ctx.fillStyle = '#ccc';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`파워 ${Math.round(this.shotPower * 100)}%`, x, y - 6);
  }

  drawHUD() {
    const ctx = this.ctx;
    const game = this.game;
    const W = this.canvas.width;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, 55);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${game.cfg.label}`, 12, 22);

    ctx.font = '13px sans-serif';
    ctx.fillText(`이닝: ${game.inning}`, 12, 42);

    // 점수
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px sans-serif';
    const p = game.currentPlayer;
    ctx.fillStyle = p === 0 ? '#ffdd00' : '#fff';
    ctx.fillText(`P1: ${game.scores[0]}`, W / 2 - 60, 32);
    ctx.fillStyle = p === 1 ? '#ffdd00' : '#fff';
    ctx.fillText(`P2: ${game.scores[1]}`, W / 2 + 60, 32);

    // 결과 표시
    if (game.phase === 'result' && game.lastResult) {
      const r = game.lastResult;
      ctx.fillStyle = r.score > 0 ? '#44ff44' : '#ff4444';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(r.score > 0 ? '득점!' : (r.foul ? '파울' : '실패'), W / 2, this.tableRect.y + this.tableRect.h / 2);
      ctx.fillStyle = '#fff';
      ctx.font = '14px sans-serif';
      ctx.fillText(`쿠션: ${r.cushionCount}  맞힌 공: [${r.hitIds.join(',')}]`, W / 2, this.tableRect.y + this.tableRect.h / 2 + 30);
    }
  }

  resize() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth || window.innerWidth;
    this.canvas.height = container.clientHeight || window.innerHeight;
    this.layout();
    this.draw();
  }
}

if (typeof window !== 'undefined') window.BilliardsUI = BilliardsUI;

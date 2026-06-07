'use strict';
// game.js — 게임 상태 관리, 룰 판정

const MODES = {
  '3ball': {
    label: '3구 대대',
    tableW: PHYSICS.TABLE_W_LARGE,
    tableH: PHYSICS.TABLE_H_LARGE,
    ballRadius: PHYSICS.BALL_RADIUS_LARGE,
    ballColors: ['#e8c800', 'white', 'red'], // id0=수구(노랑), id1=흰(적), id2=빨강(적)
    // 쓰리쿠션 초구: 빨강=화면 위(원거리 foot spot), 노랑 수구·흰=화면 아래(head 쪽)
    // 회전렌더에서 작은 x = 화면 위 → 빨강 x작게, 수구/흰 x크게
    initialPositions(tw, th) {
      const cy = th / 2;
      return [
        { id: 0, x: tw * 0.75, y: cy + th * 0.13, vx: 0, vy: 0, spinX: 0, spinY: 0 }, // 노랑 수구(아래)
        { id: 1, x: tw * 0.75, y: cy,             vx: 0, vy: 0, spinX: 0, spinY: 0 }, // 흰 head spot(아래)
        { id: 2, x: tw * 0.25, y: cy,             vx: 0, vy: 0, spinX: 0, spinY: 0 }, // 빨강 foot spot(위)
      ];
    },
  },
  '4ball': {
    label: '4구 중대',
    tableW: PHYSICS.TABLE_W_MEDIUM,
    tableH: PHYSICS.TABLE_H_MEDIUM,
    ballRadius: PHYSICS.BALL_RADIUS_MEDIUM,
    // id: 0=수구(흰), 1=빨강1, 2=빨강2, 3=상대수구(노랑)
    ballColors: ['white', 'red', 'red', '#e8e800'],
    initialPositions(tw, th) {
      const cx = tw / 2, cy = th / 2;
      return [
        { id: 0, x: cx - tw * 0.25, y: cy, vx: 0, vy: 0, spinX: 0, spinY: 0 },
        { id: 1, x: cx, y: cy - th * 0.2, vx: 0, vy: 0, spinX: 0, spinY: 0 },
        { id: 2, x: cx, y: cy + th * 0.2, vx: 0, vy: 0, spinX: 0, spinY: 0 },
        { id: 3, x: cx + tw * 0.25, y: cy, vx: 0, vy: 0, spinX: 0, spinY: 0 },
      ];
    },
  },
};

class GameState {
  constructor(mode = '3ball') {
    this.mode = mode;
    this.scores = [0, 0];   // [player0, player1]
    this.currentPlayer = 0;
    this.inning = 1;
    this.phase = 'aiming'; // 'aiming' | 'simulating' | 'result'
    this.lastResult = null; // { score, foul, cushionCount, hitIds }
    this.simResult = null;  // 마지막 simulate() 반환값
    this.cfg = MODES[mode];
    this.balls = this.cfg.initialPositions(this.cfg.tableW, this.cfg.tableH);
    this.shotPower = 0.5;   // 0~1
    this.shotAngle = 0;     // radians
    this.spinX = 0;
    this.spinY = 0;
  }

  get tableW() { return this.cfg.tableW; }
  get tableH() { return this.cfg.tableH; }
  get ballRadius() { return this.cfg.ballRadius; }

  /** 발사. 수구(id=0)에 속도 부여 */
  shoot(angleDeg, powerMmPerSec, spinX, spinY) {
    if (this.phase !== 'aiming') return null;

    const rad = angleDeg * Math.PI / 180;
    const cueBall = this.balls.find(b => b.id === 0);
    if (!cueBall) return null;

    // 미스큐 체크 (ui.js MAX_SPIN=0.7 과 일치, 약간 여유)
    if (Math.sqrt(spinX * spinX + spinY * spinY) > 0.72) {
      console.warn('미스큐!');
      return null;
    }

    // 되돌리기용 스냅샷 (샷 직전 상태)
    this._snapshot = {
      balls: this.balls.map(b => ({ ...b })),
      scores: [...this.scores],
      currentPlayer: this.currentPlayer,
      inning: this.inning,
    };

    const shotBalls = this.balls.map(b => {
      if (b.id === 0) {
        return { ...b, vx: Math.cos(rad) * powerMmPerSec, vy: Math.sin(rad) * powerMmPerSec, spinX, spinY };
      }
      return { ...b, vx: 0, vy: 0 };
    });

    const shot = {
      mode: this.mode,
      tableW: this.tableW,
      tableH: this.tableH,
      ballRadius: this.ballRadius,
      balls: shotBalls,
    };

    this.phase = 'simulating';
    const result = simulate(shot);
    this.simResult = result;

    // 공 최종 위치 반영
    const lastFrame = result.frames[result.frames.length - 1];
    this.balls = lastFrame.balls.map(b => ({ ...b, vx: 0, vy: 0 }));

    this.lastResult = {
      score: result.score,
      foul: result.foul,
      cushionCount: result.cushionCount,
      hitIds: result.hitIds,
    };

    this.phase = 'result';
    return result;
  }

  /** 결과 처리 후 다음 턴 */
  nextTurn() {
    if (this.phase !== 'result') return;
    const r = this.lastResult;

    if (r && r.score > 0) {
      this.scores[this.currentPlayer] += r.score;
      // 성공 시 연속 → 같은 플레이어 유지
    } else {
      // 실패 시 턴 교체
      this.currentPlayer = 1 - this.currentPlayer;
      this.inning++;
    }

    // 4구 파울 처리 (감점 옵션)
    if (this.mode === '4ball' && r && r.foul) {
      this.scores[this.currentPlayer] = Math.max(0, this.scores[this.currentPlayer] - 1);
    }

    this.phase = 'aiming';
    this.lastResult = null;
    this.simResult = null;
  }

  /** 직전 샷 되돌리기 (1단계). 성공 시 true */
  undo() {
    if (!this._snapshot) return false;
    const s = this._snapshot;
    this.balls = s.balls.map(b => ({ ...b }));
    this.scores = [...s.scores];
    this.currentPlayer = s.currentPlayer;
    this.inning = s.inning;
    this.phase = 'aiming';
    this.lastResult = null;
    this.simResult = null;
    this._snapshot = null;   // 한 단계만
    return true;
  }

  canUndo() { return !!this._snapshot; }

  reset() {
    const newState = new GameState(this.mode);
    Object.assign(this, newState);
  }

  switchMode(mode) {
    this.mode = mode;
    this.cfg = MODES[mode];
    this.reset();
  }
}

if (typeof window !== 'undefined') window.GameState = GameState;

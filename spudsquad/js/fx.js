(function (root) {
  'use strict';
  const P = root.SPUD = root.SPUD || {};
  const readShake = () => { try { return localStorage.getItem('spud_shake') !== 'false'; } catch { return true; } };
  class Effects {
    constructor() {
      this.particles = [];
      this.flashes = new Map();
      this.motions = new Map();
      this.trails = [];
      this.shake = 0;
      this.shakeOn = readShake();
      this.stopUntil = 0;
      this.stopTimes = [];
      this.slowUntil = 0;
    }
    toggleShake() {
      this.shakeOn = !this.shakeOn;
      localStorage.setItem('spud_shake', String(this.shakeOn));
      return this.shakeOn;
    }
    hitstop(now) {
      this.stopTimes = this.stopTimes.filter(t => now - t < 1000);
      if (this.stopTimes.length < 4) {
        this.stopTimes.push(now);
        this.stopUntil = now + 40;
      }
    }
    add(events, uid) {
      const now = performance.now();
      for (const ev of events || []) {
        const [type, a, b, d, e] = ev;
        if (type === 'hit') {
          const existing = this.particles.find(v => v.text && v.eid === ev[5] && now - v.at < 100);
          if (existing) {
            existing.amount += d;
            existing.text = String(existing.amount) + (existing.crit ? '!' : '');
            existing.at = now;
          } else this.particles.push({ x: a, y: b, eid: ev[5], at: now,
            amount: d, text: String(d) + (e ? '!' : ''), crit: e, element: ev[6],
            vx: (Math.random() - .5) * 55, vy: -50, life: .6, maxLife: .6 });
          this.flashes.set(ev[5], now + 80);
          if (e) this.hitstop(now);
          P.sfx?.(e ? 'crit' : 'hit');
        }
        if (type === 'die') {
          this.hitstop(now);
          P.sfx?.('kill');
          for (let i = 0; i < 8 + Math.floor(Math.random() * 7); i++) {
            const angle = Math.random() * Math.PI * 2;
            this.particles.push({ x: a, y: b, vx: Math.cos(angle) * (60 + Math.random() * 130),
              vy: Math.sin(angle) * (60 + Math.random() * 130), life: .35, maxLife: .35,
              size: 3 + Math.random() * 5, color: ev[4] || '#a5d65f' });
          }
          this.particles.push({ x: a, y: b, vx: 40, vy: -115, life: .25,
            maxLife: .25, size: 8, material: true });
          if (d === 'boss_1' || d === 'boss_2') {
            this.slowUntil = now + 400;
            this.flashScreen = now + 140;
            this.shake = this.shakeOn ? 16 : 0;
            P.sfx?.('boom');
          }
        }
        if (type === 'sh') {
          const weapon = P.data.weapons[b];
          P.sfx?.(weapon?.behavior === 'beam' || weapon?.behavior === 'chain' ? 'laser'
            : weapon?.behavior === 'projectile' ? 'shot' : 'swing');
          this.motions.set(`${a}:${ev[7] || 0}`, { at: now, angle: ev[6], action: weapon?.behavior });
        }
        if (type === 'sw') this.motions.set(`${a}:${b}`, { at: now, angle: d, action: e });
        if (type === 'bm') this.trails.push({ x1: a, y1: b, x2: d, y2: e, kind: ev[5], until: now + 120 });
        if (type === 'ex') {
          this.trails.push({ x: a, y: b, r: d, kind: 'ring', until: now + 220 });
          if (ev[4] === uid && this.shakeOn) this.shake = Math.max(this.shake, 6);
          P.sfx?.('boom');
        }
        if (type === 'hurt') {
          this.flashes.set(a, now + 100);
          if (a === uid && this.shakeOn) this.shake = 8;
          P.sfx?.('hurt');
        }
        if (type === 'boss' && this.shakeOn) { this.shake = 16; P.sfx?.('wave'); }
        if (type === 'crp' && a === uid) P.sfx?.('pick');
        if (type === 'lvl' && a === uid) P.sfx?.('lvl');
        if (type === 'bt') this.flashes.set(a, now + 500);
      }
    }
    draw(c, dt, now) {
      for (const v of this.trails.slice()) {
        c.save();
        c.globalAlpha = Math.max(0, (v.until - now) / 220);
        c.strokeStyle = v.kind === 'ring' ? '#fff3b2' : '#e8f9ff';
        c.lineWidth = v.kind === 'ring' ? 4 : 7;
        c.beginPath();
        if (v.kind === 'ring') c.arc(v.x, v.y, v.r * (1 - c.globalAlpha * .4), 0, 7);
        else { c.moveTo(v.x1, v.y1); c.lineTo(v.x2, v.y2); }
        c.stroke(); c.restore();
        if (now > v.until) this.trails.splice(this.trails.indexOf(v), 1);
      }
      for (const v of this.particles.slice()) {
        v.life -= dt;
        v.x += (v.vx || 0) * dt;
        v.y += (v.vy || 0) * dt;
        if (v.material) v.vy += 900 * dt;
        c.save(); c.globalAlpha = Math.max(0, v.life / v.maxLife);
        if (v.text) {
          c.font = `bold ${v.crit ? 25 : 17}px Jua, sans-serif`;
          c.lineWidth = 3; c.strokeStyle = '#503324'; c.strokeText(v.text, v.x, v.y);
          c.fillStyle = v.crit ? '#ffed34' : v.element === 'fire' ? '#ff9a47'
            : v.element ? '#a8edff' : '#fff';
          c.fillText(v.text, v.x, v.y);
        } else {
          c.fillStyle = v.material ? '#9bf46f' : v.color;
          c.fillRect(v.x, v.y, v.size, v.size);
        }
        c.restore();
        if (v.life <= 0) this.particles.splice(this.particles.indexOf(v), 1);
      }
    }
  }
  P.fx = { Effects };
})(window);

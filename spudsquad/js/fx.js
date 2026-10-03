(function (root) {
  'use strict';
  const P = root.SPUD = root.SPUD || {};
  // One immutable, bounded line geometry per character; no filters/emitters.
  const MAX_ULT_FX = 4;
  const ultStyles = Object.freeze(Object.fromEntries([
    ['basic', '#a8edff', 8, 'shock'], ['muscle', '#ff9966', 4, 'slam'],
    ['science', '#80dfff', 6, 'beam'], ['lucky', '#ffe76a', 5, 'star'],
    ['gunslinger', '#ffc58a', 6, 'beam'], ['berserker', '#ff6565', 10, 'shock'],
    ['vampire', '#ed7398', 8, 'absorb'], ['bomber', '#ffad42', 12, 'shock'],
    ['cyclops', '#d3a5ff', 1, 'beam'], ['ghost', '#a0ffd8', 6, 'veil'],
    ['saver', '#ffd950', 4, 'star'], ['thorn', '#9dde6e', 14, 'star'],
    ['soldier', '#edcb84', 9, 'beam'], ['loud', '#fc94e7', 3, 'shock'],
    ['mutant', '#9effa0', 7, 'absorb']
  ].map(([id, color, n, shape]) => [id, Object.freeze({ color, shape,
    points: Object.freeze(Array.from({ length: n }, (_, i) => Object.freeze([
      Math.cos(i * Math.PI * 2 / n), Math.sin(i * Math.PI * 2 / n)
    ]))) })])));
  const readShake = () => { try { return localStorage.getItem('spud_shake') !== 'false'; } catch { return true; } };
  class Effects {
    constructor() {
      this.particles = [];
      this.flashes = new Map();
      this.motions = new Map();
      this.trails = [];
      this.corpses = [];
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
            existing.text = String(Math.round(existing.amount)) + (existing.crit ? '!' : '');
            existing.at = now;
          } else this.particles.push({ x: a, y: b, eid: ev[5], at: now,
            amount: d, text: String(Math.round(d)) + (e ? '!' : ''), crit: e, element: ev[6],
            vx: (Math.random() - .5) * 55, vy: -50, life: .6, maxLife: .6 });
          this.flashes.set(ev[5], now + 80);
          if (e) this.hitstop(now);
          for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i++) {
            this.particles.push({ x: a, y: b, vx: (Math.random() - .5) * 200,
              vy: (Math.random() - .5) * 200, life: .13, maxLife: .13,
              size: 2 + Math.random() * 2, color: '#fff3c0' });
          }
          P.sfx?.(e ? 'crit' : 'hit');
        }
        if (type === 'die') {
          this.corpses.push({ x: a, y: b, type: d, until: now + 120 });
          this.hitstop(now);
          P.sfx?.('kill');
          const colors = { blob: '#9ed45d', bug: '#f7bb44', exploder: '#ee8072',
            shielder: '#66cfca', boss_1: '#ac5c7c', boss_2: '#713f70' };
          for (let i = 0; i < 8 + Math.floor(Math.random() * 7); i++) {
            const angle = Math.random() * Math.PI * 2;
            this.particles.push({ x: a, y: b, vx: Math.cos(angle) * (60 + Math.random() * 130),
              vy: Math.sin(angle) * (60 + Math.random() * 130), life: .35, maxLife: .35,
              size: 3 + Math.random() * 5, color: colors[d] || '#a5d65f' });
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
          P.sfx?.('w:' + b);
          this.motions.set(`${a}:${ev[7] || 0}`, { at: now, angle: ev[6], action: weapon?.behavior,
            origin: { x: ev[4], y: ev[5] }, reach: ev[8] || 0 });
        }
        if (type === 'sw') this.motions.set(`${a}:${b}`, { at: now, angle: d, action: e,
          origin: { x: ev[5], y: ev[6] }, reach: ev[7] || 0 });
        if (type === 'bm') this.trails.push({ x1: a, y1: b, x2: d, y2: e, kind: ev[5], tier: ev[6] || 1, until: now + 120 });
        if (type === 'ult' && ultStyles[e]) {
          // Four simultaneous casts is the multiplayer ceiling. Preserve other FX.
          const casts = this.trails.filter(v => v.kind === 'ult');
          if (casts.length >= MAX_ULT_FX) this.trails.splice(this.trails.indexOf(casts[0]), 1);
          this.trails.push({ x: a, y: b, r: d, kind: 'ult', style: ultStyles[e],
            uid: ev[5], at: now, duration: Math.max(750, (P.data.ults?.[e]?.duration || 0) * 1000),
            until: now + Math.max(750, (P.data.ults?.[e]?.duration || 0) * 1000) });
        }
        if (type === 'va') this.trails.push({ x: a, y: b, r: d, kind: 'ring', color: '#ed7398', until: now + 220 });
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
        if (type === 'crp' && a === uid) P.sfx?.('crate');
        if (type === 'lvl' && a === uid) P.sfx?.('lvl');
        if (type === 'bt') this.flashes.set(a, now + 500);
      }
    }
    draw(c, dt, now) {
      for (const v of this.trails.slice()) {
        if (v.kind === 'ult') {
          if (now >= v.until) { this.trails.splice(this.trails.indexOf(v), 1); continue; }
          const t = Math.max(0, (now - v.at) / v.duration), style = v.style;
          const scale = style.shape === 'absorb' ? 1 - .75 * t : .25 + .75 * Math.min(1, t * 2);
          c.save(); c.globalAlpha = Math.min(1, t * 8) * Math.min(1, (1 - t) * 3);
          c.strokeStyle = style.color; c.lineWidth = t < .2 ? 6 : 3;
          c.beginPath(); c.arc(v.x, v.y, v.r * scale, 0, Math.PI * 2); c.stroke();
          c.beginPath();
          for (const [x, y] of style.points) {
            const inner = style.shape === 'beam' ? .08 : style.shape === 'star' ? .55 : .8;
            c.moveTo(v.x + x * v.r * scale * inner, v.y + y * v.r * scale * inner);
            c.lineTo(v.x + x * v.r * scale, v.y + y * v.r * scale);
          }
          c.stroke();
          if (style.shape === 'shock' || style.shape === 'veil') {
            c.beginPath(); c.arc(v.x, v.y, v.r * scale * .65, 0, Math.PI * 2); c.stroke();
          }
          c.restore(); continue;
        }
        c.save();
        c.globalAlpha = Math.max(0, (v.until - now) / 220);
        c.strokeStyle = v.color || (v.kind === 'ring' ? '#fff3b2' : v.kind === 'beam'
          ? ['#e8f9ff', '#69b7ff', '#c18aff', '#ffd35a', '#ff704d', '#4debd9'][Math.max(1, Math.min(P.data.MAX_WEAPON_TIER || 6, v.tier)) - 1] : '#e8f9ff');
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
  P.fx = { Effects, MAX_ULT_FX };
})(window);

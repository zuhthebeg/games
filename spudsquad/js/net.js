(function (root) {
  'use strict';
  const S = root.SPUD?.sim || (typeof require === 'function' ? require('./sim.js') : null);
  function encode(w) {
    return {
      t: 's', k: w.tick, tm: Math.round(w.tm * 10) / 10,
      e: w.enemies.map(v => [v.id, v.type, Math.round(v.x), Math.round(v.y),
        Math.max(0, Math.round(v.hp / v.maxHp * 100)),
        (v.status?.burn ? 1 : 0) | (v.status?.bleed ? 2 : 0) |
        (w.enemies.some(other => other !== v && other.type === 'shielder' &&
          Math.hypot(other.x - v.x, other.y - v.y) <= 140) ? 4 : 0) |
        (v.flash > 0 ? 8 : 0) |
        (v.type !== 'buffer' && w.enemies.some(other => other.type === 'buffer' &&
          Math.hypot(other.x - v.x, other.y - v.y) <= 160) ? 16 : 0) |
        (v.type === 'egg' && (v.age || 0) >= 4 ? 32 : 0)]),
      d: w.drops.map(v => [v.id, Math.round(v.x), Math.round(v.y)]),
      cr: w.crates.map(v => [v.id, Math.round(v.x), Math.round(v.y)]),
      pl: Object.values(w.players).map(v => [v.uid, Math.round(v.x), Math.round(v.y),
        Math.round(v.hp * 10) / 10, v.maxHp, v.alive, v.mats, v.xp, v.lvl]),
      fx: w.fx.splice(0)
    };
  }
  function decode(packet) { return packet?.t === 's' ? packet : null; }
  class Buffer {
    constructor() { this.a = []; }
    push(s, at) {
      if (!decode(s) || this.a.length && s.k <= this.a[this.a.length - 1].s.k) return;
      this.a.push({ s, at });
      if (this.a.length > 2) this.a.shift();
    }
    sample(now) {
      if (!this.a.length) return null;
      const last = this.a[this.a.length - 1], first = this.a[0];
      if (first === last) return last.s;
      const alpha = Math.max(0, Math.min(1, (now - 100 - first.at) / (last.at - first.at || 1)));
      const enemies = last.s.e.map(row => {
        const old = first.s.e.find(v => v[0] === row[0]);
        return old ? [row[0], row[1], Math.round(old[2] + (row[2] - old[2]) * alpha),
          Math.round(old[3] + (row[3] - old[3]) * alpha), ...row.slice(4)] : row;
      });
      const players = last.s.pl.map(row => {
        const old = first.s.pl.find(v => v[0] === row[0]);
        return old ? [row[0], Math.round(old[1] + (row[1] - old[1]) * alpha),
          Math.round(old[2] + (row[2] - old[2]) * alpha), ...row.slice(3)] : row;
      });
      return { ...last.s, e: enemies, pl: players };
    }
  }
  class Session {
    constructor({ uid, host, sendAction = () => {}, sendRt = () => {}, onAction = () => {},
      onSnapshot = () => {}, onEnd = () => {}, rng = Math.random }) {
      Object.assign(this, { uid, host, sendAction, sendRt, onAction, onSnapshot, onEnd, rng });
      this.isHost = uid === host;
      this.players = {};
      this.ready = new Set();
      this.buffer = new Buffer();
      this.lastSeq = new Set();
      this.world = null;
      this.wave = 0;
      this.pick = {};
      this.tickAccumulator = 0;
      this.netAccumulator = 0;
      this.posAccumulator = 0;
      this.selectionDeadline = 0;
      this.shopDeadline = 0;
      this.lastPlayers = {};
    }
    local(action) {
      if (this.isHost && action.type === 'PICK') this.pick[action.payload.uid] = action.payload.char;
      this.sendAction(action);
      if (!this.sendAction.echo) this.receive(action);
    }
    receive(a, seq) {
      if (!a?.type) return;
      if (seq != null) {
        if (this.lastSeq.has(seq)) return;
        this.lastSeq.add(seq);
      }
      const p = a.payload || {};
      if (a.type === 'PICK') {
        this.pick[p.uid] = p.char;
        if (this.isHost && Object.keys(this.pick).length >= Object.keys(this.players).length) this.start(1);
      } else if (a.type === 'WAVE_START') {
        this.lastPlayers = p.players || {};
        this.wave = p.w;
        this.ready.clear();
        this.world = this.isHost ? S.createWorld({ wave: p.w, players: p.players, rng: this.rng }) : null;
        this.onAction(a);
      } else if (a.type === 'WAVE_END') {
        this.shopDeadline = 45;
        this.onAction(a);
      } else if (a.type === 'READY') {
        this.ready.add(p.uid);
        if (this.isHost) {
          if (this.world?.players[p.uid]) {
            const player = this.world.players[p.uid], loadout = p.loadout || {};
            player.weapons = (loadout.weapons || player.weapons).slice(0, S.capacity(player));
            player.items = loadout.items || player.items;
            player.stats = loadout.stats || player.stats;
            player.mats = loadout.mats ?? player.mats;
          }
          if (this.ready.size >= Object.keys(this.players).length) this.next();
        }
        this.onAction(a);
      } else if (a.type === 'GAME_OVER') {
        this.onEnd(p);
        this.onAction(a);
      }
    }
    start(wave) {
      if (!this.isHost) return;
      const players = {};
      for (const uid of Object.keys(this.players)) {
        const prev = this.world?.players[uid];
        players[uid] = prev ? {
          char: prev.char, weapons: prev.weapons, items: prev.items,
          stats: prev.stats, mats: prev.mats, xp: prev.xp, lvl: prev.lvl
        } : { char: this.pick[uid] || 'basic' };
      }
      const payload = { w: wave, seed: Math.floor(this.rng() * 2 ** 31), players };
      this.local({ type: 'WAVE_START', payload, __snapshot: payload });
    }
    next() { this.start(this.wave + 1); }
    roster(data) {
      this.players = Object.fromEntries((data.players || []).map(p => [
        typeof p === 'string' ? p : p.user || p.uid, p
      ]));
      if (data.hostUser) this.host = data.hostUser;
      if (this.isHost && this.world) {
        for (const uid of Object.keys(this.world.players)) {
          if (!this.players[uid]) delete this.world.players[uid];
        }
        for (const uid of Object.keys(this.players)) {
          if (!this.world.players[uid] && this.lastPlayers[uid]) {
            this.world.players[uid] = S.createPlayer(uid, this.lastPlayers[uid].char, this.lastPlayers[uid]);
          }
        }
      }
    }
    rt(from, data, now = Date.now()) {
      if (data.t === 'p' && this.isHost && this.world) {
        S.applyInput(this.world, from, data.x, data.y, data.f);
      } else if (data.t === 's' && !this.isHost) {
        this.buffer.push(data, now);
        this.onSnapshot(data);
      }
    }
    update(dt, input) {
      dt = Math.min(.1, dt);
      if (this.world) {
        this.tickAccumulator = Math.min(this.tickAccumulator + dt, 5 / 30);
        while (this.tickAccumulator >= 1 / 30) {
          S.step(this.world, 1 / 30);
          this.tickAccumulator -= 1 / 30;
        }
        this.netAccumulator += dt;
        if (this.netAccumulator >= 1 / 12) {
          this.netAccumulator = 0;
          this.sendRt(encode(this.world));
        }
        if (this.world.ended && !this.world.reported) {
          this.world.reported = true;
          if (this.world.win || !Object.values(this.world.players).some(p => p.alive)) {
            const kills = {}, dmg = {};
            for (const p of Object.values(this.world.players)) {
              kills[p.uid] = p.kills;
              dmg[p.uid] = Math.round(p.totalDamage);
            }
            this.local({ type: 'GAME_OVER', payload: { win: this.world.win,
              wave: this.wave, kills, dmg }, __final: true });
          } else {
            const players = {};
            for (const p of Object.values(this.world.players)) {
              players[p.uid] = { mats: p.mats, xp: p.xp, lvl: p.lvl,
                levelUps: p.levelUps, crates: p.pendingCrates?.length || 0 };
            }
            this.local({ type: 'WAVE_END', payload: { w: this.wave, players } });
          }
        }
      } else if (input) {
        this.posAccumulator += dt;
        const moving = Math.abs(input.dx) + Math.abs(input.dy) > 0;
        input.move(dt);
        if (this.posAccumulator >= (moving ? 1 / 15 : 1 / 4)) {
          this.posAccumulator = 0;
          this.sendRt({ t: 'p', x: Math.round(input.x), y: Math.round(input.y), f: input.f });
        }
      }
    }
  }
  const api = { encode, decode, Buffer, Session };
  root.SPUD = root.SPUD || {};
  root.SPUD.net = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

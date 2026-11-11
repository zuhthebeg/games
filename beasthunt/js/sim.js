// Pure 60Hz combat rules. No renderer, clock, platform input or browser globals.
import { MONSTERS, WTYPES, ATK, ARMOR, DMG_SCALE, HR, TIME_LIMIT, MAX_CARTS, POTIONS, rollLoot } from './data.js';
export const FIXED_DT = 1 / 60;
// moveX/moveZ are camera-local signed 8-bit axes (-127..127); aimYaw is radians.
// light/heavy/dodge/potion/lock are one-tick press edges; held flags are levels.
export const neutralInput = () => ({ moveX: 0, moveZ: 0, aimYaw: 0, light: false, heavy: false, dodge: false, potion: false, lock: false, heavyHeld: false, sprint: false });
// Nearest living hunter; a damage contribution in the last 5 seconds reduces
// effective distance by 25%. Stable array order breaks exact ties.
export function selectTarget(players, monster, tick) {
  let best = null, score = Infinity;
  for (const p of players) { if (p.state === 'dead') continue;
    const d = Math.hypot(p.x - monster.x, p.z - monster.z) * (tick - p.lastDamageTick <= 300 ? .75 : 1);
    if (d < score) { best = p; score = d; }
  }
  return best;
}
export const R_ARENA = 42;
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };
const turn = (a, b, max) => { const d = angDiff(b, a); return a + clamp(d, -max, max); };
const ease = (k) => k * k * (3 - 2 * k);

// Monster attack timings: w=windup, a=active, r=recover; min/max = usable distance; ang = max |angle| to target.
const MA = {
  bite: { w: .55, a: .22, r: .75, min: 0, max: 6.2, ang: 1.1, dmg: 20, melee: 1 },
  sweep: { w: .8, a: .55, r: .9, min: 0, max: 7.5, ang: 9, dmg: 24, melee: 1 },
  stomp: { w: .9, a: .15, r: .95, min: 0, max: 8, ang: 1.6, dmg: 30, heavy: 1, melee: 1 },
  charge: { w: 1.0, a: 1.25, r: 1.0, min: 9, max: 36, ang: 9, dmg: 32, heavy: 1 },
  leap: { w: .75, a: .7, r: 1.0, min: 8, max: 28, ang: 9, dmg: 34, heavy: 1 },
  spit: { w: .7, a: .2, r: .85, min: 8, max: 38, ang: 9, dmg: 18 },
  fireball: { w: .8, a: .95, r: .9, min: 9, max: 42, ang: 9, dmg: 28, heavy: 1 },
  breath: { w: 1.0, a: 1.7, r: 1.0, min: 0, max: 13, ang: 1.0, dmg: 9, melee: 1 },
};

export class Sim {
  constructor(quest, save, seed = 1) {
    this.q = { ...quest }; this.def = MONSTERS[quest.mon]; this.hr = quest.hr ? HR : { hp: 1, dmg: 1, spd: 1 };
    const d = this.def, maxHp = 100 + ARMOR[save.armor - 1].hp;
    const player = { x: 0, z: -30, yaw: 0, hp: maxHp, maxHp, st: 100, stDelay: 0, state: 'idle', t: 0, inv: 0, walk: 0, moving: 0, potions: POTIONS, cur: null, hits: 0, combo: 0, mv: 1, kbx: 0, kbz: 0, clv: 0, healLeft: 0, spin: 0 };
    Object.assign(player, { id: 'p1', weapon: save.weapon, tier: save.w[save.weapon], armor: save.armor, lock: true, input: neutralInput(), buffer: {}, lastDamageTick: -100000, contribution: 0 });
    this.players = [player]; this.activeId = player.id;
    const mhp = Math.round(d.hp * this.hr.hp);
    this.m = { x: 0, z: 12, y: 0, yaw: PI, spin: 0, hp: mhp, maxHp: mhp, state: 'idle', t: 0, dur: 0, atk: null, ak: null, last: '', think: 1, enr: false, enrT: 0, enrStage: 0, rageQ: false, walk: 0, moving: 0, stag: 0, brk: { head: 0, tail: 0, legs: 0 }, broke: { head: false, tail: false }, legTh: d.brk.legs * this.hr.hp, flag: 0, hitP: false, fired: 0, tick: 0, fx: 0, fz: 0, tx: 0, tz: 0, roared: false };

    this.rng = seed >>> 0; this.tick = 0; this.nextEntity = 1; this.events = [];
    this.time = 0; this.carts = 0; this.over = false; this.win = false; this.endT = 0; this.ended = false;
    this.stop = 0; this.slow = 0; this.clock = 0; this.dmgDealt = 0; this.projs = []; this.arrows = []; this.cachedResult = null;
  }
  get p() { return this.players.find(p => p.id === this.activeId); }
  get wt() { return this.p.weapon; }
  get W() { return WTYPES[this.wt]; }
  get atk() { return ATK[this.p.tier - 1]; }
  get arm() { return ARMOR[this.p.armor - 1]; }
  get lock() { return this.p.lock; }
  set lock(value) { this.p.lock = value; }
  addPlayer(id, save) {
    if (this.players.some(p => p.id === id)) throw new Error('Duplicate player id');
    const other = new Sim(this.q, save, this.rng).players[0]; other.id = id;
    this.players.push(other); return other;
  }
  random() { this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0; return this.rng / 4294967296; }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  sound(name) { this.emit('sound', { name }); }
  toast(key, kind) { this.emit('toast', { key, kind }); }
  burst(...args) { this.emit('burst', { args }); }
  jet(...args) { this.emit('jet', { args }); }
  take(action) { const n = this.p.buffer[action]; if (n > 0) { this.p.buffer[action] = 0; return true; } return false; }
  // Drain once per step; events are transient presentation output, not replay state.
  drainEvents() { const events = this.events; this.events = []; return events; }
  step(inputs = {}) {
    this.tick++; this.clock += FIXED_DT;
    for (const p of this.players) {
      this.activeId = p.id;
      for (const k in p.buffer) p.buffer[k] = Math.max(0, p.buffer[k] - 1);
      p.input = { ...neutralInput(), ...inputs[p.id] };
      p.input.moveX = Math.round(clamp(p.input.moveX, -127, 127)); p.input.moveZ = Math.round(clamp(p.input.moveZ, -127, 127));
      for (const [edge, action] of [['light','attack'],['heavy','heavy'],['dodge','roll'],['potion','potion']]) if (p.input[edge]) p.buffer[action] = 16;
      if (p.input.lock) this.toggleLock();
    }
    let dt = FIXED_DT;
    if (this.stop > 0) { this.stop -= FIXED_DT; dt = 0; }
    else if (this.slow > 0) { this.slow -= FIXED_DT; dt *= .28; }
    if (dt > 0) {
      if (!this.over) { this.time += dt; if (this.time >= TIME_LIMIT) { this.toast('timeout','bad'); this.finish(false,2); } }
      for (const p of this.players) { this.activeId = p.id; this.updPlayer(dt); }
      this.updMon(dt); this.updProjs(dt);
    }
    if (this.over && !this.ended) { this.endT -= FIXED_DT; if (this.endT <= 0) { this.ended = true; this.emit('result', { result: this.result() }); } }
    return this.events;
  }
  // JSON copy includes PRNG, input buffers, ownership and pending result timing.
  // Restore at a tick boundary; previously delivered effects are not re-emitted.
  snapshot() {
    const out = {};
    for (const key of ['q','players','activeId','m','rng','tick','nextEntity','time','carts','over','win','endT','ended','stop','slow','clock','dmgDealt','projs','arrows','cachedResult']) out[key] = this[key];
    return JSON.parse(JSON.stringify(out));
  }
  restore(snapshot) {
    Object.assign(this, JSON.parse(JSON.stringify(snapshot))); this.def = MONSTERS[this.q.mon];
    this.hr = this.q.hr ? HR : { hp: 1, dmg: 1, spd: 1 }; this.events = []; return this;
  }
  // ---------- geometry helpers ----------
  mYaw() { return this.m.yaw + this.m.spin; }
  mPt(lx, lz) { const m = this.m, s = this.def.scale, y = this.mYaw(), c = Math.cos(y), n = Math.sin(y); return [m.x + (lx * c + lz * n) * s, m.z + (-lx * n + lz * c) * s]; }
  mParts() {
    const d = this.def.dims, s = this.def.scale, out = [], add = (n, lx, lz, r) => { const [x, z] = this.mPt(lx, lz); out.push({ n, x, z, r: r * s }); };
    add('head', 0, d.headZ, 1.15); add('body', 0, d.hz * .45, d.bw * 1.02); add('body', 0, -d.hz * .45, d.bw * 1.02);
    for (const sx of [-1, 1]) for (const sz of (this.q.mon === 'ember' ? [-1] : [-1, 1])) add('legs', sx * d.legX * 1.05, this.q.mon === 'ember' ? -1 : sz * d.legZ, .78);
    if (this.m.broke.tail) add('body', 0, -d.hz - .5, .7);
    else { const n = Math.max(2, Math.round(d.tailLen / 1.3)); for (let i = 0; i < n; i++) add('tail', 0, -d.hz - .5 - (i + .5) * (d.tailLen / n), .85); }
    return out;
  }
  sweepR() { const d = this.def.dims; return (d.hz + (this.m.broke.tail ? 1.4 : d.tailLen) + .6) * this.def.scale; }
  clampArena(o, R) { const r = Math.hypot(o.x, o.z); if (r > R) { o.x *= R / r; o.z *= R / r; return true; } return false; }

  // ---------- player ----------
  startAtk(move, frac, comboIdx, myaw, hasMv) {
    const p = this.p, m = this.m;
    p.state = 'atk'; p.t = 0; p.cur = move; p.hits = 0; p.combo = comboIdx; p.spin = 0;
    p.mv = move.mv !== undefined ? move.mv : move.mv0 + (move.mv1 - move.mv0) * Math.pow(frac, 1.3); p.frac = frac;
    const dm = Math.hypot(m.x - p.x, m.z - p.z), toM = Math.atan2(m.x - p.x, m.z - p.z);
    if (this.lock && m.state !== 'dead' && (move.shot || dm < 10)) p.yaw = toM; else if (hasMv) p.yaw = myaw;
    if (!move.shot) this.sound(p.mv > 1.5 || this.wt === 'gs' ? 'swingH' : 'swing');
  }
  updPlayer(dt) {
    const p = this.p, W = this.W, inp = p.input; p.t += dt; p.inv = Math.max(0, p.inv - dt); p.stDelay -= dt;
    const fx = Math.sin(inp.aimYaw), fz = Math.cos(inp.aimYaw);
    let wx = fx * inp.moveZ / 127 - fz * inp.moveX / 127, wz = fz * inp.moveZ / 127 + fx * inp.moveX / 127; const ml = Math.hypot(wx, wz), hasMv = ml > .15, myaw = hasMv ? Math.atan2(wx, wz) : p.yaw;
    if (hasMv) { wx /= ml; wz /= ml; }
    const walk = (sp) => { if (!hasMv) { p.moving = 0; return; } p.yaw = turn(p.yaw, myaw, 14 * dt); const v = sp * Math.min(1, ml) * dt; p.x += wx * v; p.z += wz * v; p.walk += v; p.moving = sp / W.speed; };
    if (p.healLeft > 0) { const h = Math.min(p.healLeft, 45 * dt); p.healLeft -= h; p.hp = Math.min(p.maxHp, p.hp + h); }
    switch (p.state) {
      case 'idle': {
        const sprint = inp.sprint && hasMv && p.st > 1; if (sprint) { p.st -= 11 * dt; p.stDelay = .5; }
        walk(W.speed * (sprint ? 1.45 : 1));
        if (this.take('roll') && p.st >= W.rollCost) { this.startRoll(myaw); break; }
        if (this.take('potion') && p.potions > 0 && p.hp < p.maxHp) { p.potions--; p.state = 'drink'; p.t = 0; this.sound('potion'); break; }
        if (this.take('attack')) { this.startAtk(W.light[0], 0, 0, myaw, hasMv); break; }
        if (this.take('heavy')) this.startHeavy(myaw, hasMv);
        break;
      }
      case 'charge': {
        walk(W.speed * .35); const m = this.m; if (this.lock && m.state !== 'dead') p.yaw = turn(p.yaw, Math.atan2(m.x - p.x, m.z - p.z), 8 * dt);
        const fr = clamp(p.t / W.heavy.charge, 0, 1), lv = Math.floor(fr * 3 + .001); if (lv > p.clv) { p.clv = lv; this.sound('charge'); this.burst('spark', p.x, 1.4, p.z, 5, 3, .3, 0); }
        if (this.take('roll') && p.st >= W.rollCost) { this.startRoll(myaw); break; }
        if (!inp.heavyHeld) this.startAtk(W.heavy, fr, -1, myaw, false);
        break;
      }
      case 'atk': {
        const a = p.cur, n = a.multi || 1;
        if (a.sw === 'spin') { if (p.t > a.h0 && p.t < a.h1) this.advance(a.lunge / (a.h1 - a.h0) * dt); p.spin = clamp((p.t - a.h0) / (a.h1 - a.h0), 0, 1) * TAU * 2; }
        else if (a.lunge && p.t < a.h0) this.advance(a.lunge / a.h0 * dt);
        while (p.hits < n) {
          const ht = n > 1 ? a.h0 + (a.h1 - a.h0) * p.hits / (n - 1) : a.h0; if (p.t < ht) break;
          if (a.shot) { this.fireArrow(); p.hits++; }
          else if (n > 1) { this.meleeHit(a); p.hits++; }
          else if (this.meleeHit(a) || p.t > a.h1) p.hits++; else break;
        }
        if (p.hits >= n && p.t >= a.dur * .7) {
          if (this.take('roll') && p.st >= W.rollCost) { this.startRoll(myaw); break; }
          if (p.combo >= 0 && p.combo + 1 < W.light.length && this.take('attack')) { this.startAtk(W.light[p.combo + 1], 0, p.combo + 1, myaw, hasMv); break; }
          if (a.shot && this.take('attack')) { this.startAtk(W.light[0], 0, 0, myaw, hasMv); break; }
          if (this.take('heavy')) { this.startHeavy(myaw, hasMv); break; }
        }
        if (p.t >= a.dur) { p.state = 'idle'; p.spin = 0; }
        break;
      }
      case 'roll': {
        const k = p.t / .62, v = 12.5 * (1 - k * .65) * dt; p.x += Math.sin(p.yaw) * v; p.z += Math.cos(p.yaw) * v;
        if (p.t >= .62) p.state = 'idle';
        break;
      }
      case 'drink': if (p.t > .55 && !p.drank) { p.drank = true; p.healLeft += 50; this.burst('heal', p.x, 1.2, p.z, 10, 2, .7, -2); } if (p.t >= 1.25) { p.state = 'idle'; p.drank = false; } break;
      case 'hit': p.x += p.kbx * dt; p.z += p.kbz * dt; p.kbx *= .9; p.kbz *= .9; if (p.t >= .42) p.state = 'idle'; break;
      case 'down': p.x += p.kbx * dt; p.z += p.kbz * dt; p.kbx *= .92; p.kbz *= .92; if (p.t >= 1.15) { p.state = 'idle'; p.inv = .7; } break;
      case 'stun': if (p.t >= 1.25) p.state = 'idle'; break;
      case 'dead': if (p.t >= 2.3 && !this.over) { p.state = 'idle'; p.hp = p.maxHp; p.st = 100; p.x = 0; p.z = -34; p.yaw = 0; p.inv = 2.5; this.emit('respawn', { playerId: p.id }); } break;
    }
    if (p.stDelay <= 0 && p.state !== 'roll' && p.state !== 'charge') p.st = Math.min(100, p.st + 26 * dt);
    p.st = Math.max(0, p.st);
    // body collision with the monster
    const m = this.m;
    if (m.y < 1.2 && p.state !== 'dead') for (const c of this.mParts()) {
      if (c.n === 'legs' || c.n === 'tail') continue; const dx = p.x - c.x, dz = p.z - c.z, dd = Math.hypot(dx, dz), rr = c.r * .82 + .35;
      if (dd < rr && dd > .001) { p.x = c.x + dx / dd * rr; p.z = c.z + dz / dd * rr; }
    }
    this.clampArena(p, R_ARENA);
  }
  advance(v) { const p = this.p; p.x += Math.sin(p.yaw) * v; p.z += Math.cos(p.yaw) * v; }
  startRoll(yaw) { const p = this.p; p.state = 'roll'; p.t = 0; p.yaw = yaw; p.st -= this.W.rollCost; p.stDelay = .7; p.inv = Math.max(p.inv, .38); p.spin = 0; p.clv = 0; this.sound('roll'); this.burst('dust', p.x, .2, p.z, 4, 2, .4, 0); }
  startHeavy(myaw, hasMv) {
    const p = this.p, h = this.W.heavy;
    if (h.charge > 0) { p.state = 'charge'; p.t = 0; p.clv = 0; if (hasMv) p.yaw = myaw; }
    else if (p.st >= h.cost) { p.st -= h.cost; p.stDelay = .8; this.startAtk(h, 0, -1, myaw, hasMv); }
  }
  meleeHit(a) {
    const p = this.p; if (this.m.state === 'dead') return false; let best = null, bd = 1e9;
    for (const c of this.mParts()) {
      const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz); if (d > a.reach + c.r) continue;
      const ad = Math.abs(angDiff(Math.atan2(dx, dz), p.yaw)), slack = Math.asin(Math.min(1, c.r / Math.max(d, c.r)));
      if (ad > a.arc / 2 + slack) continue; const sd = d - c.r + ad * .6; if (sd < bd) { bd = sd; best = c; }
    }
    if (!best) return false;
    const dx = best.x - p.x, dz = best.z - p.z, d = Math.hypot(dx, dz) || 1, k = Math.max(0, d - best.r * .7) / d;
    this.hitMonster(best.n, this.atk * p.mv * DMG_SCALE, p.x + dx * k, p.z + dz * k, p.mv);
    return true;
  }
  fireArrow() {
    const p = this.p, m = this.m; let yaw = p.yaw;
    if (this.lock && m.state !== 'dead') yaw = p.yaw = Math.atan2(m.x - p.x, m.z - p.z);
    if (this.arrows.length >= 12) return;
    this.arrows.push({ id: this.nextEntity++, owner: p.id, frac: p.frac, yaw, x: p.x + Math.sin(yaw) * .8, z: p.z + Math.cos(yaw) * .8, vx: Math.sin(yaw) * 70, vz: Math.cos(yaw) * 70, life: .75, raw: this.atk * p.mv * DMG_SCALE, mv: p.mv });
    this.sound('shot');
  }
  hurtPlayers(predicate, dmg, sx, sz, heavy, once = false) {
    const active = this.activeId, hits = this.m.hitPlayers || (this.m.hitPlayers = {});
    for (const player of this.players) if ((!once || !hits[player.id]) && predicate(player)) {
      this.activeId = player.id;
      if (this.hurt(dmg,sx,sz,heavy) && once) { hits[player.id] = true; this.m.hitP = true; }
    }
    this.activeId = active;
  }
  hurt(dmg, sx, sz, heavy) {
    const p = this.p; if (p.inv > 0 || p.state === 'dead' || p.state === 'down' || this.over) return false;
    dmg = Math.max(1, Math.round(dmg * this.def.dmg * this.hr.dmg * (this.m.enr ? 1.2 : 1) * 80 / (80 + this.arm.def)));
    p.hp -= dmg; p.healLeft = 0; p.drank = false; p.spin = 0; this.emit('shake', { amount: heavy ? .7 : .4 }); this.sound('hurt');
    let dx = p.x - sx, dz = p.z - sz; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    this.burst('blood', p.x, 1.2, p.z, 6, 3, .4); this.emit('flash', { playerId: p.id });
    if (p.hp <= 0) {
      p.hp = 0; p.state = 'dead'; p.t = 0; this.carts++; this.emit('cart', { playerId: p.id, carts: this.carts }); this.sound('faint'); this.toast('faint', 'bad');
      if (this.carts >= MAX_CARTS) this.finish(false, 2.2);
    } else { p.state = heavy ? 'down' : 'hit'; p.t = 0; const s = heavy ? 13 : 6; p.kbx = dx * s; p.kbz = dz * s; if (!heavy) p.inv = .25; }
    return true;
  }

  // ---------- monster ----------
  hitMonster(part, raw, x, z, mv) {
    const m = this.m, d = this.def; if (m.state === 'dead') return;
    const mult = d.parts[part] * (m.state === 'topple' ? 1.1 : 1), dmg = Math.max(1, Math.round(raw * mult * (.95 + this.random() * .1)));
    m.hp -= dmg; this.dmgDealt += dmg; this.p.lastDamageTick = this.tick; this.p.contribution += dmg; m.stag += dmg; const y = d.dims.h * d.scale * (part === 'legs' ? .45 : .95), weak = mult >= 1.2;
    this.emit('hit', { x, y: y + .6, z, damage: dmg, cls: weak ? 'weak' : mult < .9 ? 'dull' : '', playerId: this.p.id });
    this.burst(weak ? 'weak' : 'spark', x, y, z, mv > 1.4 ? 12 : 6, mv > 1.4 ? 7 : 4.5, .35);
    this.sound(mv > 1.4 ? 'hitBig' : 'hit'); if (weak) this.sound('weak');
    this.stop = Math.max(this.stop, mv > 1.4 ? .11 : mv > .6 ? .06 : .025); this.emit('shake', { amount: mv > 1.4 ? .45 : .12 });
    if (m.state === 'idle') this.monRoar(false);
    const hrk = this.hr.hp; let newlyBroken = false;
    if (part === 'head' || part === 'tail') {
      if (!m.broke[part]) { m.brk[part] += dmg; if (m.brk[part] >= d.brk[part] * hrk) { this.breakPart(part); newlyBroken = true; } }
    } else if (part === 'legs' && m.hp > 0) { m.brk.legs += dmg; if (m.brk.legs >= m.legTh && m.state !== 'topple') { m.brk.legs = 0; m.legTh *= 1.35; return this.setMon('topple', 4.6, 'topple'); } }
    if (m.hp <= 0) return this.monDie();
    if (newlyBroken) return;
    if (m.stag >= m.maxHp * .13 && m.state !== 'topple' && m.state !== 'roar') { m.stag = 0; this.setMon('flinch', .95); }
    const st = [.7, .35][m.enrStage]; if (st && m.hp / m.maxHp < st) { m.enrStage++; m.rageQ = true; }
  }
  breakPart(part) {
    this.m.broke[part] = true; this.sound('break'); this.emit('shake', { amount: .6 }); this.stop = .14;
    this.emit('break', { part });
    this.toast(part === 'head' ? 'brk_head' : 'brk_tail', 'good'); this.setMon('flinch', 1.5);
  }
  setMon(state, dur, toast) { const m = this.m; m.state = state; m.t = 0; m.dur = dur || 0; m.spin = 0; m.y = 0; m.atk = null; this.hideTele(); if (toast) { this.toast(toast, 'good'); this.sound('stomp'); } }
  monRoar(rage) { this.emit('roar', { rage }); const m = this.m; this.setMon('roar', 1.75); m.roared = false; if (rage) { m.enr = true; m.enrT = 40; m.rageQ = false; this.toast('enrage', 'bad'); } }
  monDie() { this.emit('death'); const m = this.m; m.hp = 0; this.setMon('dead', 0); this.slow = 1.3; this.toast('slain', 'good'); this.sound('hitBig'); this.projs.length = 0; this.finish(true, 4.2); }
  hideTele() { this.emit('hideTele'); }
  showTele(...args) { this.emit('telegraph', { args }); }

  pickAttack(dist, ad) {
    const m = this.m, d = this.def, s = d.scale, c = []; let tot = 0;
    for (const k in d.atks) {
      const A = MA[k], f = A.melee ? s : 1; if (dist < A.min * f || dist > A.max * f || Math.abs(ad) > A.ang) continue;
      let w = d.atks[k]; if (k === m.last) w *= .3; if (k === 'sweep') w *= Math.abs(ad) > 1.6 ? 3 : dist > 4.5 * s ? .35 : 1; if (!A.melee && dist < 12) w *= .6;
      c.push([k, w]); tot += w;
    }
    if (!c.length) return false; let r = this.random() * tot;
    for (const [k, w] of c) { r -= w; if (r <= 0) { this.startMonAtk(k); return true; } }
    this.startMonAtk(c[0][0]); return true;
  }
  startMonAtk(k) { const m = this.m; m.state = 'atk'; m.t = 0; m.ak = k; m.atk = MA[k]; m.last = k; m.flag = 0; m.hitP = false; m.hitPlayers = {}; m.fired = 0; m.tick = 0; m.spin = 0; }

  updMon(dt) {
    this.activeId = selectTarget(this.players, this.m, this.tick)?.id ?? this.activeId; this.m.targetId = this.activeId;
    const m = this.m, d = this.def, p = this.p, s = d.scale; if (m.state === 'dead') { m.t += dt; return; }
    const spd = d.speed * this.hr.spd * (m.enr ? 1.25 : 1), dx = p.x - m.x, dz = p.z - m.z, dist = Math.hypot(dx, dz), toP = Math.atan2(dx, dz), ad = angDiff(toP, m.yaw);
    m.t += dt; m.moving = 0; if (m.enr) { m.enrT -= dt; if (m.enrT <= 0) m.enr = false; }
    const alive = p.state !== 'dead';
    switch (m.state) {
      case 'idle': if (dist < 24) this.monRoar(false); break;
      case 'roar':
        if (!m.roared && m.t > .5) { m.roared = true; this.sound('roar'); this.emit('shake', { amount: .8 }); for (const hunter of this.players) if (Math.hypot(hunter.x-m.x,hunter.z-m.z) < 15 && hunter.inv <= 0 && ['idle','charge','drink'].includes(hunter.state)) { hunter.state = 'stun'; hunter.t = 0; } }
        if (m.t > m.dur) { m.state = 'chase'; m.think = .2; } break;
      case 'chase': {
        if (m.rageQ) { this.monRoar(true); break; }
        m.yaw = turn(m.yaw, toP, d.turn * (m.enr ? 1.25 : 1) * dt);
        if (dist > 4.6 * s && Math.abs(ad) < 1.1) { const v = spd * dt; m.x += Math.sin(m.yaw) * v; m.z += Math.cos(m.yaw) * v; m.walk += v; m.moving = 1; }
        m.think -= dt; if (alive && m.think <= 0) { if (!this.pickAttack(dist, ad)) m.think = .25; }
        break;
      }
      case 'atk': this.updMonAtk(dt, dist, toP, ad, spd); break;
      case 'flinch': case 'topple': if (m.t > m.dur) { m.think = m.state === 'topple' ? .5 : .3; m.state = 'chase'; } break;
    }
    this.clampArena(m, R_ARENA - 2);
  }
  updMonAtk(dt, dist, toP, ad, spd) {
    const m = this.m, d = this.def, s = d.scale, p = this.p, A = m.atk, k = m.ak, dm = d.dims, er = m.enr ? .85 : 1, W = A.w * er;
    const fwd = (v) => { m.x += Math.sin(m.yaw) * v; m.z += Math.cos(m.yaw) * v; };
    const wind = m.t < W, act = !wind && m.t < W + A.a, wk = m.t / W, tA = m.t - W;
    const [hx, hz] = this.mPt(0, dm.headZ + .6);
    if (wind) {
      const track = { bite: wk < .7 ? 1.6 : 0, sweep: 0, stomp: 1.2, charge: wk < .85 ? 4 : 0, leap: 3.5, spit: 4, fireball: 4, breath: wk < .7 ? 1.6 : 0 }[k];
      m.yaw = turn(m.yaw, toP, track * dt);
      if (k === 'bite') this.showTele('cone', hx - Math.sin(m.yaw) * 1.2 * s, hz - Math.cos(m.yaw) * 1.2 * s, m.yaw, 4.2 * s, 4.2 * s, wk);
      else if (k === 'sweep') this.showTele('circle', m.x, m.z, 0, this.sweepR(), this.sweepR(), wk);
      else if (k === 'stomp') { const [x, z] = this.mPt(0, dm.headZ * .7); this.showTele('circle', x, z, 0, 5.2 * s, 5.2 * s, wk); }
      else if (k === 'charge') this.showTele('rect', m.x, m.z, m.yaw, dm.bw * 2.4 * s, 30, wk);
      else if (k === 'leap') { m.tx = p.x; m.tz = p.z; this.showTele('circle', m.tx, m.tz, 0, 4.8 * s, 4.8 * s, wk); }
      else if (k === 'breath') this.showTele('breath', hx, hz, m.yaw, 13, 13, wk);
      return;
    }
    if (act) {
      if (!m.flag) {
        m.flag = 1; m.fx = m.x; m.fz = m.z;
        if (k === 'bite') { fwd(1.4 * s); const [bx, bz] = this.mPt(0, dm.headZ + 1.2); this.hurtPlayers(p => Math.hypot(p.x - bx,p.z - bz) < 2.5*s, A.dmg,m.x,m.z,false); this.sound('swing'); this.hideTele(); }
        if (k === 'stomp') { const [x, z] = this.mPt(0, dm.headZ * .7); this.hurtPlayers(p => Math.hypot(p.x-x,p.z-z) < 5.2*s,A.dmg,x,z,true); this.burst('dust', x, .3, z, 26, 9, .7); this.sound('stomp'); this.emit('shake', { amount: .9 }); this.hideTele(); }
        if (k === 'spit') { for (const o of [-.28, 0, .28]) this.spawnProj(hx, hz, toP + o, 24, .7, A.dmg, false); this.sound('ice'); }
        if (k === 'leap') { const t = { x: m.tx, z: m.tz }; this.clampArena(t, R_ARENA - 3); m.tx = t.x; m.tz = t.z; m.yaw = Math.atan2(m.tx - m.x, m.tz - m.z); }
        if (k === 'sweep') this.sound('swingH');
        if (k === 'charge') { this.sound('roar'); this.hideTele(); }
      }
      const ak = tA / A.a;
      if (k === 'sweep') { m.spin = ease(ak) * TAU; if (ak > .1) this.hurtPlayers(p => Math.hypot(p.x-m.x,p.z-m.z) < this.sweepR(),A.dmg,m.x,m.z,false,true); this.hideTele(); }
      else if (k === 'charge') {
        m.yaw = turn(m.yaw, toP, .55 * dt); const v = 23 * (m.enr ? 1.15 : 1) * dt; fwd(v); m.walk += v * 1.5; m.moving = 2;
        this.hurtPlayers(p => this.mParts().some(c => c.n !== 'tail' && c.n !== 'legs' && Math.hypot(p.x-c.x,p.z-c.z) < c.r+.7),A.dmg,m.x,m.z,true,true);
        this.emit('chanceBurst', { chance: .5, args: ['dust', m.x, .2, m.z, 1, 3, .5, 0] });
        if (Math.hypot(m.x, m.z) > R_ARENA - 2.4) { this.burst('dust', m.x, 1, m.z, 22, 8, .8); this.sound('stomp'); this.emit('shake', { amount: .7 }); this.setMon('flinch', 1.7); return; }
      } else if (k === 'leap') {
        m.x = lerp(m.fx, m.tx, ak); m.z = lerp(m.fz, m.tz, ak); m.y = Math.sin(ak * PI) * 6.5; this.showTele('circle', m.tx, m.tz, 0, 4.8 * s, 4.8 * s, .6 + ak * .4);
      } else if (k === 'fireball') {
        m.yaw = turn(m.yaw, toP, 3 * dt); const n = (m.enr || this.q.hr) ? 3 : 1;
        if (m.fired < n && tA >= m.fired * .4) { m.fired++; this.spawnProj(hx, hz, Math.atan2(p.x - hx, p.z - hz), 31, 1.25, A.dmg, true); this.sound('fire'); }
      } else if (k === 'breath') {
        m.yaw = turn(m.yaw, toP, .6 * dt); this.showTele('breath', hx, hz, m.yaw, 13, 13, 1);
        for (let i = 0; i < 3; i++) this.jet('fire', hx, dm.h * s * .9, hz, m.yaw, 20, .6, 1.0);
        m.tick -= dt; if (m.tick <= 0) { m.tick = .22; this.sound('fire'); this.hurtPlayers(p => Math.hypot(p.x-hx,p.z-hz) < 13 && Math.abs(angDiff(Math.atan2(p.x-hx,p.z-hz),m.yaw)) < .52,A.dmg,hx,hz,false); }
      }
      return;
    }
    if (m.flag < 2) {
      m.flag = 2; m.spin = 0; this.hideTele();
      if (k === 'leap') { m.y = 0; m.x = m.tx; m.z = m.tz; this.hurtPlayers(p => Math.hypot(p.x-m.x,p.z-m.z) < 4.8*s,A.dmg,m.x,m.z,true); this.burst('dust', m.x, .3, m.z, 30, 10, .8); this.sound('stomp'); this.emit('shake', { amount: 1 }); }
    }
    if (m.t >= W + A.a + A.r * er) { m.state = 'chase'; m.atk = null; m.think = (.35 + this.random() * .6) * (m.enr ? .6 : 1); }
  }
  spawnProj(x, z, yaw, sp, rad, dmg, heavy) {
    if (this.projs.length >= 8) return; const fire = this.def.proj === 'fire';
    this.projs.push({ id: this.nextEntity++, x, z, vx: Math.sin(yaw) * sp, vz: Math.cos(yaw) * sp, life: 1.9, rad, dmg, heavy, kind: fire ? 'fire' : 'ice' });
  }

  updProjs(dt) {
    const y = this.def.dims.h * this.def.scale * .75;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const q = this.projs[i]; q.x += q.vx * dt; q.z += q.vz * dt; q.life -= dt; q.y = Math.max(1.1, y * Math.min(1, q.life));
      this.emit('chanceBurst', { chance: .7, args: [q.kind, q.x, q.y, q.z, 1, 1.5, .35, 0] });
      let dead = q.life <= 0 || Math.hypot(q.x, q.z) > R_ARENA + 4;
      for (const player of this.players) if (!dead && Math.hypot(player.x - q.x, player.z - q.z) < q.rad + .55) { this.activeId = player.id; if (this.hurt(q.dmg, q.x - q.vx, q.z - q.vz, q.heavy)) dead = true; }
      if (dead) { this.burst(q.kind, q.x, 1, q.z, 10, 5, .5); this.projs.splice(i, 1); }
    }
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i]; let hit = null;
      for (let sN = 0; sN < 3 && !hit; sN++) {
        a.x += a.vx * dt / 3; a.z += a.vz * dt / 3;
        if (this.m.state !== 'dead') { let bd = 1e9; for (const c of this.mParts()) { const dd = Math.hypot(a.x - c.x, a.z - c.z) - c.r; if (dd < .3 && dd < bd) { bd = dd; hit = c; } } }
      }
      a.life -= dt;
      if (hit) { this.activeId = a.owner; this.hitMonster(hit.n, a.raw, a.x, a.z, a.mv); }
      if (hit || a.life <= 0) { this.arrows.splice(i, 1); }
    }
  }

  // ---------- flow ----------
  finish(win, delay) { if (this.over) return; this.over = true; this.win = win; this.endT = delay; }
  result() {
    if (this.cachedResult) return JSON.parse(JSON.stringify(this.cachedResult));
    const loot = this.win ? rollLoot(this.q, this.m.broke, () => this.random()) : {};
    this.cachedResult = { win: this.win, time: this.time, loot, broke: { ...this.m.broke }, carts: this.carts, quest: this.q, timeout: this.time >= TIME_LIMIT };
    return JSON.parse(JSON.stringify(this.cachedResult));
  }
  toggleLock() { this.lock = !this.lock; this.sound('ui'); }

}

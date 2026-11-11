// Beast Hunt — hunt simulation: player, monster AI, combat, camera, effects.
import * as THREE from 'three';
import { MONSTERS, WTYPES, ATK, ARMOR, DMG_SCALE, HR, TIME_LIMIT, MAX_CARTS, POTIONS, rollLoot } from 'bh/data';
import { buildHunter, buildMonster, buildArena } from 'bh/models';
import { sfx } from 'bh/audio';

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
const PCOL = { spark: 0xffe27a, weak: 0xff9a2a, dust: 0xb9a888, fire: 0xff7a1e, ice: 0x9fe8ff, heal: 0x7dffa0, blood: 0xd8433a };

export class Hunt {
  constructor(renderer, quest, save, ui, input, onEnd) {
    this.r = renderer; this.q = quest; this.save = save; this.ui = ui; this.in = input; this.onEnd = onEnd;
    const d = this.def = MONSTERS[quest.mon]; this.hr = quest.hr ? HR : { hp: 1, dmg: 1, spd: 1 };
    this.wt = save.weapon; this.W = WTYPES[this.wt]; this.atk = ATK[save.w[this.wt] - 1]; this.arm = ARMOR[save.armor - 1];
    const sc = this.scene = new THREE.Scene(), ar = this.arena = buildArena(d.biome, R_ARENA); sc.add(ar.group);
    sc.background = new THREE.Color(ar.B.sky); sc.fog = new THREE.Fog(ar.B.sky, ar.B.fog[0], ar.B.fog[1]);
    sc.add(new THREE.HemisphereLight(ar.B.amb[0], ar.B.amb[1], 1.2));
    const sun = this.sun = new THREE.DirectionalLight(ar.B.sun, 1.9); sc.add(sun); sc.add(sun.target);
    if (renderer.shadowMap.enabled) {
      sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); const c = sun.shadow.camera;
      c.left = c.bottom = -28; c.right = c.top = 28; c.near = 1; c.far = 100; sun.shadow.bias = -.002;
    }
    this.cam = new THREE.PerspectiveCamera(58, 1, .2, 420);
    this.H = buildHunter(this.wt, save.w[this.wt], save.armor); sc.add(this.H.root);
    this.G = buildMonster(quest.mon); sc.add(this.G.root);
    if (d.biome === 'volcano') { const rim = new THREE.DirectionalLight(0x9ddcff, 2.4); rim.position.set(-12, 9, -8); sc.add(rim); }
    const maxHp = 100 + this.arm.hp;
    this.p = { x: 0, z: -30, yaw: 0, hp: maxHp, maxHp, st: 100, stDelay: 0, state: 'idle', t: 0, inv: 0, walk: 0, moving: 0, potions: POTIONS, cur: null, hits: 0, combo: 0, mv: 1, kbx: 0, kbz: 0, clv: 0, healLeft: 0, spin: 0 };
    const mhp = Math.round(d.hp * this.hr.hp);
    this.m = { x: 0, z: 12, y: 0, yaw: PI, spin: 0, hp: mhp, maxHp: mhp, state: 'idle', t: 0, dur: 0, atk: null, ak: null, last: '', think: 1, enr: false, enrT: 0, enrStage: 0, rageQ: false, walk: 0, moving: 0, stag: 0, brk: { head: 0, tail: 0, legs: 0 }, broke: { head: false, tail: false }, legTh: d.brk.legs * this.hr.hp, flag: 0, hitP: false, fired: 0, tick: 0, fx: 0, fz: 0, tx: 0, tz: 0, roared: false };
    this.hp0 = { headRx: 0, headZ: 0, jaw: 0, bodyY: 0, bodyRx: 0, bodyRz: 0, tailCurl: 0, tailLift: 0 };
    this.mp = Object.assign({}, this.hp0);
    this.cy = 0; this.cp = .32; this.cd = input.isTouch ? 11 : 9.5; this.ct = new THREE.Vector3(0, 1.7, -30); this.shake = 0;
    this.lock = true; this.time = 0; this.carts = 0; this.over = false; this.endT = 0; this.stop = 0; this.slow = 0; this.clock = 0; this.paused = false; this.dmgDealt = 0;
    this.projs = []; this.arrows = []; this.buildFx();
    this.syncModels(0); this.updCam(0, true); this.updHud();
    ui.setMon(quest.mon, quest.hr);
  }

  buildFx() {
    const sc = this.scene, flat = (g) => { g.rotateX(-PI / 2); return g; };
    const tm = () => new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const mk = (g) => { const m = new THREE.Mesh(g, tm()); m.visible = false; m.position.y = .06; m.renderOrder = 2; sc.add(m); return m; };
    const rect = new THREE.PlaneGeometry(1, 1); rect.rotateX(-PI / 2); rect.translate(0, 0, .5);
    this.tele = {
      circle: mk(flat(new THREE.CircleGeometry(1, 40))), rect: mk(rect),
      cone: mk(flat(new THREE.CircleGeometry(1, 20, -PI / 2 - .75, 1.5))), breath: mk(flat(new THREE.CircleGeometry(1, 20, -PI / 2 - .5, 1.0))),
    };
    this.pm = {}; for (const k in PCOL) this.pm[k] = new THREE.MeshBasicMaterial({ color: PCOL[k] });
    const pg = new THREE.OctahedronGeometry(.2, 0); this.parts = [];
    for (let i = 0; i < 170; i++) { const m = new THREE.Mesh(pg, this.pm.spark); m.visible = false; sc.add(m); this.parts.push({ m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0 }); }
    this.pi = 0;
    const sg = new THREE.SphereGeometry(1, 8, 6); this.projPool = [];
    for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xffffff })); m.visible = false; sc.add(m); this.projPool.push(m); }
    const ag = new THREE.BoxGeometry(.07, .07, 1.2); this.arrowPool = [];
    for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xfff3c4 })); m.visible = false; sc.add(m); this.arrowPool.push(m); }
    const lg = new THREE.RingGeometry(.9, 1, 24); lg.rotateX(-PI / 2);
    this.lockRing = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0xffd35a, transparent: true, opacity: .7, depthWrite: false })); this.lockRing.position.y = .08; sc.add(this.lockRing);
  }

  burst(kind, x, y, z, n, sp, life, g = 9) {
    for (let i = 0; i < n; i++) {
      const p = this.parts[this.pi = (this.pi + 1) % this.parts.length], a = Math.random() * TAU, e = Math.random() * 1.2 - .2, s = sp * (.4 + Math.random() * .8);
      p.m.material = this.pm[kind]; p.m.visible = true; p.m.position.set(x, y, z); p.m.scale.setScalar(.6 + Math.random() * .9);
      p.vx = Math.cos(a) * Math.cos(e) * s; p.vz = Math.sin(a) * Math.cos(e) * s; p.vy = Math.sin(e) * s + sp * .3; p.life = p.max = life * (.6 + Math.random() * .6); p.g = g;
    }
  }
  jet(kind, x, y, z, yaw, sp, life, spread = .35) {
    const p = this.parts[this.pi = (this.pi + 1) % this.parts.length], a = yaw + (Math.random() - .5) * spread;
    p.m.material = this.pm[kind]; p.m.visible = true; p.m.position.set(x, y, z); p.m.scale.setScalar(1 + Math.random() * 1.6);
    p.vx = Math.sin(a) * sp; p.vz = Math.cos(a) * sp; p.vy = (Math.random() - .6) * 2; p.life = p.max = life; p.g = 0;
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
    if (!move.shot) sfx(p.mv > 1.5 || this.wt === 'gs' ? 'swingH' : 'swing');
  }
  updPlayer(dt) {
    const p = this.p, W = this.W, inp = this.in; p.t += dt; p.inv = Math.max(0, p.inv - dt); p.stDelay -= dt;
    const mv = inp.move(), fx = Math.sin(this.cy), fz = Math.cos(this.cy);
    let wx = fx * mv.y - fz * mv.x, wz = fz * mv.y + fx * mv.x; const ml = Math.hypot(wx, wz), hasMv = ml > .15, myaw = hasMv ? Math.atan2(wx, wz) : p.yaw;
    if (hasMv) { wx /= ml; wz /= ml; }
    const walk = (sp) => { if (!hasMv) { p.moving = 0; return; } p.yaw = turn(p.yaw, myaw, 14 * dt); const v = sp * Math.min(1, ml) * dt; p.x += wx * v; p.z += wz * v; p.walk += v; p.moving = sp / W.speed; };
    if (p.healLeft > 0) { const h = Math.min(p.healLeft, 45 * dt); p.healLeft -= h; p.hp = Math.min(p.maxHp, p.hp + h); }
    switch (p.state) {
      case 'idle': {
        const sprint = inp.held.sprint && hasMv && p.st > 1; if (sprint) { p.st -= 11 * dt; p.stDelay = .5; }
        walk(W.speed * (sprint ? 1.45 : 1));
        if (inp.take('roll') && p.st >= W.rollCost) { this.startRoll(myaw); break; }
        if (inp.take('potion') && p.potions > 0 && p.hp < p.maxHp) { p.potions--; p.state = 'drink'; p.t = 0; sfx('potion'); break; }
        if (inp.take('attack')) { this.startAtk(W.light[0], 0, 0, myaw, hasMv); break; }
        if (inp.take('heavy')) this.startHeavy(myaw, hasMv);
        break;
      }
      case 'charge': {
        walk(W.speed * .35); const m = this.m; if (this.lock && m.state !== 'dead') p.yaw = turn(p.yaw, Math.atan2(m.x - p.x, m.z - p.z), 8 * dt);
        const fr = clamp(p.t / W.heavy.charge, 0, 1), lv = Math.floor(fr * 3 + .001); if (lv > p.clv) { p.clv = lv; sfx('charge'); this.burst('spark', p.x, 1.4, p.z, 5, 3, .3, 0); }
        if (inp.take('roll') && p.st >= W.rollCost) { this.startRoll(myaw); break; }
        if (!inp.held.heavy) this.startAtk(W.heavy, fr, -1, myaw, false);
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
          if (inp.take('roll') && p.st >= W.rollCost) { this.startRoll(myaw); break; }
          if (p.combo >= 0 && p.combo + 1 < W.light.length && inp.take('attack')) { this.startAtk(W.light[p.combo + 1], 0, p.combo + 1, myaw, hasMv); break; }
          if (a.shot && inp.take('attack')) { this.startAtk(W.light[0], 0, 0, myaw, hasMv); break; }
          if (inp.take('heavy')) { this.startHeavy(myaw, hasMv); break; }
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
      case 'dead': if (p.t >= 2.3 && !this.over) { p.state = 'idle'; p.hp = p.maxHp; p.st = 100; p.x = 0; p.z = -34; p.yaw = 0; p.inv = 2.5; this.cy = 0; } break;
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
  startRoll(yaw) { const p = this.p; p.state = 'roll'; p.t = 0; p.yaw = yaw; p.st -= this.W.rollCost; p.stDelay = .7; p.inv = Math.max(p.inv, .38); p.spin = 0; p.clv = 0; sfx('roll'); this.burst('dust', p.x, .2, p.z, 4, 2, .4, 0); }
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
    const mesh = this.arrowPool.find((a) => !a.visible); if (!mesh) return;
    mesh.visible = true; mesh.rotation.y = yaw; mesh.scale.set(1 + p.frac * 1.5, 1 + p.frac * 1.5, 1 + p.frac * .6);
    this.arrows.push({ x: p.x + Math.sin(yaw) * .8, z: p.z + Math.cos(yaw) * .8, vx: Math.sin(yaw) * 70, vz: Math.cos(yaw) * 70, life: .75, raw: this.atk * p.mv * DMG_SCALE, mv: p.mv, mesh });
    sfx('shot');
  }
  hurt(dmg, sx, sz, heavy) {
    const p = this.p; if (p.inv > 0 || p.state === 'dead' || p.state === 'down' || this.over) return false;
    dmg = Math.max(1, Math.round(dmg * this.def.dmg * this.hr.dmg * (this.m.enr ? 1.2 : 1) * 80 / (80 + this.arm.def)));
    p.hp -= dmg; p.healLeft = 0; p.drank = false; p.spin = 0; this.shake = Math.max(this.shake, heavy ? .7 : .4); sfx('hurt');
    let dx = p.x - sx, dz = p.z - sz; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    this.burst('blood', p.x, 1.2, p.z, 6, 3, .4); this.ui.flash();
    if (p.hp <= 0) {
      p.hp = 0; p.state = 'dead'; p.t = 0; this.carts++; sfx('faint'); this.ui.toast('faint', 'bad');
      if (this.carts >= MAX_CARTS) this.finish(false, 2.2);
    } else { p.state = heavy ? 'down' : 'hit'; p.t = 0; const s = heavy ? 13 : 6; p.kbx = dx * s; p.kbz = dz * s; if (!heavy) p.inv = .25; }
    return true;
  }

  // ---------- monster ----------
  hitMonster(part, raw, x, z, mv) {
    const m = this.m, d = this.def; if (m.state === 'dead') return;
    const mult = d.parts[part] * (m.state === 'topple' ? 1.1 : 1), dmg = Math.max(1, Math.round(raw * mult * (.95 + Math.random() * .1)));
    m.hp -= dmg; this.dmgDealt += dmg; m.stag += dmg; const y = d.dims.h * d.scale * (part === 'legs' ? .45 : .95), weak = mult >= 1.2;
    this.ui.dmg(new THREE.Vector3(x, y + .6, z).project(this.cam), dmg, weak ? 'weak' : mult < .9 ? 'dull' : '');
    this.burst(weak ? 'weak' : 'spark', x, y, z, mv > 1.4 ? 12 : 6, mv > 1.4 ? 7 : 4.5, .35);
    sfx(mv > 1.4 ? 'hitBig' : 'hit'); if (weak) sfx('weak');
    this.stop = Math.max(this.stop, mv > 1.4 ? .11 : mv > .6 ? .06 : .025); this.shake = Math.max(this.shake, mv > 1.4 ? .45 : .12);
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
    const m = this.m, G = this.G; m.broke[part] = true; sfx('break'); this.shake = .6; this.stop = .14;
    if (part === 'head') { G.horns.forEach((h) => { h.scale.set(.85, .24, .85); h.material = G.brokenHornMat; }); const [x, z] = this.mPt(0, this.def.dims.headZ); this.burst('dust', x, 2, z, 16, 6, .7); }
    else {
      const seg = G.tail[1] || G.tail[0]; this.scene.attach(seg); seg.position.y = .45 * this.def.scale; seg.rotation.set(0, seg.rotation.y, .4); this.cutTail = seg; G.tail.length = 1;
      const [x, z] = this.mPt(0, -this.def.dims.hz - 1); this.burst('blood', x, 1.5, z, 18, 6, .7);
    }
    this.ui.toast(part === 'head' ? 'brk_head' : 'brk_tail', 'good'); this.setMon('flinch', 1.5);
  }
  setMon(state, dur, toast) { const m = this.m; m.state = state; m.t = 0; m.dur = dur || 0; m.spin = 0; m.y = 0; m.atk = null; this.hideTele(); if (toast) { this.ui.toast(toast, 'good'); sfx('stomp'); } }
  monRoar(rage) { const m = this.m; this.setMon('roar', 1.75); m.roared = false; if (rage) { m.enr = true; m.enrT = 40; m.rageQ = false; this.ui.toast('enrage', 'bad'); } }
  monDie() { const m = this.m; m.hp = 0; this.setMon('dead', 0); this.slow = 1.3; this.ui.toast('slain', 'good'); sfx('hitBig'); for (const pr of this.projs) pr.mesh.visible = false; this.projs.length = 0; this.finish(true, 4.2); }
  hideTele() { for (const k in this.tele) this.tele[k].visible = false; }
  showTele(kind, x, z, yaw, sx, sz, k) { const t = this.tele[kind]; t.visible = true; t.position.x = x; t.position.z = z; t.rotation.y = yaw; t.scale.set(sx, 1, sz); t.material.opacity = .12 + .38 * clamp(k, 0, 1); }

  pickAttack(dist, ad) {
    const m = this.m, d = this.def, s = d.scale, c = []; let tot = 0;
    for (const k in d.atks) {
      const A = MA[k], f = A.melee ? s : 1; if (dist < A.min * f || dist > A.max * f || Math.abs(ad) > A.ang) continue;
      let w = d.atks[k]; if (k === m.last) w *= .3; if (k === 'sweep') w *= Math.abs(ad) > 1.6 ? 3 : dist > 4.5 * s ? .35 : 1; if (!A.melee && dist < 12) w *= .6;
      c.push([k, w]); tot += w;
    }
    if (!c.length) return false; let r = Math.random() * tot;
    for (const [k, w] of c) { r -= w; if (r <= 0) { this.startMonAtk(k); return true; } }
    this.startMonAtk(c[0][0]); return true;
  }
  startMonAtk(k) { const m = this.m; m.state = 'atk'; m.t = 0; m.ak = k; m.atk = MA[k]; m.last = k; m.flag = 0; m.hitP = false; m.fired = 0; m.tick = 0; m.spin = 0; }

  updMon(dt) {
    const m = this.m, d = this.def, p = this.p, s = d.scale; if (m.state === 'dead') { m.t += dt; return; }
    const spd = d.speed * this.hr.spd * (m.enr ? 1.25 : 1), dx = p.x - m.x, dz = p.z - m.z, dist = Math.hypot(dx, dz), toP = Math.atan2(dx, dz), ad = angDiff(toP, m.yaw);
    m.t += dt; m.moving = 0; if (m.enr) { m.enrT -= dt; if (m.enrT <= 0) m.enr = false; }
    const alive = p.state !== 'dead';
    switch (m.state) {
      case 'idle': if (dist < 24) this.monRoar(false); break;
      case 'roar':
        if (!m.roared && m.t > .5) { m.roared = true; sfx('roar'); this.shake = .8; if (dist < 15 && p.inv <= 0 && (p.state === 'idle' || p.state === 'charge' || p.state === 'drink')) { p.state = 'stun'; p.t = 0; } }
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
        if (k === 'bite') { fwd(1.4 * s); const [bx, bz] = this.mPt(0, dm.headZ + 1.2); if (Math.hypot(p.x - bx, p.z - bz) < 2.5 * s) this.hurt(A.dmg, m.x, m.z, false); sfx('swing'); this.hideTele(); }
        if (k === 'stomp') { const [x, z] = this.mPt(0, dm.headZ * .7); if (Math.hypot(p.x - x, p.z - z) < 5.2 * s) this.hurt(A.dmg, x, z, true); this.burst('dust', x, .3, z, 26, 9, .7); sfx('stomp'); this.shake = .9; this.hideTele(); }
        if (k === 'spit') { for (const o of [-.28, 0, .28]) this.spawnProj(hx, hz, toP + o, 24, .7, A.dmg, false); sfx('ice'); }
        if (k === 'leap') { const t = { x: m.tx, z: m.tz }; this.clampArena(t, R_ARENA - 3); m.tx = t.x; m.tz = t.z; m.yaw = Math.atan2(m.tx - m.x, m.tz - m.z); }
        if (k === 'sweep') sfx('swingH');
        if (k === 'charge') { sfx('roar'); this.hideTele(); }
      }
      const ak = tA / A.a;
      if (k === 'sweep') { m.spin = ease(ak) * TAU; if (!m.hitP && dist < this.sweepR() && ak > .1) m.hitP = this.hurt(A.dmg, m.x, m.z, false) || m.hitP; this.hideTele(); }
      else if (k === 'charge') {
        m.yaw = turn(m.yaw, toP, .55 * dt); const v = 23 * (m.enr ? 1.15 : 1) * dt; fwd(v); m.walk += v * 1.5; m.moving = 2;
        if (!m.hitP) for (const c of this.mParts()) if (c.n !== 'tail' && c.n !== 'legs' && Math.hypot(p.x - c.x, p.z - c.z) < c.r + .7) { m.hitP = this.hurt(A.dmg, m.x, m.z, true) || m.hitP; break; }
        if (Math.random() < .5) this.burst('dust', m.x, .2, m.z, 1, 3, .5, 0);
        if (Math.hypot(m.x, m.z) > R_ARENA - 2.4) { this.burst('dust', m.x, 1, m.z, 22, 8, .8); sfx('stomp'); this.shake = .7; this.setMon('flinch', 1.7); return; }
      } else if (k === 'leap') {
        m.x = lerp(m.fx, m.tx, ak); m.z = lerp(m.fz, m.tz, ak); m.y = Math.sin(ak * PI) * 6.5; this.showTele('circle', m.tx, m.tz, 0, 4.8 * s, 4.8 * s, .6 + ak * .4);
      } else if (k === 'fireball') {
        m.yaw = turn(m.yaw, toP, 3 * dt); const n = (m.enr || this.q.hr) ? 3 : 1;
        if (m.fired < n && tA >= m.fired * .4) { m.fired++; this.spawnProj(hx, hz, Math.atan2(p.x - hx, p.z - hz), 31, 1.25, A.dmg, true); sfx('fire'); }
      } else if (k === 'breath') {
        m.yaw = turn(m.yaw, toP, .6 * dt); this.showTele('breath', hx, hz, m.yaw, 13, 13, 1);
        for (let i = 0; i < 3; i++) this.jet('fire', hx, dm.h * s * .9, hz, m.yaw, 16 + Math.random() * 8, .6, 1.0);
        m.tick -= dt; if (m.tick <= 0) { m.tick = .22; sfx('fire'); const pd = Math.hypot(p.x - hx, p.z - hz), pa = Math.abs(angDiff(Math.atan2(p.x - hx, p.z - hz), m.yaw)); if (pd < 13 && pa < .52) this.hurt(A.dmg, hx, hz, false); }
      }
      return;
    }
    if (m.flag < 2) {
      m.flag = 2; m.spin = 0; this.hideTele();
      if (k === 'leap') { m.y = 0; m.x = m.tx; m.z = m.tz; if (Math.hypot(p.x - m.x, p.z - m.z) < 4.8 * s) this.hurt(A.dmg, m.x, m.z, true); this.burst('dust', m.x, .3, m.z, 30, 10, .8); sfx('stomp'); this.shake = 1; }
    }
    if (m.t >= W + A.a + A.r * er) { m.state = 'chase'; m.atk = null; m.think = (.35 + Math.random() * .6) * (m.enr ? .6 : 1); }
  }
  spawnProj(x, z, yaw, sp, rad, dmg, heavy) {
    const mesh = this.projPool.find((q) => !q.visible); if (!mesh) return; const fire = this.def.proj === 'fire';
    mesh.visible = true; mesh.material.color.setHex(fire ? 0xff8a2a : 0xa8ecff); mesh.scale.setScalar(rad);
    this.projs.push({ x, z, vx: Math.sin(yaw) * sp, vz: Math.cos(yaw) * sp, life: 1.9, rad, dmg, heavy, mesh, kind: fire ? 'fire' : 'ice' });
  }
  updProjs(dt) {
    const p = this.p, y = this.def.dims.h * this.def.scale * .75;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const q = this.projs[i]; q.x += q.vx * dt; q.z += q.vz * dt; q.life -= dt; q.mesh.position.set(q.x, Math.max(1.1, y * Math.min(1, q.life)), q.z);
      if (Math.random() < .7) this.burst(q.kind, q.x, q.mesh.position.y, q.z, 1, 1.5, .35, 0);
      let dead = q.life <= 0 || Math.hypot(q.x, q.z) > R_ARENA + 4;
      if (!dead && Math.hypot(p.x - q.x, p.z - q.z) < q.rad + .55) { if (this.hurt(q.dmg, q.x - q.vx, q.z - q.vz, q.heavy)) dead = true; }
      if (dead) { this.burst(q.kind, q.x, 1, q.z, 10, 5, .5); q.mesh.visible = false; this.projs.splice(i, 1); }
    }
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i]; let hit = null;
      for (let sN = 0; sN < 3 && !hit; sN++) {
        a.x += a.vx * dt / 3; a.z += a.vz * dt / 3;
        if (this.m.state !== 'dead') { let bd = 1e9; for (const c of this.mParts()) { const dd = Math.hypot(a.x - c.x, a.z - c.z) - c.r; if (dd < .3 && dd < bd) { bd = dd; hit = c; } } }
      }
      a.life -= dt; a.mesh.position.set(a.x, 1.45, a.z);
      if (hit) this.hitMonster(hit.n, a.raw, a.x, a.z, a.mv);
      if (hit || a.life <= 0) { a.mesh.visible = false; this.arrows.splice(i, 1); }
    }
  }

  // ---------- flow ----------
  finish(win, delay) { if (this.over) return; this.over = true; this.win = win; this.endT = delay; }
  result() {
    const loot = this.win ? rollLoot(this.q, this.m.broke) : {};
    return { win: this.win, time: this.time, loot, broke: this.m.broke, carts: this.carts, quest: this.q, timeout: this.time >= TIME_LIMIT };
  }
  toggleLock() { this.lock = !this.lock; sfx('ui'); }

  frame(rdt) {
    if (this.paused) { this.r.render(this.scene, this.cam); return; }
    rdt = Math.min(rdt, .05); this.clock += rdt;
    if (this.in.take('lock')) this.toggleLock();
    if (this.in.take('pause')) { this.ui.pause(); return; }
    let dt = rdt; if (this.stop > 0) { this.stop -= rdt; dt = 0; } else if (this.slow > 0) { this.slow -= rdt; dt *= .28; }
    if (dt > 0) {
      if (!this.over) { this.time += dt; if (this.time >= TIME_LIMIT) { this.ui.toast('timeout', 'bad'); this.finish(false, 2); } }
      this.updPlayer(dt); this.updMon(dt); this.updProjs(dt);
      for (const q of this.parts) if (q.life > 0) { q.life -= dt; q.vy -= q.g * dt; const o = q.m.position; o.x += q.vx * dt; o.y += q.vy * dt; o.z += q.vz * dt; if (o.y < .05) { o.y = .05; q.vy *= -.3; } const k = q.life / q.max; q.m.scale.setScalar(Math.max(.01, k) * 1.2); q.m.rotation.x += dt * 9; if (q.life <= 0) q.m.visible = false; }
      this.arena.update(dt, this.clock);
    }
    this.syncModels(dt); this.updCam(rdt); this.updHud();
    if (!this.skipRender) this.r.render(this.scene, this.cam);
    if (this.over) { this.endT -= rdt; if (this.endT <= 0 && !this.ended) { this.ended = true; sfx(this.win ? 'win' : 'fail'); this.onEnd(this.result()); } }
  }

  // ---------- presentation ----------
  syncModels(dt) {
    const p = this.p, H = this.H, m = this.m, G = this.G, d = this.def.dims, t = this.clock, kf = dt > 0 ? 1 - Math.exp(-16 * dt) : 1;
    // hunter
    const P = { arx: -.25, alx: 0, ty: 0, tx: 0, ll: 0, lr: 0, hy: .92, hrx: 0 }; let direct = false;
    if (p.state === 'idle' && p.moving) { const s = Math.sin(p.walk * 2.4); P.ll = s * .8; P.lr = -s * .8; P.alx = -s * .6; P.arx = -.35 + s * .2; P.tx = .12 * p.moving; }
    else if (p.state === 'atk') {
      const a = p.cur, w = clamp(p.t / a.h0, 0, 1), b = clamp((p.t - a.h0) / (a.h1 - a.h0 + .07), 0, 1); direct = true;
      if (a.sw === 'v') { P.arx = p.t < a.h0 ? lerp(-.3, -2.9, w) : lerp(-2.9, .5, ease(b)); P.tx = p.t < a.h0 ? lerp(0, -.25, w) : lerp(-.25, .45, ease(b)); if (this.wt === 'db') P.alx = P.arx; P.ll = .4; P.lr = -.3; }
      else if (a.sw === 'h' || a.sw === 'h2') { const sg = a.sw === 'h' ? 1 : -1; P.arx = -1.5; if (this.wt === 'db') P.alx = -1.5; P.ty = sg * (p.t < a.h0 ? lerp(0, -1.2, w) : lerp(-1.2, 1.3, ease(b))); P.ll = .35; P.lr = -.35; }
      else if (a.sw === 'spin') { P.arx = -1.5; P.alx = -1.5; P.tx = .2; }
      else { P.alx = -1.55; P.arx = p.t < a.h0 ? -1.2 : -1.5; P.ty = -.35; }
    } else if (p.state === 'charge') {
      if (this.wt === 'bow') { P.alx = -1.55; P.arx = -1.15; P.ty = -.35; } else { P.arx = -2.9 + Math.sin(t * 40) * .03 * p.clv; P.tx = -.28; }
      P.ll = .3; P.lr = -.3; P.hy = .86;
    } else if (p.state === 'roll') { P.hrx = p.t / .62 * TAU; P.hy = .55; P.arx = -1; P.alx = -1; P.ll = -1.2; P.lr = -1.2; direct = true; }
    else if (p.state === 'drink') { P.alx = -2.5; P.tx = -.2; }
    else if (p.state === 'hit') { P.tx = -.5; P.arx = .4; P.alx = .4; }
    else if (p.state === 'stun') { P.arx = -2.7; P.alx = -2.7; P.tx = .25; P.ty = Math.sin(t * 30) * .1; }
    else if (p.state === 'down' || p.state === 'dead') { const up = p.state === 'down' ? clamp((p.t - .8) / .35, 0, 1) : 0; P.hrx = -PI / 2 * (1 - up); P.hy = lerp(.3, .92, up); P.arx = -.6; P.alx = -.6; }
    const hp = this.hpose || (this.hpose = Object.assign({}, P)), kk = direct ? 1 : kf;
    for (const k in P) hp[k] = k === 'hrx' && (p.state === 'roll' || !direct && Math.abs(hp[k]) > 3) ? P[k] : lerp(hp[k], P[k], kk);
    H.root.position.set(p.x, 0, p.z); H.root.rotation.y = p.yaw + p.spin;
    H.hips.position.y = hp.hy; H.hips.rotation.x = hp.hrx; H.torso.rotation.set(hp.tx, hp.ty, 0);
    H.armR.rotation.x = hp.arx; H.armL.rotation.x = hp.alx; H.legL.rotation.x = hp.ll; H.legR.rotation.x = hp.lr;
    H.elbows.forEach((e,i)=>{e.rotation.x = p.state === 'charge' ? -.45 : -.12-Math.abs(i ? hp.alx : hp.arx)*.14;}); H.knees.forEach((k,i)=>{k.rotation.x = Math.max(0,-(i ? hp.lr : hp.ll))*.65;});
    H.root.visible = !(p.inv > 0 && p.state !== 'roll' && Math.floor(t * 20) % 2 === 0);
    // monster
    const T = Object.assign({}, this.hp0), A = m.atk, er = m.enr ? .85 : 1; let legAmp = m.moving ? .55 : 0, legF = 1.7, flail = 0, tailWag = .12;
    if (m.state === 'idle') { T.headRx = .32 + Math.sin(t * 1.3) * .08; }
    else if (m.state === 'roar') { const k = m.t > .35 && m.t < 1.45; T.bodyRx = -.22; T.headRx = k ? -.75 : -.2; T.jaw = k ? .9 : .1; T.tailLift = .3; }
    else if (m.state === 'flinch') { T.headRx = -.45 + Math.sin(t * 26) * .12; T.bodyRz = Math.sin(t * 22) * .08; T.jaw = .4; }
    else if (m.state === 'topple' || m.state === 'dead') { const side = 1.3; T.bodyRz = side; T.bodyY = -(d.h - d.bw * .85); T.headRx = .2; T.jaw = m.state === 'dead' ? .5 : .3; flail = m.state === 'topple' && m.t < m.dur - .5 ? 1 : 0; tailWag = flail ? .3 : 0; }
    else if (m.state === 'atk' && A) {
      const W = A.w * er, wind = m.t < W, act = !wind && m.t < W + A.a, k = m.ak;
      if (k === 'bite') { if (wind) { T.headZ = -.55; T.headRx = -.3; T.jaw = .7; } else if (act) { T.headZ = 1.2; T.headRx = .2; } }
      else if (k === 'sweep') { if (wind) { T.bodyY = -.25; T.tailCurl = .32; T.headRx = .2; } else if (act) { T.tailCurl = -.12; T.tailLift = .08; } }
      else if (k === 'stomp') { if (wind) { T.bodyRx = -.55; T.bodyY = .55; T.headRx = -.2; } else { T.bodyRx = .14; T.bodyY = -.22; } }
      else if (k === 'charge') { T.headRx = .5; T.bodyY = -.18; if (wind) { G.legs[0].rotation.x = Math.sin(t * 15) * .55; } else if (act) { legAmp = .9; legF = 1.2; } }
      else if (k === 'leap') { if (wind) { T.bodyY = -.5; T.bodyRx = .14; } else if (act) { T.bodyRx = lerp(-.4, .35, (m.t - W) / A.a); legAmp = 0; flail = .4; } else { T.bodyY = -.35; } }
      else if (k === 'spit' || k === 'fireball') { if (wind) { T.headRx = -.6; T.jaw = .7; T.headZ = -.3; } else if (act) { T.headRx = .12; T.jaw = .95; T.headZ = .4; } }
      else if (k === 'breath') { if (wind) { T.headRx = -.5; T.jaw = .5; } else if (act) { T.headRx = .1 + Math.sin(t * 9) * .05; T.jaw = 1.0; } }
    }
    const mp = this.mp, mk = dt > 0 ? 1 - Math.exp(-13 * dt) : 1; for (const k in T) mp[k] = lerp(mp[k], T[k], mk);
    G.root.position.set(m.x, m.y, m.z); G.root.rotation.y = m.yaw + m.spin;
    const bob = m.moving ? Math.abs(Math.sin(m.walk * legF)) * .12 : Math.sin(t * 1.6) * .03;
    G.body.position.y = d.h + mp.bodyY + bob; G.body.rotation.set(mp.bodyRx, 0, mp.bodyRz);
    G.head.position.z = d.headZ - .7 + mp.headZ; G.head.rotation.x = mp.headRx; G.jaw.rotation.x = mp.jaw;
    G.legs.forEach((l, i) => { if (m.state === 'atk' && m.ak === 'charge' && m.t < m.atk.w * er && i === 0) return; const ph = G.legs.length === 2 ? i * PI : (i === 0 || i === 3) ? 0 : PI; l.rotation.x = flail ? Math.sin(t * 13 + i * 1.7) * .5 * flail : Math.sin(m.walk * legF + ph) * legAmp; });
    G.knees.forEach((k,i)=>{k.rotation.x = Math.max(0,Math.sin(m.walk*legF + (i%2)*PI)) * legAmp*.65 + (m.state === 'atk' && m.ak === 'leap' ? .4 : 0);});
    G.tail.forEach((sg, i) => { sg.rotation.y = Math.sin(t * 1.6 + i * .6) * tailWag + mp.tailCurl; sg.rotation.x = mp.tailLift + (i === 0 ? .05 : .03); });
    G.wings.forEach((w, i) => { w.rotation.x = Math.sin(t * 2) * .08 + (m.state === 'roar' ? -.4 : m.state === 'atk' ? -.2 : .05); w.rotation.z = (i ? -1 : 1) * (m.moving ? Math.sin(m.walk*legF)*.12 : .04); });
    G.eyeMat.emissive.setHex(m.enr ? 0xff2200 : G.eyeCol); G.eyeMat.emissiveIntensity = m.state === 'dead' ? 0 : m.enr ? 2.4 : 1.2;
    if (m.enr && dt > 0 && Math.random() < .3) { const [x, z] = this.mPt(0, d.headZ + .8); this.burst(this.def.proj === 'ice' ? 'ice' : 'fire', x, d.h * this.def.scale, z, 1, 1.2, .5, -3); }
    this.lockRing.visible = this.lock && m.state !== 'dead'; this.lockRing.position.x = m.x; this.lockRing.position.z = m.z; this.lockRing.scale.setScalar(d.hz * this.def.scale * 1.15); this.lockRing.rotation.y = t * .8;
  }
  updCam(dt, snap) {
    const p = this.p, m = this.m, lk = this.in.takeLook(), sens = this.in.isTouch ? .0052 : .0026;
    this.cy -= lk.x * sens; this.cp = clamp(this.cp + lk.y * sens, .06, 1.15);
    let dist = this.cd;
    if (this.lock && m.state !== 'dead') { const dm = Math.hypot(m.x - p.x, m.z - p.z); if (dm > 2.5) this.cy = turn(this.cy, Math.atan2(m.x - p.x, m.z - p.z), 3.2 * dt * (Math.abs(lk.x) > 0 ? 0 : 1)); dist += clamp(dm * .12, 0, 3.5); }
    const tk = snap ? 1 : 1 - Math.exp(-11 * dt); this.ct.x = lerp(this.ct.x, p.x, tk); this.ct.z = lerp(this.ct.z, p.z, tk);
    const fx = Math.sin(this.cy), fz = Math.cos(this.cy), ch = Math.cos(this.cp), sh = this.shake; this.shake = Math.max(0, this.shake - dt * 2.4);
    this.cam.position.set(this.ct.x - fx * dist * ch + (Math.random() - .5) * sh * .5, 1.7 + dist * Math.sin(this.cp) + (Math.random() - .5) * sh * .5, this.ct.z - fz * dist * ch);
    this.cam.lookAt(this.ct.x + fx * 2.5, 1.9, this.ct.z + fz * 2.5);
    this.sun.target.position.set(p.x, 0, p.z); this.sun.position.set(p.x + 16, 30, p.z + 10);
  }
  updHud() {
    const p = this.p, m = this.m, e = this.ui.el, left = Math.max(0, TIME_LIMIT - this.time);
    e.hp.style.width = (p.hp / p.maxHp * 100) + '%'; e.hpHeal.style.width = (Math.min(p.maxHp, p.hp + p.healLeft) / p.maxHp * 100) + '%';
    e.st.style.width = p.st + '%'; e.mon.style.width = (m.hp / m.maxHp * 100) + '%';
    e.timer.textContent = Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0');
    e.potions.textContent = p.potions; e.carts.textContent = (MAX_CARTS - this.carts);
    e.rage.hidden = !m.enr; e.lock.classList.toggle('on', this.lock);
    const ch = p.state === 'charge'; e.charge.hidden = !ch; if (ch) { const fr = clamp(p.t / this.W.heavy.charge, 0, 1); e.chargeFill.style.width = fr * 100 + '%'; e.chargeFill.className = 'lv' + Math.floor(fr * 3 + .001); }
  }
  resize(w, h) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  dispose() { this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((x) => x.dispose()); } }); }
}

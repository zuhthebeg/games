// Beast Hunt — presentation and browser adapter. Combat lives in sim.js.
import * as THREE from 'three';
import { WTYPES, TIME_LIMIT, MAX_CARTS } from 'bh/data';
import { Sim, R_ARENA } from './sim.js?v=20261112r3fix';
import { FixedClock, interpolatePose } from './fixed.js?v=20261112r3fix';
import { buildHunter, buildMonster, buildArena } from 'bh/models';
import { sfx } from 'bh/audio';

export { R_ARENA };
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };
const turn = (a, b, max) => { const d = angDiff(b, a); return a + clamp(d, -max, max); };
const ease = (k) => k * k * (3 - 2 * k);

const PCOL = { spark: 0xffe27a, weak: 0xff9a2a, dust: 0xb9a888, fire: 0xff7a1e, ice: 0x9fe8ff, heal: 0x7dffa0, blood: 0xd8433a };

export class Hunt {
  constructor(renderer, quest, save, ui, input, onEnd, session = null) {
    this.r = renderer; this.q = quest; this.save = save; this.ui = ui; this.in = input; this.onEnd = onEnd;
    this.session = session; this.sim = session?.sim || new Sim(quest, save, crypto.getRandomValues(new Uint32Array(1))[0]);
    this.localId = this.sim.players[0].id;
    // Compatibility aliases for the HUD and existing __bh debug consumers.
    for (const key of ['q','def','hr','m','time','carts','over','win','endT','ended','stop','slow','clock','dmgDealt','projs','arrows'])
      Object.defineProperty(this, key, { get: () => this.sim[key], set: value => { this.sim[key] = value; } });
    this.ticker = new FixedClock(); this.previous = this.sim.snapshot();
    const d = this.def;
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
    this.hp0 = { headRx: 0, headZ: 0, jaw: 0, bodyY: 0, bodyRx: 0, bodyRz: 0, tailCurl: 0, tailLift: 0 };
    this.mp = Object.assign({}, this.hp0);
    this.cy = 0; this.cp = .32; this.cd = input.isTouch ? 11 : 9.5; this.ct = new THREE.Vector3(0, 1.7, -30); this.shake = 0;
    this.paused = false; this.buildFx();
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

  get p() { return this.sim.players.find(p => p.id === this.localId); }
  get wt() { return this.p.weapon; }
  get W() { return WTYPES[this.wt]; }
  get lock() { return this.p.lock; }
  set lock(value) { this.p.lock = value; }
  mYaw() { return this.sim.mYaw(); }
  mPt(...args) { return this.sim.mPt(...args); }
  mParts() { return this.sim.mParts(); }
  sweepR() { return this.sim.sweepR(); }
  command(name, ...args) { this.sim.activeId = this.localId; const result = this.sim[name](...args); this.presentEvents(); return result; }
  hitMonster(...args) { return this.command('hitMonster', ...args); }
  meleeHit(...args) { return this.command('meleeHit', ...args); }
  hurt(...args) { return this.command('hurt', ...args); }
  toggleLock() { this.in.press('lock'); this.in.release('lock'); }
  presentEvents(events = this.sim.drainEvents()) {
    for (const e of events) {
      switch (e.type) {
        case 'sound': sfx(e.name); break;
        case 'toast': this.ui.toast(e.key, e.kind); break;
        case 'flash': this.ui.flash(); break;
        case 'hit': this.ui.dmg(new THREE.Vector3(e.x,e.y,e.z).project(this.cam),e.damage,e.cls); break;
        case 'shake': this.shake = Math.max(this.shake,e.amount); break;
        case 'burst': this.burst(...e.args); break;
        case 'chanceBurst': if (Math.random() < e.chance) this.burst(...e.args); break;
        case 'jet': { const args = [...e.args]; args[5] = 16 + Math.random()*8; this.jet(...args); break; }
        case 'hideTele': this.hideTele(); break;
        case 'telegraph': this.showTele(...e.args); break;
        case 'respawn': if (e.playerId === this.localId) this.cy = 0; break;
        case 'break': this.breakVisual(e.part); break;
        case 'result': sfx(e.result.win ? 'win' : 'fail'); this.onEnd(e.result); break;
      }
    }
  }
  breakVisual(part) {
    const G = this.G;
    if (part === 'head') {
      G.horns.forEach(h => { h.scale.set(.85,.24,.85); h.material = G.brokenHornMat; });
      const [x,z] = this.mPt(0,this.def.dims.headZ); this.burst('dust',x,2,z,16,6,.7);
    } else {
      const seg = G.tail[1] || G.tail[0]; this.scene.attach(seg); seg.position.y = .45*this.def.scale;
      seg.rotation.set(0,seg.rotation.y,.4); this.cutTail = seg; G.tail.length = 1;
      const [x,z] = this.mPt(0,-this.def.dims.hz-1); this.burst('blood',x,1.5,z,18,6,.7);
    }
  }
  syncProjectiles(alpha) {
    for (const [items,pool,old,arrow] of [[this.projs,this.projPool,this.previous.projs,false],[this.arrows,this.arrowPool,this.previous.arrows,true]]) {
      pool.forEach(mesh => { mesh.visible = false; });
      items.forEach((q,i) => {
        const mesh = pool[i], before = old.find(p => p.id === q.id) || q;
        mesh.visible = true; mesh.position.set(lerp(before.x,q.x,alpha),arrow ? 1.45 : lerp(before.y || 1.1,q.y || 1.1,alpha),lerp(before.z,q.z,alpha));
        if (arrow) { mesh.rotation.y = q.yaw; mesh.scale.set(1+q.frac*1.5,1+q.frac*1.5,1+q.frac*.6); }
        else { mesh.material.color.setHex(q.kind === 'fire' ? 0xff8a2a : 0xa8ecff); mesh.scale.setScalar(q.rad); }
      });
    }
  }
  hideTele() { for (const k in this.tele) this.tele[k].visible = false; }
  showTele(kind, x, z, yaw, sx, sz, k) { const t = this.tele[kind]; t.visible = true; t.position.x = x; t.position.z = z; t.rotation.y = yaw; t.scale.set(sx, 1, sz); t.material.opacity = .12 + .38 * clamp(k, 0, 1); }


  frame(rdt) {
    if (this.paused && !this.session) { this.ticker.reset(); if (!this.skipRender) this.r.render(this.scene,this.cam); return; }
    if (this.in.take('pause')) { this.ui.pause(); if (!this.session) { this.ticker.reset(); return; } }
    // Camera input belongs to presentation, and only its yaw enters tick commands.
    this.updCam(rdt);
    this.ticker.advance(rdt, () => {
      this.previous = this.sim.snapshot();
      if (this.session) this.presentEvents(this.session.tick(this.in.sample(this.cy), performance.now()));
      else { this.sim.step({ [this.localId]: this.in.sample(this.cy) }); this.presentEvents(); }
    });
    const dt = this.stop > 0 ? 0 : this.slow > 0 ? rdt*.28 : rdt;
    for (const q of this.parts) if (q.life > 0) { q.life -= dt; q.vy -= q.g * dt; const o = q.m.position; o.x += q.vx * dt; o.y += q.vy * dt; o.z += q.vz * dt; if (o.y < .05) { o.y = .05; q.vy *= -.3; } const k = q.life / q.max; q.m.scale.setScalar(Math.max(.01, k) * 1.2); q.m.rotation.x += dt * 9; if (q.life <= 0) q.m.visible = false; }
    this.arena.update(dt,this.clock); this.syncModels(dt);
    const alpha = this.ticker.alpha;
    const p0 = this.previous.players.find(p => p.id === this.localId) || this.p;
    const p = interpolatePose(p0,this.p,alpha), m = interpolatePose(this.previous.m,this.m,alpha);
    this.H.root.position.set(p.x,0,p.z); this.H.root.rotation.y = p.yaw + p.spin;
    this.G.root.position.set(m.x,m.y,m.z); this.G.root.rotation.y = m.yaw + m.spin;
    this.syncProjectiles(alpha); this.updHud(); this.session?.render?.(this, rdt);
    if (!this.skipRender) this.r.render(this.scene,this.cam);
  }

  // ---------- presentation ----------
  syncModels(dt) {
    const p = this.p, H = this.H, m = this.m, G = this.G, d = this.def.dims, t = this.clock, kf = dt > 0 ? 1 - Math.exp(-16 * dt) : 1;
    this.syncHunter(p, H, dt);
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
  syncHunter(p, H, dt, cache = this) {
    const t = this.clock, kf = dt > 0 ? 1 - Math.exp(-16 * dt) : 1;
    // hunter
    const P = { arx: -.25, alx: 0, ty: 0, tx: 0, ll: 0, lr: 0, hy: .92, hrx: 0 }; let direct = false;
    if (p.state === 'idle' && p.moving) { const s = Math.sin(p.walk * 2.4); P.ll = s * .8; P.lr = -s * .8; P.alx = -s * .6; P.arx = -.35 + s * .2; P.tx = .12 * p.moving; }
    else if (p.state === 'atk') {
      const a = p.cur, w = clamp(p.t / a.h0, 0, 1), b = clamp((p.t - a.h0) / (a.h1 - a.h0 + .07), 0, 1); direct = true;
      if (a.sw === 'v') { P.arx = p.t < a.h0 ? lerp(-.3, -2.9, w) : lerp(-2.9, .5, ease(b)); P.tx = p.t < a.h0 ? lerp(0, -.25, w) : lerp(-.25, .45, ease(b)); if (p.weapon === 'db') P.alx = P.arx; P.ll = .4; P.lr = -.3; }
      else if (a.sw === 'h' || a.sw === 'h2') { const sg = a.sw === 'h' ? 1 : -1; P.arx = -1.5; if (p.weapon === 'db') P.alx = -1.5; P.ty = sg * (p.t < a.h0 ? lerp(0, -1.2, w) : lerp(-1.2, 1.3, ease(b))); P.ll = .35; P.lr = -.35; }
      else if (a.sw === 'spin') { P.arx = -1.5; P.alx = -1.5; P.tx = .2; }
      else { P.alx = -1.55; P.arx = p.t < a.h0 ? -1.2 : -1.5; P.ty = -.35; }
    } else if (p.state === 'charge') {
      if (p.weapon === 'bow') { P.alx = -1.55; P.arx = -1.15; P.ty = -.35; } else { P.arx = -2.9 + Math.sin(t * 40) * .03 * p.clv; P.tx = -.28; }
      P.ll = .3; P.lr = -.3; P.hy = .86;
    } else if (p.state === 'roll') { P.hrx = p.t / .62 * TAU; P.hy = .55; P.arx = -1; P.alx = -1; P.ll = -1.2; P.lr = -1.2; direct = true; }
    else if (p.state === 'drink') { P.alx = -2.5; P.tx = -.2; }
    else if (p.state === 'hit') { P.tx = -.5; P.arx = .4; P.alx = .4; }
    else if (p.state === 'stun') { P.arx = -2.7; P.alx = -2.7; P.tx = .25; P.ty = Math.sin(t * 30) * .1; }
    else if (p.state === 'down' || p.state === 'dead') { const up = p.state === 'down' ? clamp((p.t - .8) / .35, 0, 1) : 0; P.hrx = -PI / 2 * (1 - up); P.hy = lerp(.3, .92, up); P.arx = -.6; P.alx = -.6; }
    const hp = cache.hpose || (cache.hpose = Object.assign({}, P)), kk = direct ? 1 : kf;
    for (const k in P) hp[k] = k === 'hrx' && (p.state === 'roll' || !direct && Math.abs(hp[k]) > 3) ? P[k] : lerp(hp[k], P[k], kk);
    H.root.position.set(p.x, 0, p.z); H.root.rotation.y = p.yaw + p.spin;
    H.hips.position.y = hp.hy; H.hips.rotation.x = hp.hrx; H.torso.rotation.set(hp.tx, hp.ty, 0);
    H.armR.rotation.x = hp.arx; H.armL.rotation.x = hp.alx; H.legL.rotation.x = hp.ll; H.legR.rotation.x = hp.lr;
    H.elbows.forEach((e,i)=>{e.rotation.x = p.state === 'charge' ? -.45 : -.12-Math.abs(i ? hp.alx : hp.arx)*.14;}); H.knees.forEach((k,i)=>{k.rotation.x = Math.max(0,-(i ? hp.lr : hp.ll))*.65;});
    H.root.visible = !(p.inv > 0 && p.state !== 'roll' && Math.floor(t * 20) % 2 === 0);
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

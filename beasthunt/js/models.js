// Beast Hunt — procedural low-poly models (no external art assets).
import * as THREE from 'three';
import { MONSTERS } from 'bh/data';

const M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, flatShading: true, roughness: .9, metalness: 0 }, o || {}));
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o; };
const G = (x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); return g; };
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, ws = 7, hs = 5) => new THREE.SphereGeometry(r, ws, hs);
const cone = (r, h, s = 5) => new THREE.ConeGeometry(r, h, s);

export const ARMOR_COL = [0x8b7355, 0x7a4b2c, 0x9cc9e3, 0xb23a22, 0x4b3a78];
export const WPN_COL = [0xc3c7cf, 0xd9b77c, 0x9fe4ff, 0xff8440, 0xc79bff];

export function buildHunter(wt, wTier, aTier) {
  const root = G();
  const am = M(ARMOR_COL[aTier - 1]), dark = M(0x2d2a26), skin = M(0xe2b48c);
  const trim = M(aTier >= 5 ? 0xe8c35a : 0x5a544c, { metalness: .5, roughness: .45 });
  const hips = G(0, .92, 0); root.add(hips);
  const torso = G(); hips.add(torso);
  torso.add(mesh(box(.62, .62, .38), am, 0, .38, 0));
  torso.add(mesh(box(.66, .14, .42), trim, 0, .08, 0));
  torso.add(mesh(box(.5, .5, .1), dark, 0, .4, -.22)); // back plate
  const head = G(0, .88, 0); torso.add(head);
  head.add(mesh(sph(.2), skin));
  const helm = mesh(sph(.235, 7, 4), am, 0, .06, -.03); helm.scale.set(1, .85, 1); head.add(helm);
  const plume = mesh(cone(.07, .32, 4), trim, 0, .3, -.08); plume.rotation.x = -.5; head.add(plume);
  const mkArm = (s) => {
    const a = G(s * .41, .62, 0);
    a.add(mesh(box(.17, .6, .19), am, 0, -.28, 0)); a.add(mesh(sph(.14, 6, 4), trim));
    const hand = G(0, -.6, 0); a.add(hand); torso.add(a); return { a, hand };
  };
  const R = mkArm(-1), L = mkArm(1);
  const mkLeg = (s) => {
    const l = G(s * .17, 0, 0);
    l.add(mesh(box(.23, .5, .26), dark, 0, -.26, 0)); l.add(mesh(box(.25, .42, .3), am, 0, -.7, .02));
    hips.add(l); return l;
  };
  const legL = mkLeg(1), legR = mkLeg(-1);
  const wc = WPN_COL[wTier - 1];
  const wm = M(wc, { metalness: .55, roughness: .35, emissive: wTier >= 3 ? wc : 0x000000, emissiveIntensity: wTier >= 3 ? .35 : 0 });
  const grip = M(0x3b2b1c);
  if (wt === 'gs') {
    const w = G(); w.rotation.x = -1.25;
    w.add(mesh(box(.08, .5, .08), grip)); w.add(mesh(box(.5, .09, .13), trim, 0, -.28, 0));
    w.add(mesh(box(.27, 2.0, .07), wm, 0, -1.33, 0));
    const tip = mesh(cone(.19, .36, 4), wm, 0, -2.5, 0); tip.rotation.x = Math.PI; tip.scale.z = .3; w.add(tip);
    R.hand.add(w);
  } else if (wt === 'db') {
    for (const h of [R.hand, L.hand]) {
      const w = G(); w.rotation.x = -1.3;
      w.add(mesh(box(.07, .26, .07), grip)); w.add(mesh(box(.2, .06, .1), trim, 0, -.15, 0));
      w.add(mesh(box(.13, .9, .05), wm, 0, -.62, 0)); h.add(w);
    }
  } else {
    const g = new THREE.TorusGeometry(.78, .04, 5, 14, Math.PI); g.rotateX(Math.PI); g.rotateY(Math.PI / 2);
    const b = mesh(g, wm, 0, .5, 0); L.hand.add(b);
    const str = mesh(box(.015, .015, 1.56), M(0xeeeeee), 0, .5, 0); L.hand.add(str);
    const quiver = mesh(box(.16, .55, .16), grip, .12, .45, -.3); quiver.rotation.z = .3; torso.add(quiver);
  }
  return { root, hips, torso, head, armR: R.a, armL: L.a, legL, legR };
}

export function buildMonster(id) {
  const d = MONSTERS[id].dims, root = G(), body = G(0, d.h, 0); root.add(body);
  const C = {
    boar: { a: 0x5a4334, b: 0x8a6e52, c: 0xe9dfc6, eye: 0xffd24a },
    frost: { a: 0xdcecf6, b: 0x4f8fc7, c: 0x9fe8ff, eye: 0x7fe9ff },
    ember: { a: 0x7b211b, b: 0x2a1614, c: 0xff8a2a, eye: 0xffb23a },
  }[id];
  const ma = M(C.a), mb = M(C.b), eyeMat = M(0x111111, { emissive: C.eye, emissiveIntensity: 1.2 });
  const mc = M(C.c, id === 'boar' ? {} : { emissive: C.c, emissiveIntensity: id === 'ember' ? .9 : .45 });
  const trunk = mesh(sph(1, 9, 6), ma); trunk.scale.set(d.bw, d.bh, d.hz); body.add(trunk);
  const belly = mesh(sph(1, 8, 5), id === 'ember' ? mc : mb, 0, -d.bh * .28, .1); belly.scale.set(d.bw * .8, d.bh * .7, d.hz * .85); body.add(belly);
  const hump = mesh(sph(1, 7, 5), ma, 0, d.bh * .45, d.hz * .35); hump.scale.set(d.bw * .8, d.bh * .7, d.hz * .5); body.add(hump);
  // head
  const head = G(0, .05, d.headZ - .7); body.add(head);
  const hs = id === 'boar' ? 1.1 : 1;
  const neck = mesh(sph(.8, 6, 5), ma, 0, 0, -.5); neck.scale.set(1, 1, 1.5); head.add(neck);
  head.add(mesh(box(1.25 * hs, 1.05 * hs, 1.3), ma, 0, .05, .5));
  head.add(mesh(box(.85 * hs, .55, .9), mb, 0, .05, 1.45));
  const jaw = G(0, -.38, .45); head.add(jaw); jaw.add(mesh(box(.8 * hs, .26, 1.5), mb, 0, -.1, .6));
  for (const s of [-1, 1]) {
    head.add(mesh(sph(.13, 5, 4), eyeMat, s * .55 * hs, .32, .95));
    const tooth = mesh(cone(.09, .34, 4), M(0xf2ead8), s * .3, -.3, 1.7); tooth.rotation.x = Math.PI; head.add(tooth);
  }
  const horns = [];
  const addHorn = (g, m, x, y, z, rx, rz) => { const h = mesh(g, m, x, y, z); h.rotation.set(rx, 0, rz); head.add(h); horns.push(h); return h; };
  if (id === 'boar') {
    for (const s of [-1, 1]) { addHorn(cone(.17, 1.25, 5), M(C.c), s * .72, -.1, 1.55, .9, -s * .45); const ear = mesh(cone(.2, .45, 4), ma, s * .55, .75, .1); head.add(ear); }
    for (let i = 0; i < 7; i++) { const sp = mesh(cone(.2, .9 - i * .06, 4), mb, 0, d.bh * .95 - i * .04, d.hz * .7 - i * .55); sp.rotation.x = -.35; body.add(sp); }
  } else if (id === 'frost') {
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const sp = mesh(cone(.16, 1.2, 4), mc, Math.cos(a) * .85, Math.sin(a) * .8, -.45); sp.rotation.set(-1.1 * Math.sin(a) - .2, 0, -a + Math.PI / 2 - Math.PI / 2); sp.lookAt(Math.cos(a) * 3, Math.sin(a) * 3, -2.4); sp.rotateX(Math.PI / 2); head.add(sp); }
    for (const s of [-1, 1]) addHorn(cone(.13, 1.0, 4), mc, s * .5, .8, .2, -.7, -s * .3);
    for (let i = 0; i < 5; i++) { const sp = mesh(cone(.22, 1.0, 4), mc, 0, d.bh * .9, d.hz * .5 - i * .75); sp.rotation.x = -.5; body.add(sp); }
  } else {
    for (const s of [-1, 1]) { addHorn(cone(.2, 1.7, 5), M(0x1b1210), s * .5, .85, -.05, -1.0, -s * .35); addHorn(cone(.12, .7, 4), M(0x1b1210), s * .62, .2, 1.2, .5, -s * .7); }
    for (let i = 0; i < 6; i++) { const sp = mesh(cone(.24, 1.1 - i * .08, 4), mb, 0, d.bh * .95, d.hz * .6 - i * .7); sp.rotation.x = -.5; body.add(sp); }
  }
  // wings (ember only, decorative)
  const wings = [];
  if (id === 'ember') {
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(3.4, 1.5); sh.lineTo(3.0, .2); sh.lineTo(2.3, -.5); sh.lineTo(1.5, -.2); sh.lineTo(.9, -.8); sh.lineTo(0, -.3);
      const wg = new THREE.ShapeGeometry(sh);
      const w = new THREE.Mesh(wg, M(0x3a1512, { side: THREE.DoubleSide })); w.castShadow = true;
      const pv = G(s * d.bw * .6, d.bh * .7, d.hz * .25); pv.rotation.y = s > 0 ? -.25 : Math.PI + .25; pv.rotation.z = s > 0 ? .5 : -.5;
      pv.add(w); pv.add(mesh(box(3.5, .12, .12), mb, 1.7, .75, 0).rotateZ(.42)); body.add(pv); wings.push(pv);
    }
  }
  // tail (nested chain so it can curl and be severed)
  const tail = [], segLen = d.tailLen / d.tailN; let parent = G(0, .1, -d.hz * .88); body.add(parent); const tailRoot = parent;
  for (let i = 0; i < d.tailN; i++) {
    const k = 1 - i / d.tailN * .72, w = d.tailW * 2 * k;
    const sg = G(0, 0, i === 0 ? 0 : -segLen); parent.add(sg);
    sg.add(mesh(box(w, w * .85, segLen * 1.08), i % 2 ? mb : ma, 0, 0, -segLen / 2));
    if (id !== 'boar' && i > 0) { const sp = mesh(cone(w * .3, w * .9, 4), id === 'frost' ? mc : mb, 0, w * .6, -segLen / 2); sg.add(sp); }
    tail.push(sg); parent = sg;
  }
  const tipG = id === 'boar' ? mesh(sph(.3, 5, 4), mb, 0, 0, -segLen) : id === 'frost' ? mesh(cone(.3, 1.1, 4), mc, 0, 0, -segLen - .3) : mesh(sph(.55, 6, 4), mb, 0, 0, -segLen - .2);
  if (id === 'frost') tipG.rotation.x = -Math.PI / 2;
  parent.add(tipG);
  // legs: FL, FR, BL, BR
  const legs = [], py = -d.bh * .3, L = d.h + py;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const lg = G(sx * d.legX * .9, py, sz * d.legZ); body.add(lg);
    lg.add(mesh(box(.62, L * .58, .78), ma, 0, -L * .27, 0));
    lg.add(mesh(box(.44, L * .5, .5), mb, 0, -L * .72, .05));
    lg.add(mesh(box(.6, .22, .85), mb, 0, -L + .11, .16));
    for (const cx of [-.2, 0, .2]) { const cl = mesh(cone(.07, .3, 4), M(0xf2ead8), cx, -L + .1, .62); cl.rotation.x = Math.PI / 2; lg.add(cl); }
    legs.push(lg);
  }
  root.scale.setScalar(MONSTERS[id].scale);
  return { root, body, head, jaw, tail, tailRoot, legs, wings, horns, eyeMat, eyeCol: C.eye };
}

function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }

export const BIOMES = {
  forest: { sky: 0x9cc7d6, fog: [70, 170], g: [0x5d8a3c, 0x6f9a45, 0x7d8f4c], sun: 0xfff1cf, amb: [0xcfe8ff, 0x4a5a32], mote: 0xf5ffb0, far: 0x52706a },
  snow: { sky: 0xc3d6e6, fog: [55, 150], g: [0xeaf2f7, 0xd6e4ee, 0xc2d5e3], sun: 0xeaf4ff, amb: [0xdfeeff, 0x7d8ea0], mote: 0xffffff, far: 0x8ea6bb },
  volcano: { sky: 0x3b2226, fog: [50, 140], g: [0x3c3131, 0x4a3633, 0x2f2727], sun: 0xffb27a, amb: [0x8a5a50, 0x2a1512], mote: 0xff9a3c, far: 0x241416 },
};

export function buildArena(biome, R) {
  const B = BIOMES[biome], group = G();
  const geo = new THREE.PlaneGeometry(190, 190, 60, 60); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(), c2 = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z), n = hash(Math.round(x), Math.round(z));
    if (r > R + 5) pos.setY(i, Math.pow(r - R - 5, 1.25) * .32 + n * 1.6);
    c.setHex(B.g[Math.floor(n * 3) % 3]); c2.setHex(B.g[(Math.floor(n * 7)) % 3]); c.lerp(c2, hash(z, x));
    if (biome === 'volcano' && hash(x * .5, z * .5) > .93) c.setHex(0xff5a1a);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  ground.receiveShadow = true; group.add(ground);
  const dummy = new THREE.Object3D();
  const inst = (g, m, n, fn) => { const im = new THREE.InstancedMesh(g, m, n); for (let i = 0; i < n; i++) { fn(i, dummy); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); } im.castShadow = true; group.add(im); return im; };
  const ring = (i, n, r0, r1) => { const a = i / n * Math.PI * 2 + hash(i, 3) * .5, r = r0 + hash(i, 9) * (r1 - r0); return [Math.cos(a) * r, Math.sin(a) * r, r]; };
  const yAt = (r) => r > R + 5 ? Math.pow(r - R - 5, 1.25) * .32 : 0;
  // boundary stones
  inst(new THREE.DodecahedronGeometry(1, 0), M(biome === 'snow' ? 0x9fb2c2 : biome === 'volcano' ? 0x1e1717 : 0x7c7f78), 56, (i, o) => {
    const [x, z] = ring(i, 56, R + 2, R + 4.5); const s = .8 + hash(i, 1) * 1.6; o.position.set(x, s * .4, z); o.scale.set(s, s * (.7 + hash(i, 2)), s); o.rotation.set(hash(i, 4) * 3, hash(i, 5) * 3, 0);
  });
  if (biome === 'volcano') {
    inst(cone(1, 1, 5), M(0x251b1b), 70, (i, o) => { const [x, z, r] = ring(i, 70, R + 6, 82); const h = 5 + hash(i, 6) * 12; o.position.set(x, yAt(r) + h / 2 - 1, z); o.scale.set(1.5 + hash(i, 7) * 2.5, h, 1.5 + hash(i, 8) * 2.5); o.rotation.set(0, hash(i, 2) * 6, 0); });
    inst(new THREE.OctahedronGeometry(1, 0), M(0xff6a1a, { emissive: 0xff5a10, emissiveIntensity: 1.4 }), 40, (i, o) => { const [x, z, r] = ring(i, 40, R + 4, 70); const s = .4 + hash(i, 5) * .9; o.position.set(x, yAt(r) + s, z); o.scale.set(s, s * 2, s); o.rotation.set(0, hash(i, 1) * 6, hash(i, 3) * .5); });
  } else {
    const snow = biome === 'snow';
    inst(new THREE.CylinderGeometry(.3, .45, 1, 5), M(snow ? 0x4b3a30 : 0x5b4028), 90, (i, o) => { const [x, z, r] = ring(i, 90, R + 6, 84); const h = 3 + hash(i, 6) * 3; o.position.set(x, yAt(r) + h / 2 - .5, z); o.scale.set(1.2, h, 1.2); o.rotation.set(0, 0, 0); });
    for (const [k, yo, sc, colr] of [[0, 1.0, 1, snow ? 0x2f5a4a : 0x2f6b34], [1, 1.75, .72, snow ? 0xe6f0f5 : 0x3d8040]]) {
      inst(cone(1, 1, 6), M(colr), 90, (i, o) => { const [x, z, r] = ring(i, 90, R + 6, 84); const h = 3 + hash(i, 6) * 3, w = (2.2 + hash(i, 7) * 1.4) * sc; o.position.set(x, yAt(r) + h * yo + (k ? .6 : 0), z); o.scale.set(w, h * (k ? 1 : 1.3), w); o.rotation.set(0, hash(i, 2) * 6, 0); });
    }
  }
  // tufts / shards inside the arena (no collision)
  inst(cone(.14, .5, 3), M(biome === 'forest' ? 0x86b356 : biome === 'snow' ? 0xb6cad9 : 0x5a3a34), 220, (i, o) => { const a = hash(i, 11) * 6.283, r = Math.sqrt(hash(i, 12)) * (R + 3); o.position.set(Math.cos(a) * r, .22, Math.sin(a) * r); o.scale.setScalar(.7 + hash(i, 13)); o.rotation.set(hash(i, 14) * .5 - .25, hash(i, 15) * 6, hash(i, 16) * .5 - .25); });
  // far silhouettes
  inst(cone(1, 1, 5), new THREE.MeshBasicMaterial({ color: B.far, fog: true }), 26, (i, o) => { const a = i / 26 * 6.283, r = 118 + hash(i, 21) * 14, h = 30 + hash(i, 22) * 34; o.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r); o.scale.set(24 + hash(i, 23) * 16, h, 24 + hash(i, 24) * 16); o.rotation.set(0, hash(i, 25) * 6, 0); });
  // drifting motes (pollen / snow / embers)
  const N = 260, mp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { mp[i * 3] = (hash(i, 31) - .5) * 110; mp[i * 3 + 1] = hash(i, 32) * 16; mp[i * 3 + 2] = (hash(i, 33) - .5) * 110; }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: B.mote, size: biome === 'snow' ? .22 : .16, transparent: true, opacity: .85, depthWrite: false }));
  group.add(motes);
  const dir = biome === 'volcano' ? 1 : biome === 'snow' ? -1.6 : .25;
  const update = (dt, t) => {
    const a = mg.attributes.position;
    for (let i = 0; i < N; i++) { let y = a.getY(i) + dir * dt * (.6 + (i % 5) * .2); if (y > 16) y = 0; if (y < 0) y = 16; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t * .7 + i) * dt * .4); }
    a.needsUpdate = true;
  };
  return { group, update, B };
}

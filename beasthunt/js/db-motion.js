import * as THREE from 'three';
import { dualBladeClips, whirlwindTurns, groundPivot, groundRecovery } from './motion-authoring.js?v=20261114r11';
// Presentation-only Mixamo one-hand sword clips; h2 is an X-reflected h.
// Timings generated from the bake inventory. Authoritative state stays untouched.
export const DB_CLIPS = {"idle":{"duration":3,"impact":null,"mirrored":false},"walkF":{"duration":0.9,"impact":null,"mirrored":false},"walkB":{"duration":0.6333333333333333,"impact":null,"mirrored":false},"walkL":{"duration":0.7,"impact":null,"mirrored":false},"walkR":{"duration":0.7333333333333333,"impact":null,"mirrored":false},"h":{"duration":1.3,"impact":[0.36666666666666664,0.6],"mirrored":false},"h2":{"duration":1.3,"impact":[0.36666666666666664,0.6],"mirrored":true},"h3":{"duration":1,"impact":[0.3,0.5],"mirrored":false},"v":{"duration":2.2666666666666666,"impact":[0.9,1.2],"mirrored":false},"spin":{"duration":3.1666666666666665,"impact":[0.8333333333333334,2.066666666666667],"mirrored":false},"roll":{"duration":1.6,"impact":null,"mirrored":false},"drink":{"duration":3,"impact":null,"mirrored":false},"hit":{"duration":1.1666666666666667,"impact":null,"mirrored":false},"stun":{"duration":1.6333333333333333,"impact":null,"mirrored":false},"down":{"duration":1.9666666666666666,"impact":null,"mirrored":false},"dead":{"duration":2.566666666666667,"impact":null,"mirrored":false}};
const DB_STATE_SECONDS = { roll: .62, drink: 1.25, hit: .42, stun: 1.25, down: 1.15, dead: 2.3 };
const UNARMED = ['roll', 'drink', 'dead', 'down'];
const Y = new THREE.Vector3(0, 1, 0), V = () => new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;

export function createDbMotion(model, clips, db) {
  const mixer = new THREE.AnimationMixer(model), actions = {};
  for (const source of dualBladeClips(clips)) {
    const a = mixer.clipAction(source); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.paused = true; actions[source.name] = a;
  }
  const bones = {}; model.traverse(o => { if (o.isBone) bones[o.name.replace('mixamorig:', '').replace('mixamorig', '')] = o; });
  const sockets = {}, blades = db;
  for (const side of ['Right','Left']) {
    const hand=bones[side+'Hand'],socket=new THREE.Group(); socket.name='db-'+side+'-hand-socket';
    socket.scale.setScalar(1 / hand.getWorldScale(V()).x); hand.add(socket);
    socket.position.copy(bones[side+'HandMiddle1'].position).multiplyScalar(.5);
    // Model palm-local axes measured from Paladin bind; socket origin is grip.
    socket.quaternion.setFromUnitVectors(Y,new THREE.Vector3(side==='Right'?1:-1,0,0));
    socket.add(blades[side]); sockets[side]=socket;
  }
  const b={model,mixer,actions,bones,sockets,blades,key:null,lastT:0,combo:null,clipTime:0,lastPos:null,idleTime:0,dirW:{walkF:0,walkB:0,walkL:0,walkR:0}};
  return b;
}

export function dbClipName(p) {
  if (p.state === 'atk') return p.cur?.sw==='h' && p.combo===2 ? 'h3' : (p.cur?.sw || 'h');
  if (p.state === 'charge') return 'idle';
  if (p.state === 'idle') return p.moving ? 'walk' : 'idle';
  return Object.hasOwn(DB_STATE_SECONDS, p.state) ? p.state : 'idle';
}
export function dbClipTime(p, name, meta) {
  const end = meta.duration;
  if (p.state === 'idle') return ((p.moving ? (p.walk || 0) / 2.6 : (p.t || 0)) % end + end) % end;
  if (p.state === 'atk' && p.cur) {
    const a = p.cur, t = clamp(p.t, 0, a.dur), [r0, r1] = meta.impact || [.4, .4];
    if (t <= a.h0) return r0 * (t / Math.max(a.h0, 1e-8));
    if (t <= a.h1 && a.h1 > a.h0) return r0 + (r1 - r0) * (t - a.h0) / (a.h1 - a.h0);
    return r1 + (end - r1) * (t - a.h1) / Math.max(a.dur - a.h1, 1e-8);
  }
  if (p.state === 'charge') return 0;
  return end * clamp(p.t / (DB_STATE_SECONDS[p.state] || end), 0, 1);
}

export function syncHunterDb(p, H, dt, clock = 0) {
  const b = H.db; if (!b) return false;
  H.root.position.set(p.x || 0, 0, p.z || 0); H.root.rotation.y = (p.yaw || 0) + (p.state === 'atk' && p.cur?.sw === 'spin' ? whirlwindTurns((p.t-p.cur.h0)/Math.max(1e-8,p.cur.h1-p.cur.h0))*Math.PI*2 : (p.spin || 0));
  H.root.visible = !(p.inv > 0 && p.state !== 'roll' && Math.floor(clock * 20) % 2 === 0);
  const wanted = dbClipName(p), name = wanted === 'walk' ? 'walkF' : wanted, action = b.actions[name], meta = DB_CLIPS[name] || { duration: action ? action.getClip().duration : 1 };
  const restart = b.key !== wanted || p.state === 'atk' && (p.t < b.lastT - .00001 || p.combo !== b.combo);
  if (restart) {
    const immediate = p.state === 'atk' || !b.key;
    for (const a of Object.values(b.actions)) if (a !== action && (immediate || !a._walk)) { if (immediate) { a.stop(); a.enabled=false; a._walk=false; } else a.fadeOut(.1); }
    if (action) {
      action.reset(); action.paused = true; action.enabled = true; action.setEffectiveWeight(1); action.play();
      if (!immediate) action.fadeIn(.1);
    }
    b.key = wanted;
  }
  b.lastT = p.t; b.combo = p.combo;
  let time = dbClipTime(p, name, meta);
  if (p.state === 'idle' && !p.moving) { b.idleTime += Math.max(0, dt); time = b.idleTime % meta.duration; }
  if (wanted === 'walk') {
    // Directional strafe blend from velocity in aim-local frame.
    let f = 0, s = 0;
    if (b.lastPos && dt > 0) {
      const dx = p.x - b.lastPos.x, dz = p.z - b.lastPos.z, d = Math.hypot(dx, dz);
      if (d > 1e-4) { const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw); f = (dx * sy + dz * cy) / d; s = (dx * cy - dz * sy) / d; }
    }
    const w = { walkF: Math.max(0, f), walkB: Math.max(0, -f), walkL: Math.max(0, s), walkR: Math.max(0, -s) };
    const sum = w.walkF + w.walkB + w.walkL + w.walkR || 1;
    for (const k in w) {
      const a = b.actions[k]; if (!a) continue; a._walk = true;
      const target = w[k] / sum, cur = b.dirW[k] + (target - b.dirW[k]) * Math.min(1, dt * 10);
      b.dirW[k] = cur; a.enabled = true; a.setEffectiveWeight(cur);
      if (!a.isRunning()) { a.reset().play(); a.paused = true; }
      a.time = (time / meta.duration) * (DB_CLIPS[k]?.duration || 1);
    }
  } else for (const k in b.dirW) { const a = b.actions[k]; if (a && a._walk) { a.fadeOut(.1); a._walk = false; } b.dirW[k] = 0; }
  if (action && wanted !== 'walk') { action.time = time; b.clipTime = time; } else if (wanted === 'walk') b.clipTime = time;
  b.lastPos = { x: p.x, z: p.z };
  b.mixer.update(Math.max(0, dt));
  groundRecovery(b,{state:'idle'});
  groundPivot(b,p.state==='atk' && p.cur?.sw==='spin');
  groundRecovery(b,p);
  for (const side of ['Right','Left']) b.blades[side].visible=!UNARMED.includes(p.state);
  return true;
}
;
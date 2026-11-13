import * as THREE from 'three';
// Baked source markers (seconds), left-hand-local bow axes and right-hand
// nock samples. Generated from tmp/beasthunt-mixamo-bow/clips.json.
export const BOW_CLIPS = {"idle":{"duration":3.7666666666666666,"impact":null},"walkF":{"duration":1.2,"impact":null},"walkB":{"duration":1.4666666666666666,"impact":null},"walkL":{"duration":1.2,"impact":null},"walkR":{"duration":1.3,"impact":null},"shot":{"duration":1.0666666666666667,"impact":[0.4,0.4]},"charge":{"duration":3.066666666666667,"impact":null,"drawEnd":0.5},"release":{"duration":0.4666666666666667,"impact":[0.06666666666666667,0.1]},"roll":{"duration":1.6333333333333333,"impact":null},"drink":{"duration":3.033333333333333,"impact":null},"hit":{"duration":1.2,"impact":null},"stun":{"duration":1.6666666666666667,"impact":null},"down":{"duration":2.0,"impact":null},"dead":{"duration":2.6,"impact":null}};
const BOW_STATE_SECONDS = { roll: .62, drink: 1.25, hit: .42, stun: 1.25, down: 1.15, dead: 2.3 };
const UNARMED = ['roll', 'drink', 'dead', 'down'];
const Y = new THREE.Vector3(0, 1, 0), V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
const clamp = THREE.MathUtils.clamp;

export function createBowMotion(model, clips, bow) {
  const mixer = new THREE.AnimationMixer(model), actions = {};
  for (const source of clips) {
    const a = mixer.clipAction(source); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.paused = true; actions[source.name] = a;
  }
  const bones = {}; model.traverse(o => { if (o.isBone) bones[o.name.replace('mixamorig:', '').replace('mixamorig', '')] = o; });
  const socket = new THREE.Group(); socket.name = 'bow-left-hand-socket';
  socket.scale.setScalar(1 / bones.LeftHand.getWorldScale(V()).x);
  bones.LeftHand.add(socket); socket.add(bow);
  // Left palm midpoint; bone units are cm, socket children are metres.
  socket.position.copy(bones.LeftHandMiddle1.position).multiplyScalar(.5);
  const low = /[?&]lowfx=1/.test(location.search), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const b = { model, mixer, actions, bones, socket, bow, low, reduced, key: null, lastT: 0, combo: null, clipTime: 0, lastPos: null, idleTime: 0, draw: 0, string: null, nockArrow: null, dirW: { walkF: 0, walkB: 0, walkL: 0, walkR: 0 } };
  return b;
}

function bowClipName(p) {
  if (p.state === 'atk') return (p.cur?.charge > 0 || p.combo === -1) ? 'release' : 'shot';
  if (p.state === 'charge') return 'charge';
  if (p.state === 'idle') return p.moving ? 'walk' : 'idle';
  return Object.hasOwn(BOW_STATE_SECONDS, p.state) ? p.state : 'idle';
}
function bowClipTime(p, name, meta) {
  const end = meta.duration;
  if (p.state === 'idle') return ((p.moving ? (p.walk || 0) / 2.6 : (p.t || 0)) % end + end) % end;
  if (p.state === 'atk' && p.cur) {
    const a = p.cur, t = clamp(p.t, 0, a.dur), [r0, r1] = meta.impact || [.4, .4];
    if (t <= a.h0) return r0 * (t / Math.max(a.h0, 1e-8));
    if (t <= a.h1 && a.h1 > a.h0) return r0 + (r1 - r0) * (t - a.h0) / (a.h1 - a.h0);
    return r1 + (end - r1) * (t - a.h1) / Math.max(a.dur - a.h1, 1e-8);
  }
  if (p.state === 'charge') {
    const de = meta.drawEnd || .5, hold = 1.2, t = clamp(p.t || 0, 0, hold);
    if (t <= .45) return de * (t / .45);
    return de + (end - de) * clamp((t - .45) / (hold - .45), 0, 1);
  }
  return end * clamp(p.t / (BOW_STATE_SECONDS[p.state] || end), 0, 1);
}

// String mesh: two thin links tipTop->nock->tipBottom, plus a nocked arrow.
// The nock tracks the right hand only while the pose projects a real draw —
// idle keeps the string straight like the source animation.
// Units are metres in socket space; constants from tmp/beasthunt-mixamo-bow/clips.json.
const TIP_T = new THREE.Vector3(.22, .62, .02), TIP_B = new THREE.Vector3(.22, -.62, .02), TIP_M = new THREE.Vector3(.22, 0, .02);
const PULL_DIR = new THREE.Vector3(-.786, .472, -.377), AIM_DIR = new THREE.Vector3(.9, .44, .03);
const STR_MAX = 1.34, GRIP_PROJ = .12, DRAW_FULL = .59;
function updateString(b, dt) {
  const g = b.bow;
  if (!b.string) {
    const sm = new THREE.MeshBasicMaterial({ color: 0x2a2118 });
    b.string = { top: new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, 1, 4), sm), bot: new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, 1, 4), sm) };
    b.string.top.name = 'bow-string-t'; b.string.bot.name = 'bow-string-b';
    b.nockArrow = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, 1, 5), new THREE.MeshStandardMaterial({ color: 0xd8c9a8, roughness: .7 }));
    b.nockArrow.name = 'bow-nocked-arrow';
    g.add(b.string.top, b.string.bot, b.nockArrow);
  }
  const sock = b.socket; sock.updateWorldMatrix(true, false);
  const hand = b.bones.RightHand.getWorldPosition(V()).applyMatrix4(sock.matrixWorld.clone().invert());
  const proj = hand.clone().sub(TIP_M).dot(PULL_DIR);
  const held = proj > GRIP_PROJ;
  const target = held ? hand : TIP_M;
  b.nockPos = b.nockPos ? b.nockPos.lerp(target, Math.min(1, dt * (held ? 22 : 14))) : target.clone();
  const nock = b.nockPos;
  const total = TIP_T.distanceTo(nock) + nock.distanceTo(TIP_B);
  if (total > STR_MAX) nock.copy(TIP_M).lerp(nock, STR_MAX / total);
  b.draw = clamp(proj / DRAW_FULL, 0, 1);
  const setLink = (m, a, c) => {
    const d = c.clone().sub(a), len = Math.max(d.length(), 1e-4);
    m.position.copy(a).addScaledVector(d, .5); m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(Y, d.normalize()); m.visible = true;
  };
  setLink(b.string.top, TIP_T, nock); setLink(b.string.bot, TIP_B, nock);
  const ad = b.draw > .1 ? TIP_M.clone().sub(nock).normalize() : AIM_DIR;
  b.nockArrow.position.copy(nock).addScaledVector(ad, .3);
  b.nockArrow.scale.set(1, .62, 1);
  b.nockArrow.quaternion.setFromUnitVectors(Y, ad);
}

export function syncHunterBow(p, H, dt, clock = 0) {
  const b = H.bow; if (!b) return false;
  H.root.position.set(p.x || 0, 0, p.z || 0); H.root.rotation.y = (p.yaw || 0) + (p.spin || 0);
  H.root.visible = !(p.inv > 0 && p.state !== 'roll' && Math.floor(clock * 20) % 2 === 0);
  const wanted = bowClipName(p), name = wanted === 'walk' ? 'walkF' : wanted, action = b.actions[name], meta = BOW_CLIPS[name] || { duration: action ? action.getClip().duration : 1 };
  const restart = b.key !== wanted || p.state === 'atk' && (p.t < b.lastT - .00001 || p.combo !== b.combo);
  if (restart) {
    const immediate = p.state === 'atk' || !b.key;
    for (const a of Object.values(b.actions)) if (a !== action && !a._walk) { if (immediate) a.stop(); else a.fadeOut(.1); }
    if (action) {
      action.reset(); action.paused = true; action.enabled = true; action.setEffectiveWeight(1); action.play();
      if (!immediate) action.fadeIn(.1);
    }
    b.key = wanted;
  }
  b.lastT = p.t; b.combo = p.combo;
  let time = bowClipTime(p, name, meta);
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
      a.time = (time / meta.duration) * (BOW_CLIPS[k]?.duration || 1);
    }
  } else for (const k in b.dirW) { const a = b.actions[k]; if (a && a._walk) { a.fadeOut(.1); a._walk = false; } b.dirW[k] = 0; }
  if (action && wanted !== 'walk') { action.time = time; b.clipTime = time; } else if (wanted === 'walk') b.clipTime = time;
  b.lastPos = { x: p.x, z: p.z };
  b.mixer.update(Math.max(0, dt));
  // Bow limb axis = world up expressed in the left hand frame; the wrist
  // already carries the animation's tilt.
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(b.bones.LeftHand.getWorldQuaternion(Q()).invert()).normalize();
  b.socket.quaternion.setFromUnitVectors(Y, axis);
  b.bow.visible = !UNARMED.includes(p.state);
  if (b.bow.visible) updateString(b, dt);
  return true;
}

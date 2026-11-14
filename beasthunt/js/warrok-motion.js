// Beast Hunt — skinned Warrok boss adapter. Drives GLB clips from authoritative sim state.
// Looping clips free-run; one-shot states seek by sim time so restores and
// interpolation never drift the pose away from the authoritative timeline.
import * as THREE from 'three';

const ATK_CLIP = { bite: 'swipe', stomp: 'smash', sweep: 'spin', charge: 'rush', leap: 'leap', spit: 'cast', fireball: 'cast', breath: 'cast' };
const ONESHOT = { roar: 1, swipe: 1, smash: 1, spin: 1, rush: 1, leap: 1, cast: 1, flinch: 1, topple: 1, dead: 1 };

export function createWarrokMotion(model, clips) {
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const c of clips) {
    const a = mixer.clipAction(c);
    actions[c.name] = a;
  }
  const W = { model, mixer, actions, cur: null, key: '' };

  function show(name, { loop = true, fade = .22, timeScale = 1 } = {}) {
    const a = actions[name];
    if (!a) return null;
    if (W.cur === a && !ONESHOT[name]) { a.timeScale = timeScale; return a; }
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.timeScale = loop ? timeScale : 0;
    if (W.cur && W.cur !== a) { a.play(); W.cur.crossFadeTo(a, fade, false); }
    else a.play();
    W.cur = a;
    return a;
  }

  // m is the interpolated presentation copy of the authoritative monster state.
  W.sync = (m, dt, enraged) => {
    let want = 'idle', dur = 0, oneShot = false;
    if (m.state === 'roar') { want = 'roar'; dur = m.dur || 1.75; oneShot = true; }
    else if (m.state === 'flinch') { want = 'flinch'; dur = m.dur || .95; oneShot = true; }
    else if (m.state === 'topple') { want = 'topple'; dur = m.dur || 4.6; oneShot = true; }
    else if (m.state === 'dead') { want = 'dead'; oneShot = true; dur = 4.6; }
    else if (m.state === 'atk' && m.atk) {
      want = ATK_CLIP[m.ak] || 'swipe';
      const A = m.atk, er = m.enr ? .85 : 1;
      dur = (A.w + A.a + A.r) * er;
      oneShot = true;
    }
    else if (m.state === 'chase' && m.moving) want = enraged ? 'run' : 'walk';
    const key = m.state + ':' + want;
    if (key !== W.key) { W.key = key; W.entered = true; }
    const a = actions[want];
    if (!a) { mixer.update(dt); return; }
    if (oneShot) {
      if (W.cur !== a || W.entered) {
        const clip = a.getClip();
        const ts = Math.max(.25, clip.duration / Math.max(.2, dur));
        W.pending = { a, clip, ts };
        show(want, { loop: false });
        a.paused = true;
        W.entered = false;
      }
      const pend = W.pending;
      a.time = Math.min(pend.clip.duration - .001, m.t * pend.ts);
      mixer.update(dt);
    } else {
      W.pending = null;
      a.paused = false;
      show(want, { loop: true });
      mixer.update(dt);
    }
  };
  return W;
}

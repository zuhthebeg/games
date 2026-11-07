export const SANCTUARY_PIXELS = Object.freeze({ width: 1400, height: 860 });
export const SANCTUARY_METERS = Object.freeze({ width: 14, depth: 10 });
export const RITUAL_RANGE = 1.6;
export const RITUAL_CAPS = Object.freeze({ sticks: 3, embers: 16, blocks: 2 });

export function pixelsToMeters(x, y) {
  return {
    x: x / SANCTUARY_PIXELS.width * SANCTUARY_METERS.width - SANCTUARY_METERS.width / 2,
    z: y / SANCTUARY_PIXELS.height * SANCTUARY_METERS.depth - SANCTUARY_METERS.depth / 2,
  };
}

const point = (id, x, y, standX, standY, targetX, targetY, prompt) => Object.freeze({
  id,
  ...pixelsToMeters(x, y),
  prompt,
  stand: Object.freeze(pixelsToMeters(standX, standY)),
  target: Object.freeze(pixelsToMeters(targetX, targetY)),
});

export const RITUAL_POINTS = Object.freeze([
  point('chiao', 700, 365, 700, 365, 700, 365, '척교'),
  point('incense', 522, 539, 522, 610, 522, 420, '향 올리기'),
  point('burn', 1175, 529, 1175, 606, 1175, 493, '금지 태우기'),
]);

export const CHIAO_RESULTS = Object.freeze({
  holy: Object.freeze({
    key: 'holy',
    name: '聖筊 성교',
    faces: Object.freeze(['flat', 'convex']),
    description: "평평한 면 하나, 볼록한 면 하나. 전통적으로 신이 허락하거나 '그렇다'고 답한 것으로 여겨요.",
  }),
  laugh: Object.freeze({
    key: 'laugh',
    name: '笑筊 소교',
    faces: Object.freeze(['flat', 'flat']),
    description: '평평한 면 둘. 신이 웃는다는 뜻으로, 질문이 분명하지 않다고 보아 다시 묻거나 질문을 다듬어요.',
  }),
  dark: Object.freeze({
    key: 'dark',
    name: '陰筊 음교',
    faces: Object.freeze(['convex', 'convex']),
    description: "볼록한 면 둘. 전통적으로 '아니다' 또는 지금은 때가 아니라는 뜻으로 여겨요.",
  }),
});

export const CHIAO_FOOTER = '전통 의식을 체험하는 연출이며 실제 예언이나 효험을 뜻하지 않아요.';
export const RITUAL_CANCEL_HINT = 'Esc/R 취소';
export const INCENSE_DONE = '향 세 대를 향로에 꽂았어요.';
export const BURN_DONE = '금지(金紙)를 금로에 태웠어요.';
export const BURN_NOTE = '금지는 신께 올리는 금박 제사용 종이(紙錢)로, 부적(符)과는 달라요. 대만에서는 대기오염 때문에 소각을 줄이거나 모아서 태우는 사원이 많아요.';

export function nearestRitual(x, z, range = RITUAL_RANGE) {
  let nearest = null;
  let distance = range;
  for (const ritual of RITUAL_POINTS) {
    const next = Math.hypot(x - ritual.x, z - ritual.z);
    if (next <= distance) {
      nearest = ritual;
      distance = next;
    }
  }
  return nearest;
}

export function createRitualState() {
  return {
    active: null,
    nearby: null,
    feedback: null,
    pendingToks: 0,
    sticksLeft: 0,
    incenseAge: 0,
    serial: 0,
  };
}

export function isRitualBusy(state) {
  return Boolean(state?.active);
}

export function resultForFaces(faces) {
  const flat = faces.filter((face) => face === 'flat').length;
  return flat === 1 ? CHIAO_RESULTS.holy : flat === 2 ? CHIAO_RESULTS.laugh : CHIAO_RESULTS.dark;
}

export function faceAtPhase(phase) {
  return Math.cos(phase) >= 0 ? 'flat' : 'convex';
}

export function chiaoPlan(faces, seed = 0, reduced = false) {
  const normalized = faces.map((face) => face === 'convex' ? 'convex' : 'flat');
  return Object.freeze(normalized.map((face, index) => {
    const bounceCount = reduced ? 0 : 1 + ((seed >>> (index * 3)) & 1);
    const finalPhase = (face === 'convex' ? Math.PI : 0) + bounceCount * Math.PI * 2;
    const impactTimes = [];
    if (!reduced) {
      impactTimes.push(0.58);
      for (let bounce = 0; bounce < bounceCount; bounce += 1) impactTimes.push(0.58 + (bounce + 1) * 0.28);
    }
    return Object.freeze({
      bounceCount,
      duration: reduced ? 0.32 : 0.58 + bounceCount * 0.28,
      finalPhase,
      impactTimes: Object.freeze(impactTimes),
    });
  }));
}

export function startRitual(state, id, { origin = { x: 0, z: 0 }, reduced = false } = {}) {
  if (state.active || !RITUAL_POINTS.some((ritual) => ritual.id === id)) return false;
  state.serial += 1;
  state.feedback = null;
  if (id === 'incense') {
    state.sticksLeft = RITUAL_CAPS.sticks;
    state.incenseAge = 0;
  }
  state.active = {
    id,
    phase: id === 'chiao' ? 'intro' : id === 'burn' ? 'burning' : 'active',
    elapsed: 0,
    origin: { x: origin.x, z: origin.z },
    reduced,
    duration: id === 'burn' && reduced ? 1.2 : id === 'burn' ? 3.5 : id === 'incense' ? 1.2 : 0,
    seq: state.serial,
  };
  return true;
}

export function throwChiao(state, faces, seed = 0) {
  const active = state.active;
  if (!active || active.id !== 'chiao' || active.phase !== 'intro') return false;
  active.faces = faces.map((face) => face === 'convex' ? 'convex' : 'flat');
  active.result = resultForFaces(active.faces);
  active.plan = chiaoPlan(active.faces, seed, active.reduced);
  active.phase = active.reduced ? 'settled' : 'flight';
  active.elapsed = 0;
  return true;
}

export function cancelRitual(state) {
  state.active = null;
  state.feedback = null;
  state.pendingToks = 0;
}

export function resetRitual(state) {
  cancelRitual(state);
  state.sticksLeft = 0;
  state.incenseAge = 0;
}

export function advanceRitual(state, dt) {
  const seconds = Math.max(0, Number(dt) || 0);
  if (state.sticksLeft > 0) state.incenseAge += seconds;
  if (state.feedback) {
    state.feedback.left -= seconds;
    if (state.feedback.left <= 0) state.feedback = null;
  }
  const active = state.active;
  if (!active) return;
  const previousElapsed = active.elapsed;
  active.elapsed += seconds;
  if (active.id === 'chiao') {
    if (active.phase === 'flight') {
      for (const plan of active.plan) {
        for (const impact of plan.impactTimes) {
          if (previousElapsed < impact && impact <= active.elapsed) state.pendingToks += 1;
        }
      }
      if (active.elapsed >= Math.max(...active.plan.map((plan) => plan.duration))) {
        active.phase = 'settled';
        active.elapsed = 0;
      }
    } else if (active.phase === 'settled' && active.elapsed >= 8) {
      state.active = null;
    }
  } else if (active.id === 'incense' && active.elapsed >= 1.2) {
    state.feedback = { text: INCENSE_DONE, left: 4 };
    state.active = null;
  } else if (active.id === 'burn' && active.elapsed >= active.duration) {
    state.feedback = { text: BURN_DONE, note: BURN_NOTE, left: 5 };
    state.active = null;
  }
}

export function ritualMovement(state, input) {
  if (!isRitualBusy(state)) return input;
  return {
    ...input,
    ...(Object.hasOwn(input, 'mx') ? { mx: 0 } : {}),
    ...(Object.hasOwn(input, 'my') ? { my: 0 } : {}),
    ...(Object.hasOwn(input, 'moveX') ? { moveX: 0 } : {}),
    ...(Object.hasOwn(input, 'moveZ') ? { moveZ: 0 } : {}),
  };
}

// Deterministic round simulation. Host-authoritative in multiplayer (design §7.5, §15.2):
// the host calls step() at 30Hz with every player's input; guests render snapshots.
// Inputs are per-tick: booleans named *Edge are true only on the tick the button went down
// (the input layer latches presses until the next sim tick consumes them).

import {
  DT, ticks, rand, pickWeighted, turnToward, dist2, shapeHitsCircle, segmentCircleEntry,
  TEAM_PLAYER, TEAM_MONSTER,
} from './core.js';
import { ABILITIES, WEAPONS, MONSTERS, STAGES, PLAYER_BASE } from '../content/combat.js';

import { BALANCE, threatMultipliers, FRIENDLY_PROJECTILE_DAMAGE, monsterSizeProfile } from '../content/balance.js';

const PB = PLAYER_BASE;
const KNOCK_DECAY = 0.82; // per tick
const AUTO_AIM_RANGE = 560;
const SPAWN_IN_MS = 700;

export function emptyInput() {
  return { mx: 0, my: 0, aimX: 0, aimY: 0, attack: false, skillEdge: false, dodgeEdge: false, potionEdge: false, manaEdge: false, scrollEdge: false };
}

export function createWorld({ seed = 1, threat = 1, arena = { w: 1400, h: 860 } } = {}) {
  threatMultipliers(threat);
  return {
    tick: 0, rng: seed >>> 0, nextId: 1, arena, threat,
    entities: [], projectiles: [], events: [],
    majorBusyBy: 0, // EncounterDirector majorAttackToken: one big attack at a time early on (design §7.1)
    round: null,
  };
}

// mods come from the meta layer (level, stats, gear). The sim never reads stats directly.
export function addPlayer(world, { pid, weapon = 'blade', x, y, mods = {} }) {
  // The existing launcher already passes meta mods. Freeze threat before startStage, not in step().
  if (mods.threat !== undefined) {
    if (world.round) throw new Error('Threat is frozen after stage start');
    threatMultipliers(mods.threat);
    world.threat = mods.threat;
  }
  const maxHp = mods.maxHp ?? PB.hp;
  const maxMp = mods.maxMp ?? PB.mp;
  const ent = {
    id: world.nextId++, kind: 'player', pid, team: TEAM_PLAYER,
    x: x ?? world.arena.w * 0.22, y: y ?? world.arena.h * 0.5, r: PB.r, facing: 0,
    kx: 0, ky: 0, moving: false,
    hp: maxHp, maxHp, mp: maxMp, maxMp, mpRegen: mods.mpRegen ?? PB.mpRegen,
    speed: PB.speed * (mods.speedMult ?? 1),
    dmgMult: { blade: 1, bow: 1, focus: 1, ...(mods.dmgMult || {}) },
    cdMult: mods.cdMult ?? 1,
    dodgeCdMult: mods.dodgeCdMult ?? 1, iframeBonusMs: mods.iframeBonusMs ?? 0,
    potionHealMult: mods.potionHealMult ?? 1, poiseMult: mods.poiseMult ?? 1, loadRatio: 0,
    weapon, act: null, cds: {},
    dodge: { cdLeft: 0, iframeLeft: 0, dashLeft: 0, dx: 0, dy: 0, startedTick: -9999, perfectPaid: false },
    bufferDodge: 0, bufferDodgeDir: [0, 0],
    hurtInvuln: 0,
    potions: mods.potions ?? 3, manaPotions: mods.manaPotions ?? 0, potionCd: 0,
    scrolls: mods.scrolls ?? 1, scrollRetry: 0, channel: 0,
    dead: false, terminal: null, deathCause: null,
  };
  world.entities.push(ent);
  return ent;
}

export function spawnMonster(world, type, x, y, { hpMult = 1, dmgMult = 1, elite = false, threat = 1, stageId = null } = {}) {
  const def = MONSTERS[type];
  if (!def) throw new Error(`unknown monster ${type}`);
  const size = stageId ? monsterSizeProfile(stageId, elite, type === 'goblin_chief', rand(world))
    : { scale: 1, mean: 1, hp: 1 };
  const ent = {
    id: world.nextId++, kind: 'monster', type, team: TEAM_MONSTER,
    x, y, r: def.r * size.scale, sizeScale: size.scale, sizeMean: size.mean, sizeHpMult: size.hp, facing: Math.PI, kx: 0, ky: 0, moving: false,
    hp: Math.max(1, Math.round(def.hp * hpMult * size.hp)), maxHp: Math.max(1, Math.round(def.hp * hpMult * size.hp)),
    dmgMult, eliteVariant: elite, threat, stageId, poise: def.poise, maxPoise: def.poise,
    act: null, cds: {}, lastActs: [], thinkLeft: ticks(400 + rand(world) * 400),
    targetId: 0, strafe: rand(world) < 0.5 ? -1 : 1, staggerLeft: 0,
    spawnLeft: ticks(SPAWN_IN_MS), dead: false,
  };
  world.entities.push(ent);
  world.events.push({ type: 'spawn', id: ent.id, monster: type, elite, threat, x, y });
  return ent;
}

export function startStage(world, stageId) {
  const st = STAGES[stageId];
  if (!st) throw new Error(`unknown stage ${stageId}`);
  world.round = {
    stageId, threat: st.goal === 'timer' ? 1 : world.threat, state: 'running', t: 0, goal: st.goal,
    timerTicks: st.timerMs ? ticks(st.timerMs) : 0, maxConcurrent: st.maxConcurrent,
    pending: st.spawns.map((s) => ({ ...s, atTicks: ticks(s.at) })),
  };
}

// Carry weight (design §8.3). The meta layer owns the weight math; the sim only applies the tier effects.
export function setLoad(world, pid, ratio) {
  const p = world.entities.find((e) => e.kind === 'player' && e.pid === pid);
  if (p) p.loadRatio = ratio;
}

export function loadEffects(ratio) {
  if (ratio < 0.8) return { speed: 1, dodgeCd: 1 };
  if (ratio <= 1) return { speed: 1, dodgeCd: 1.15 };
  return { speed: 1 - 0.25 * Math.min(1, (ratio - 1) / 0.2), dodgeCd: 1.3 };
}

const alive = (e) => !e.dead && !e.terminal;
const isTargetable = (e) => alive(e) && !(e.spawnLeft > 0);

export function step(world, inputs = {}) {
  world.events = [];
  for (const ent of world.entities) {
    if (ent.kind === 'player') stepPlayer(world, ent, inputs[ent.pid] || emptyInput());
    else stepMonster(world, ent);
  }
  stepProjectiles(world);
  separate(world);
  for (const ent of world.entities) clampToArena(world, ent);
  stepRound(world);
  world.tick++;
  return world.events;
}

// ---------------------------------------------------------------- players

function canCancel(act) {
  return !act || (act.def.cancelInto || []).includes(act.phase);
}

function stepPlayer(world, p, inp) {
  const d = p.dodge;
  if (d.cdLeft > 0) d.cdLeft--;
  if (d.iframeLeft > 0) d.iframeLeft--;
  if (p.hurtInvuln > 0) p.hurtInvuln--;
  if (p.potionCd > 0) p.potionCd--;
  if (p.scrollRetry > 0) p.scrollRetry--;
  if (p.bufferDodge > 0) p.bufferDodge--;
  for (const k in p.cds) if (p.cds[k] > 0) p.cds[k]--;
  if (!alive(p)) return;
  stepPoison(world, p);
  if (!alive(p)) return;

  p.mp = Math.min(p.maxMp, p.mp + p.mpRegen * DT);
  const mlen = Math.hypot(inp.mx, inp.my);
  const mx = mlen > 1 ? inp.mx / mlen : inp.mx;
  const my = mlen > 1 ? inp.my / mlen : inp.my;

  if (inp.dodgeEdge) {
    p.bufferDodge = ticks(PB.bufferMs);
    p.bufferDodgeDir = mlen > 0.2 ? [mx, my] : [Math.cos(p.facing), Math.sin(p.facing)];
  }

  // return scroll channel (design §6.2): no move/attack; dodge cancels it voluntarily.
  if (p.channel > 0) {
    if (p.bufferDodge > 0) {
      p.channel = 0;
      world.events.push({ type: 'channelCancel', id: p.id });
    } else {
      p.channel--;
      if (p.channel === 0) {
        p.scrolls--;
        p.terminal = 'return_scroll';
        world.events.push({ type: 'returned', id: p.id, pid: p.pid });
      }
      decayKnock(p);
      return;
    }
  }

  if (p.bufferDodge > 0 && d.cdLeft === 0 && d.dashLeft === 0 && canCancel(p.act)) {
    if (p.act) endAct(world, p, true);
    const [dx, dy] = p.bufferDodgeDir;
    const dashTicks = ticks(PB.dodge.dashMs);
    d.dashLeft = dashTicks;
    d.dx = (dx * PB.dodge.distance) / dashTicks;
    d.dy = (dy * PB.dodge.distance) / dashTicks;
    d.iframeLeft = ticks(PB.dodge.iframeMs + p.iframeBonusMs);
    d.cdLeft = ticks(PB.dodge.cooldownMs * p.dodgeCdMult * loadEffects(p.loadRatio).dodgeCd);
    d.startedTick = world.tick;
    d.perfectPaid = false;
    p.bufferDodge = 0;
    p.facing = Math.atan2(dy, dx);
    world.events.push({ type: 'dodge', id: p.id });
  }

  if (d.dashLeft > 0) {
    d.dashLeft--;
    p.x += d.dx;
    p.y += d.dy;
    p.moving = true;
    decayKnock(p);
    return;
  }

  if (inp.potionEdge && p.potions > 0 && p.potionCd === 0 && p.hp < p.maxHp) {
    p.potions--;
    p.potionCd = ticks(PB.potion.cooldownMs);
    const heal = Math.round(p.maxHp * PB.potion.healFrac * p.potionHealMult);
    p.hp = Math.min(p.maxHp, p.hp + heal);
    world.events.push({ type: 'potion', id: p.id, heal });
  }
  if (inp.manaEdge && p.manaPotions > 0 && p.potionCd === 0 && p.mp < p.maxMp) {
    p.manaPotions--;
    p.potionCd = ticks(PB.potion.cooldownMs);
    const gain = Math.round(PB.manaPotion * p.potionHealMult);
    p.mp = Math.min(p.maxMp, p.mp + gain);
    world.events.push({ type: 'manaPotion', id: p.id, gain });
  }
  if (inp.scrollEdge && p.scrolls > 0 && p.scrollRetry === 0 && !p.act) {
    p.channel = ticks(PB.scroll.channelMs);
    world.events.push({ type: 'channelStart', id: p.id, ticks: p.channel });
    p.moving = false;
    decayKnock(p);
    return;
  }

  const w = WEAPONS[p.weapon];
  if (inp.skillEdge && canCancel(p.act)) {
    const def = ABILITIES[w.skill];
    if (!(p.cds[w.skill] > 0) && p.mp >= (def.manaCost || 0)) {
      if (p.act) endAct(world, p, true);
      p.mp -= def.manaCost || 0;
      startAct(world, p, w.skill, resolveAim(world, p, inp, mlen));
    }
  }
  if (!p.act && inp.attack && !(p.cds[w.basic] > 0)) {
    startAct(world, p, w.basic, resolveAim(world, p, inp, mlen));
  }

  if (p.act) advanceAct(world, p);

  const phase = p.act ? p.act.phase : null;
  const f = !phase ? 1 : phase === 'recovery' ? 0.55 : p.act.def.delivery === 'dash' ? 0 : 0.3;
  const sp = p.speed * loadEffects(p.loadRatio).speed;
  p.x += mx * sp * f * DT;
  p.y += my * sp * f * DT;
  p.moving = mlen > 0.15 && f > 0;
  if (!p.act) {
    const ax = inp.aimX, ay = inp.aimY;
    if (ax || ay) p.facing = Math.atan2(ay, ax);
    else if (mlen > 0.15) p.facing = Math.atan2(my, mx);
  }
  decayKnock(p);
}

function resolveAim(world, p, inp, mlen) {
  if (inp.aimX || inp.aimY) return Math.atan2(inp.aimY, inp.aimX);
  let best = null, bestD = AUTO_AIM_RANGE * AUTO_AIM_RANGE;
  for (const e of world.entities) {
    if (e.team === p.team || !isTargetable(e)) continue;
    const d2 = dist2(p.x, p.y, e.x, e.y);
    if (d2 < bestD) { bestD = d2; best = e; }
  }
  if (best) return Math.atan2(best.y - p.y, best.x - p.x);
  if (mlen > 0.15) return Math.atan2(inp.my, inp.mx);
  return p.facing;
}

// ---------------------------------------------------------------- monsters

function stepMonster(world, m) {
  for (const k in m.cds) if (m.cds[k] > 0) m.cds[k]--;
  if (m.dead) return;
  if (m.spawnLeft > 0) { m.spawnLeft--; return; }
  const def = MONSTERS[m.type];
  if (m.staggerLeft > 0) {
    m.staggerLeft--;
    if (m.staggerLeft === 0) m.poise = m.maxPoise;
    m.moving = false;
    decayKnock(m);
    return;
  }
  if (def.poise > 0 && !m.act && m.poise < m.maxPoise) m.poise = Math.min(m.maxPoise, m.poise + m.maxPoise * 0.15 * DT);

  const target = pickTarget(world, m);
  if (m.act) {
    advanceAct(world, m, target);
  } else if (target && def.abilities.length) {
    const dist = Math.sqrt(dist2(m.x, m.y, target.x, target.y));
    if (m.thinkLeft > 0) m.thinkLeft--;
    let started = false;
    if (m.thinkLeft === 0) {
      const cands = [];
      for (const id of def.abilities) {
        const a = ABILITIES[id];
        if (m.cds[id] > 0) continue;
        if (dist < (a.rangeMin || 0) || dist > a.rangeMax) continue;
        if (a.major && world.majorBusyBy && world.majorBusyBy !== m.id) continue;
        cands.push({ id, weight: a.weight || 1 });
      }
      // suppress repeating the last two patterns when an alternative exists (design §7.4)
      const notLast2 = cands.filter((c) => !m.lastActs.includes(c.id));
      const notLast1 = cands.filter((c) => c.id !== m.lastActs[0]);
      const pool = notLast2.length ? notLast2 : notLast1.length ? notLast1 : cands;
      if (pool.length) {
        const pick = pickWeighted(world, pool);
        startAct(world, m, pick.id, Math.atan2(target.y - m.y, target.x - m.x));
        started = true;
      }
    }
    if (!started) moveMonster(world, m, def, target, dist);
  } else {
    m.moving = false;
  }
  decayKnock(m);
}

function pickTarget(world, m) {
  let cur = world.entities.find((e) => e.id === m.targetId && e.kind === 'player' && alive(e));
  let best = null, bestD = Infinity;
  for (const e of world.entities) {
    if (e.kind !== 'player' || !alive(e)) continue;
    const d2 = dist2(m.x, m.y, e.x, e.y);
    if (d2 < bestD) { bestD = d2; best = e; }
  }
  if (cur && best && best !== cur) {
    // sticky target: only switch if the new one is much closer
    if (bestD < dist2(m.x, m.y, cur.x, cur.y) * 0.36) cur = best;
  } else if (!cur) cur = best;
  m.targetId = cur ? cur.id : 0;
  return cur;
}

function moveMonster(world, m, def, target, dist) {
  const [lo, hi] = def.keepRange;
  const ang = Math.atan2(target.y - m.y, target.x - m.x);
  let dir;
  if (dist > hi) dir = ang;
  else if (dist < lo) dir = ang + Math.PI;
  else {
    if (rand(world) < 0.01) m.strafe = -m.strafe;
    dir = ang + (m.strafe * Math.PI) / 2;
  }
  const sp = dist >= lo && dist <= hi ? def.speed * 0.45 : def.speed;
  m.x += Math.cos(dir) * sp * DT;
  m.y += Math.sin(dir) * sp * DT;
  m.facing = turnToward(m.facing, ang, (540 * Math.PI / 180) * DT);
  m.moving = sp > 0;
}

// ---------------------------------------------------------------- shared act machine

const PHASES = ['windup', 'lock', 'active', 'recovery'];

function startAct(world, ent, abilityId, facing) {
  const def = ABILITIES[abilityId];
  ent.act = {
    id: abilityId, def, phase: 'windup', left: ticks(def.windupMs), elapsed: 0,
    total: ticks(def.windupMs) + ticks(def.lockMs || 0),
    facing, ox: ent.x, oy: ent.y, hit: [], fired: false, dashStep: 0,
  };
  ent.facing = facing;
  if (def.major) world.majorBusyBy = ent.id;
  world.events.push({ type: 'act', id: ent.id, ability: abilityId });
  skipEmptyPhases(world, ent);
}

function skipEmptyPhases(world, ent) {
  const act = ent.act;
  while (act && act.left === 0) {
    const i = PHASES.indexOf(act.phase);
    if (i === PHASES.length - 1) { endAct(world, ent, false); return; }
    act.phase = PHASES[i + 1];
    act.left = ticks(act.def[`${act.phase}Ms`] || 0);
    if (act.phase === 'lock' || (act.phase === 'active' && !act.def.anchored)) {
      act.ox = ent.x; act.oy = ent.y;
    }
    if (act.phase === 'active' && act.def.delivery === 'dash') {
      act.dashStep = act.def.dash.distance / Math.max(1, act.left);
    }
    if (act.phase === 'active' && act.left === 0) act.left = 1; // active must exist for at least one tick
  }
}

function endAct(world, ent, interrupted) {
  const act = ent.act;
  if (!act) return;
  if (act.def.major && world.majorBusyBy === ent.id) world.majorBusyBy = 0;
  const cd = ticks((act.def.cooldownMs || 0) * (ent.cdMult || 1));
  if (cd) ent.cds[act.id] = cd;
  if (ent.kind === 'monster') {
    ent.lastActs = [act.id, ...ent.lastActs].slice(0, 2);
    ent.thinkLeft = ticks(220 + rand(world) * 380);
  }
  ent.act = null;
  if (interrupted) world.events.push({ type: 'actCancel', id: ent.id, ability: act.id });
}

function advanceAct(world, ent, target) {
  const act = ent.act;
  const def = act.def;
  if (act.phase === 'windup') {
    if (def.trackTurnDeg && target) {
      const want = Math.atan2(target.y - ent.y, target.x - ent.x);
      act.facing = turnToward(act.facing, want, (def.trackTurnDeg * Math.PI / 180) * DT);
    }
    act.ox = ent.x; act.oy = ent.y;
  }
  ent.facing = act.facing;
  if (act.phase === 'active') doActive(world, ent, act);
  if (!ent.act) return;
  act.elapsed++;
  act.left--;
  skipEmptyPhases(world, ent);
}

function doActive(world, ent, act) {
  const def = act.def;
  if (def.delivery === 'shape') {
    const activeTick = ticks(def.activeMs) - act.left;
    if (def.repeatHitMs && activeTick > 0 && activeTick % ticks(def.repeatHitMs) === 0) act.hit = [];
    hitShape(world, ent, act, def.shape, def.anchored ? act.ox : ent.x, def.anchored ? act.oy : ent.y);
  } else if (def.delivery === 'dash') {
    ent.x += Math.cos(act.facing) * act.dashStep;
    ent.y += Math.sin(act.facing) * act.dashStep;
    ent.moving = true;
    hitShape(world, ent, act, { type: 'circle', radius: ent.r + def.dash.bodyPad, offset: 0 }, ent.x, ent.y);
  } else if (def.delivery === 'projectile' && !act.fired) {
    act.fired = true;
    const pr = def.projectile;
    for (let i = 0; i < pr.count; i++) {
      const spread = pr.count > 1 ? ((i / (pr.count - 1)) - 0.5) * pr.spreadDeg * Math.PI / 180 : 0;
      const a = act.facing + spread;
      world.projectiles.push({
        id: world.nextId++, team: ent.team, ownerId: ent.id, ownerKind: ent.kind,
        ownerType: ent.type || ent.weapon, abilityId: act.id,
        x: ent.x + Math.cos(a) * (ent.r + 4), y: ent.y + Math.sin(a) * (ent.r + 4),
        vx: Math.cos(a) * pr.speed, vy: Math.sin(a) * pr.speed, r: pr.radius,
        travelled: 0, range: pr.rangePx, pierce: pr.pierce, hit: [],
        dmgMult: sourceMult(ent, def), poiseMult: ent.poiseMult ?? 1,
      });
    }
    world.events.push({ type: 'projectile', id: ent.id, ability: act.id });
  }
}

function sourceMult(ent, def) {
  if (ent.kind === 'player') return ent.dmgMult[def.family] ?? 1;
  return ent.dmgMult ?? 1;
}

function hitShape(world, ent, act, shape, ox, oy) {
  for (const t of world.entities) {
    if (t.team === ent.team || !isTargetable(t) || act.hit.includes(t.id)) continue;
    if (!shapeHitsCircle(shape, ox, oy, act.facing, t.x, t.y, t.r)) continue;
    act.hit.push(t.id);
    applyHit(world, t, {
      srcId: ent.id, srcKind: ent.kind, srcType: ent.type || ent.weapon, abilityId: act.id,
      def: act.def, mult: sourceMult(ent, act.def), poiseMult: ent.poiseMult ?? 1, fromX: ent.x, fromY: ent.y,
      cause: { shape, ox: act.ox, oy: act.oy, facing: act.facing },
    });
    if (!ent.act) return; // attacker got interrupted by its own hit side-effects (not expected, defensive)
  }
}

// ---------------------------------------------------------------- damage

// [제안] One strongest-only poison slot, refresh duration without delaying its next pulse.
// Contact can be dodged. Once applied, DoT is not a new attack and ignores hit/dodge invulnerability.
function stepPoison(world, p) {
  const poison = p.poison;
  if (!poison) return;
  poison.left--;
  if (--poison.next === 0) {
    applyHit(world, p, poison.hit);
    poison.next = poison.interval;
  }
  if (poison.left === 0 || !alive(p)) {
    p.poison = null;
    world.events.push({ type: 'poisonEnd', id: p.id });
  }
}

function applyHit(world, t, hit) {
  const def = hit.def;
  if (t.kind === 'player') {
    if (!hit.periodic && t.dodge.iframeLeft > 0) {
      const sinceDodge = world.tick - t.dodge.startedTick;
      if (!t.dodge.perfectPaid && sinceDodge <= ticks(PB.dodge.perfectMs)) {
        t.dodge.perfectPaid = true;
        world.events.push({ type: 'perfectDodge', id: t.id, ability: hit.abilityId });
      } else {
        world.events.push({ type: 'miss', id: t.id, ability: hit.abilityId });
      }
      return;
    }
    if (!hit.periodic && t.hurtInvuln > 0) return;
  }
  const mdef = t.kind === 'monster' ? MONSTERS[t.type] : null;
  let dmg = def.damage * hit.mult;
  let exposed = false;
  if (mdef) {
    if (t.staggerLeft > 0) { dmg *= 1.3; exposed = true; }
    else if (t.act && t.act.phase === 'recovery') { dmg *= 1.15; exposed = true; }
  }
  dmg = Math.max(1, Math.round(dmg));
  if (mdef && mdef.invulnerable) t.hp = Math.max(1, t.hp); // scarecrow: takes hits, never dies
  else t.hp -= dmg;

  const kbResist = mdef ? mdef.kbResist : 0;
  const ang = Math.atan2(t.y - hit.fromY, t.x - hit.fromX);
  const kb = (def.knockback || 0) * (1 - kbResist) * DT * 2.2;
  t.kx += Math.cos(ang) * kb;
  t.ky += Math.sin(ang) * kb;
  world.events.push({ type: 'hit', src: hit.srcId, dst: t.id, dmg, x: t.x, y: t.y, exposed, ability: hit.abilityId });

  if (t.kind === 'player') {
    if (!hit.periodic) t.hurtInvuln = ticks(PB.hurtInvulnMs);
    if (def.poison && t.hp > 0) {
      const status = def.poison;
      const left = ticks(status.durationMs);
      const interval = ticks(status.intervalMs);
      const dotHit = { ...hit, periodic: true, def: { damage: status.damage, knockback: 0 } };
      if (!t.poison) {
        t.poison = { left, interval, next: interval, hit: dotHit };
        world.events.push({ type: 'poison', id: t.id, ability: hit.abilityId });
      } else {
        t.poison.left = Math.max(t.poison.left, left);
        if (status.damage * hit.mult > t.poison.hit.def.damage * t.poison.hit.mult) {
          t.poison.hit = dotHit;
          t.poison.interval = interval;
        }
      }
    }
    if (t.channel > 0) {
      t.channel = 0;
      t.scrollRetry = ticks(PB.scroll.retryMs);
      world.events.push({ type: 'channelBroken', id: t.id });
    }
    if (t.hp <= 0) {
      t.hp = 0;
      t.dead = true;
      t.terminal = 'death';
      if (t.act) endAct(world, t, true);
      t.deathCause = { ability: hit.abilityId, by: hit.srcType, tick: world.tick, ...hit.cause };
      world.events.push({ type: 'death', id: t.id, pid: t.pid, cause: t.deathCause });
    }
    return;
  }

  if (mdef.poise > 0 && t.staggerLeft === 0) {
    t.poise -= (def.poise || 0) * (hit.poiseMult ?? 1);
    if (t.poise <= 0) {
      t.poise = 0;
      t.staggerLeft = ticks(1200);
      if (t.act) endAct(world, t, true);
      world.events.push({ type: 'stagger', id: t.id });
    }
  }
  if (t.hp <= 0) {
    t.hp = 0;
    t.dead = true;
    if (t.act) endAct(world, t, true);
    world.events.push({ type: 'kill', id: t.id, monster: t.type, elite: t.eliteVariant, threat: t.threat, stageId: t.stageId, by: hit.srcId, xp: mdef.xp, x: t.x, y: t.y });
  }
}

// ---------------------------------------------------------------- projectiles

function stepProjectiles(world) {
  const keep = [];
  for (const pr of world.projectiles) {
    const def = ABILITIES[pr.abilityId];
    const ax = pr.x, ay = pr.y, dx = pr.vx * DT, dy = pr.vy * DT;
    const distance = Math.hypot(dx, dy);
    // Clip the sweep at range/arena expiry: final-tick hits cannot tunnel or overshoot range.
    let limit = distance ? Math.min(1, Math.max(0, pr.range - pr.travelled) / distance) : 1;
    if (dx > 0) limit = Math.min(limit, (world.arena.w - ax) / dx);
    else if (dx < 0) limit = Math.min(limit, -ax / dx);
    if (dy > 0) limit = Math.min(limit, (world.arena.h - ay) / dy);
    else if (dy < 0) limit = Math.min(limit, -ay / dy);
    limit = Math.max(0, limit);
    const bx = ax + dx * limit, by = ay + dy * limit;
    const contacts = [];
    for (const target of world.entities) {
      if (target.id === pr.ownerId || !isTargetable(target) || pr.hit.includes(target.id)) continue;
      const t = segmentCircleEntry(ax, ay, bx, by, target.x, target.y, target.r + pr.r);
      if (t !== null) contacts.push({ target, t });
    }
    contacts.sort((a, b) => a.t - b.t || a.target.id - b.target.id);
    let gone = false, stop = 1;
    for (const { target, t } of contacts) {
      pr.x = ax + (bx - ax) * t; pr.y = ay + (by - ay) * t;
      const friendly = target.team === pr.team;
      if (friendly) world.events.push({ type: 'projectileBlocked', id: pr.id, blockerId: target.id, x: pr.x, y: pr.y });
      if (!friendly || FRIENDLY_PROJECTILE_DAMAGE > 0) {
        pr.hit.push(target.id);
        const facing = Math.atan2(pr.vy, pr.vx);
        applyHit(world, target, {
          srcId: pr.ownerId, srcKind: pr.ownerKind, srcType: pr.ownerType, abilityId: pr.abilityId, def,
          mult: pr.dmgMult * (friendly ? FRIENDLY_PROJECTILE_DAMAGE : 1), poiseMult: pr.poiseMult,
          fromX: pr.x - Math.cos(facing) * 10, fromY: pr.y - Math.sin(facing) * 10,
          cause: { shape: { type: 'circle', radius: pr.r, offset: 0 }, ox: pr.x, oy: pr.y, facing },
        });
      }
      // Allied bodies always stop the shot, even a piercing one, without spending pierce.
      if (friendly || pr.pierce-- <= 0) { gone = true; stop = t; break; }
    }
    pr.x = ax + (bx - ax) * stop; pr.y = ay + (by - ay) * stop;
    pr.travelled += distance * limit * stop;
    gone ||= limit < 1 || pr.travelled >= pr.range
      || pr.x <= 0 || pr.y <= 0 || pr.x >= world.arena.w || pr.y >= world.arena.h;
    if (gone) {
      if (def.projectile.explode) explode(world, pr, def);
      world.events.push({ type: 'projectileEnd', id: pr.id, x: pr.x, y: pr.y, ability: pr.abilityId });
    } else keep.push(pr);
  }
  world.projectiles = keep;
}

function explode(world, pr, def) {
  const radius = def.projectile.explode.radius;
  world.events.push({ type: 'explode', x: pr.x, y: pr.y, radius, ability: pr.abilityId });
  for (const t of world.entities) {
    if (t.team === pr.team || !isTargetable(t) || pr.hit.includes(t.id)) continue;
    if (dist2(pr.x, pr.y, t.x, t.y) > (radius + t.r) ** 2) continue;
    pr.hit.push(t.id);
    applyHit(world, t, {
      srcId: pr.ownerId, srcKind: pr.ownerKind, srcType: pr.ownerType, abilityId: pr.abilityId,
      def: { ...def, damage: def.damage * 0.6 }, mult: pr.dmgMult, poiseMult: pr.poiseMult, fromX: pr.x, fromY: pr.y,
      cause: { shape: { type: 'circle', radius, offset: 0 }, ox: pr.x, oy: pr.y, facing: 0 },
    });
  }
}

// ---------------------------------------------------------------- physics helpers

function decayKnock(e) {
  e.x += e.kx;
  e.y += e.ky;
  e.kx *= KNOCK_DECAY;
  e.ky *= KNOCK_DECAY;
  if (Math.abs(e.kx) < 0.05) e.kx = 0;
  if (Math.abs(e.ky) < 0.05) e.ky = 0;
}

function separate(world) {
  const ents = world.entities;
  for (let i = 0; i < ents.length; i++) {
    const a = ents[i];
    if (!alive(a) || a.spawnLeft > 0) continue;
    for (let j = i + 1; j < ents.length; j++) {
      const b = ents[j];
      if (!alive(b) || b.spawnLeft > 0) continue;
      if (a.kind === 'player' && b.kind === 'player') continue;
      // dodging players pass through monsters
      if ((a.kind === 'player' && a.dodge.dashLeft > 0) || (b.kind === 'player' && b.dodge.dashLeft > 0)) continue;
      const min = a.r + b.r;
      const d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
      const aw = isDashing(a) ? 0 : 1, bw = isDashing(b) ? 0 : 1;
      const tot = aw + bw || 1;
      a.x -= nx * push * 2 * (aw / tot);
      a.y -= ny * push * 2 * (aw / tot);
      b.x += nx * push * 2 * (bw / tot);
      b.y += ny * push * 2 * (bw / tot);
    }
  }
}

const isDashing = (e) => e.act && e.act.phase === 'active' && e.act.def.delivery === 'dash';

function clampToArena(world, e) {
  const { w, h } = world.arena;
  e.x = Math.max(e.r, Math.min(w - e.r, e.x));
  e.y = Math.max(e.r, Math.min(h - e.r, e.y));
}

// ---------------------------------------------------------------- round

function stepRound(world) {
  const rd = world.round;
  if (!rd || rd.state !== 'running') return;
  rd.t++;
  const monsters = world.entities.filter((e) => e.kind === 'monster' && !e.dead);
  let aliveCount = monsters.length;
  rd.pending = rd.pending.filter((s) => {
    if (s.atTicks > rd.t || aliveCount >= rd.maxConcurrent) return true;
    const stage = STAGES[rd.stageId];
    const threat = threatMultipliers(rd.threat);
    // Random damage variant, not the old archetype classification. No new attack or AI loop.
    const elite = !MONSTERS[s.monster].invulnerable && s.monster !== 'goblin_chief'
      && stage.eliteChance > 0 && rand(world) < stage.eliteChance;
    spawnMonster(world, s.monster, s.fx * world.arena.w, s.fy * world.arena.h, {
      hpMult: (stage.hpMult || 1) * threat.hp * (elite ? BALANCE.elite.hp : 1) * (s.monster === 'goblin_chief' ? (stage.bossHpMult || 1) : 1),
      dmgMult: (stage.dmgMult || 1) * threat.damage * (elite ? BALANCE.elite.damage : 1),
      elite, threat: rd.threat, stageId: rd.stageId,
    });
    aliveCount++;
    return false;
  });
  const players = world.entities.filter((e) => e.kind === 'player');
  const cleared = rd.goal === 'timer' ? rd.t >= rd.timerTicks : !rd.pending.length && aliveCount === 0;
  if (cleared) {
    for (const p of players) if (!p.terminal) p.terminal = 'clear';
  }
  if (players.length && players.every((p) => p.terminal)) {
    rd.state = players.some((p) => p.terminal === 'clear') ? 'clear'
      : players.some((p) => p.terminal === 'return_scroll') ? 'returned' : 'failed';
    world.events.push({ type: 'roundEnd', state: rd.state, stageId: rd.stageId });
  }
}

// ---------------------------------------------------------------- telegraphs (read-only view for renderers)

export function getTelegraphs(world) {
  const out = [];
  for (const m of world.entities) {
    if (m.kind !== 'monster' || m.dead || !m.act) continue;
    const act = m.act, def = act.def;
    if (act.phase === 'recovery') continue;
    const progress = act.total ? Math.min(1, act.elapsed / act.total) : 1;
    const base = { id: m.id, ability: act.id, phase: act.phase, progress, facing: act.facing, major: !!def.major };
    if (def.delivery === 'shape') {
      out.push({ ...base, shape: def.shape,
        ox: def.anchored ? act.ox : m.x, oy: def.anchored ? act.oy : m.y });
    } else if (def.delivery === 'dash') {
      if (act.phase === 'active') continue;
      out.push({ ...base, shape: { type: 'rect', length: def.dash.distance + m.r, width: (m.r + def.dash.bodyPad) * 2, offset: 0 }, ox: act.ox, oy: act.oy });
    } else if (def.delivery === 'projectile' && act.phase !== 'active') {
      const pr = def.projectile;
      for (let i = 0; i < pr.count; i++) {
        const spread = pr.count > 1 ? ((i / (pr.count - 1)) - 0.5) * pr.spreadDeg * Math.PI / 180 : 0;
        out.push({ ...base, facing: act.facing + spread, shape: { type: 'rect', length: pr.rangePx, width: pr.radius * 2, offset: m.r }, ox: m.x, oy: m.y });
      }
    }
  }
  return out;
}

import { emptyInput, getTelegraphs } from '../sim/world.js';
import { ABILITIES } from '../content/combat.js';
import { BALANCE } from '../content/balance.js';

export const EDGES = ['skillEdge', 'skill2Edge', 'skill3Edge', 'dodgeEdge', 'potionEdge', 'manaEdge', 'scrollEdge'];
const finite = v => Number.isFinite(v) ? v : 0;
const q = v => Math.round(finite(v) * 100) / 100;
// Cumulative edge counters survive dropped RT packets; receiver queues each press once.
// Guests send one packet per 30Hz sim tick; `prev` repeats the two prior movement
// commands so a dropped relay message does not lose a tick of movement.
export class InputSender {
  constructor() { this.seq = 0; this.edges = Object.fromEntries(EDGES.map(k => [k, 0])); this.history = []; }
  packet(input = {}, load = 0, ack = 0) {
    for (const k of EDGES) if (input[k]) this.edges[k]++;
    const v = ['mx', 'my', 'aimX', 'aimY'].map(k => q(input[k]));
    const packet = { t: 'input', seq: ++this.seq, v, prev: this.history.slice(),
      attack: !!input.attack, autoAttack: !!input.autoAttack, edges: { ...this.edges }, load, ack };
    this.history = [...this.history, [packet.seq, v]].slice(-2);
    return packet;
  }
}
// Host-side queue for a remote guest: exactly one command per sim tick, in order,
// so the guest's per-tick prediction replays the same movement the host applied.
// A 2-command jitter buffer absorbs arrival jitter (a lone command waits at most a tick); a backlog drains one extra
// command per tick (bounded latency) instead of growing after a burst.
export class InputQueue {
  constructor() {
    this.seq = 0; this.last = 0; this.at = 0; this.queue = []; this.primed = false; this.value = emptyInput();
    this.seen = Object.fromEntries(EDGES.map(k => [k, 0])); this.pending = { ...this.seen };
    this.stats = { consumed: 0, starved: 0, skipped: 0 };
  }
  receive(p, now = 0) {
    if (p?.t !== 'input' || !Number.isSafeInteger(p.seq) || p.seq <= this.last || !Array.isArray(p.v)) return false;
    const held = { attack: !!p.attack, autoAttack: !!p.autoAttack };
    for (const row of Array.isArray(p.prev) ? p.prev : []) {
      const [seq, v] = Array.isArray(row) ? row : [];
      if (Number.isSafeInteger(seq) && seq > this.last && seq < p.seq && Array.isArray(v)) {
        this.queue.push({ seq, v, ...held, edges: null, arrived: now }); this.last = seq;
      }
    }
    this.queue.push({ seq: p.seq, v: p.v, ...held, edges: p.edges, arrived: now }); this.last = p.seq; this.at = now;
    if (this.queue.length > 30) { this.stats.skipped += this.queue.length - 30; this.queue.splice(0, this.queue.length - 30); }
    return true;
  }
  apply(cmd) {
    this.seq = cmd.seq;
    ['mx', 'my', 'aimX', 'aimY'].forEach((k, i) => { this.value[k] = finite(cmd.v[i]); });
    this.value.attack = cmd.attack; this.value.autoAttack = cmd.autoAttack;
    if (cmd.edges) for (const k of EDGES) {
      const n = cmd.edges[k];
      if (Number.isSafeInteger(n) && n >= this.seen[k]) { this.pending[k] += n - this.seen[k]; this.seen[k] = n; }
    }
  }
  consume(now = this.at) {
    if (now - this.at > 1000) {
      // A hidden/disconnected tab cannot leave movement or auto-attack held indefinitely.
      for (const cmd of this.queue) this.apply(cmd);
      this.queue = []; this.primed = false;
      Object.assign(this.value, { mx: 0, my: 0, attack: false, autoAttack: false });
    } else if (this.primed ? this.queue.length : this.queue.length >= 2 || this.queue[0] && now - this.queue[0].arrived >= 1000 / 30) {
      if (this.queue.length > 4) { this.apply(this.queue.shift()); this.stats.skipped++; }
      this.apply(this.queue.shift()); this.primed = true; this.stats.consumed++;
    } else {
      // Starved: hold aim/attack but take no step, so applied movement still equals the commands.
      this.primed = false; this.stats.starved++;
      const input = { ...this.value, mx: 0, my: 0 };
      for (const k of EDGES) input[k] = false;
      return input;
    }
    const input = { ...this.value };
    for (const k of EDGES) { input[k] = this.pending[k] > 0; if (input[k]) this.pending[k]--; }
    return input;
  }
}
export class InputLatch {
  constructor() {
    this.seq = 0; this.at = 0; this.value = emptyInput();
    this.seen = Object.fromEntries(EDGES.map(k => [k, 0]));
    this.pending = { ...this.seen };
  }
  receive(p, now = 0) {
    if (p?.t !== 'input' || !Number.isSafeInteger(p.seq) || p.seq <= this.seq || !Array.isArray(p.v)) return false;
    this.seq = p.seq; this.at = now;
    ['mx', 'my', 'aimX', 'aimY'].forEach((k, i) => { this.value[k] = finite(p.v[i]); });
    this.value.attack = !!p.attack; this.value.autoAttack = !!p.autoAttack;
    for (const k of EDGES) {
      const n = p.edges?.[k];
      if (Number.isSafeInteger(n) && n >= this.seen[k]) {
        this.pending[k] += n - this.seen[k]; this.seen[k] = n;
      }
    }
    return true;
  }
  consume(now = this.at) {
    const input = { ...this.value };
    // A hidden/disconnected tab cannot leave movement or auto-attack held indefinitely.
    if (now - this.at > 1000) Object.assign(input, { mx: 0, my: 0, attack: false, autoAttack: false });
    for (const k of EDGES) { input[k] = this.pending[k] > 0; if (input[k]) this.pending[k]--; }
    return input;
  }
}
// [제안] Freeze at departure: 2/3/4 players ×1.6/2.2/2.8, highest party level
// above stage recommendation adds 4% HP per level. Telegraph timings/damage unchanged.
export function partyHpScale(count, highestLevel, stageId) {
  const base = [1, 1, 1.6, 2.2, 2.8][Math.max(1, Math.min(4, count))];
  const recommended = BALANCE.stages[stageId]?.rec?.[0] ?? [1, 2, 3, 4, 4, 5, 6][Number(stageId.slice(1)) - 1] ?? 1;
  return base * 1.04 ** Math.max(0, Math.min(30, highestLevel) - recommended);
}
const COMMON = ['id', 'kind', 'pid', 'type', 'team', 'x', 'y', 'r', 'facing', 'moving', 'hp', 'maxHp', 'dead', 'terminal',
  'weapon', 'weaponForm', 'sunder', 'skills', 'sizeScale', 'eliteVariant', 'spawnLeft', 'staggerLeft', 'channel', 'deathCause'];
const MOTION = ['speed', 'dodgeCdMult', 'iframeBonusMs', 'kx', 'ky', 'hurtInvuln',
  // Own-pawn prediction inputs (act timing, cooldowns, buffered dodge, mana gate).
  'mpRegen', 'hpRegen', 'cdMult', 'attackSpeedBonus', 'weaponWeight', 'armorWeight', 'bufferDodge', 'bufferDodgeDir', 'potionHealMult'];
const HUD = ['mp', 'maxMp', 'potions', 'manaPotions', 'potionCd', 'scrolls', 'scrollRetry', 'loadRatio', 'cds', 'dodge'];
const select = (obj, keys) => Object.fromEntries(keys.filter(k => obj[k] !== undefined).map(k => [k, obj[k]]));
export function encodeSnapshot(world, inputSeqs = null) {
  return { t: 'snapshot', tick: world.tick, arena: world.arena, threat: world.threat,
    round: select(world.round, ['stageId', 'state', 't', 'goal', 'timerTicks', 'threat']),
    ...(world.round.objective ? { objective: structuredClone(world.round.objective) } : {}), pending: world.round.pending.length,
    entities: world.entities.map(e => ({ ...select(e, COMMON), ...(e.kind === 'player' ? { ...select(e, HUD), ...select(e, MOTION),
        pendingCounter: !!e.pendingCounter,
        ...(inputSeqs ? { lastInputSeq: inputSeqs[e.pid] ?? 0 } : {}) } : {}),
      x: q(e.x), y: q(e.y), hp: q(e.hp),
      act: e.act ? select(e.act, ['id', 'phase', 'elapsed', 'total', 'facing', 'ox', 'oy', 'counter',
        ...(e.kind === 'player' ? ['left', 'phaseTicks', 'dashStep'] : [])]) : null })),
    projectiles: world.projectiles.map(p => ({ ...select(p, ['id', 'abilityId', 'x', 'y', 'r', 'vx', 'vy']), x: q(p.x), y: q(p.y) })),
    telegraphs: getTelegraphs(world) };
}
export function decodeSnapshot(packet, uid) {
  if (packet?.t !== 'snapshot' || !Number.isSafeInteger(packet.tick) || !Array.isArray(packet.entities)) return null;
  const copy = structuredClone(packet);
  for (const e of copy.entities) if (e.act) e.act.def = ABILITIES[e.act.id];
  const index = copy.entities.findIndex(e => e.pid === uid && e.kind === 'player');
  if (index > 0) copy.entities.unshift(...copy.entities.splice(index, 1));
  if (copy.objective) copy.round.objective = copy.objective;
  copy.round.pending = Array(copy.pending).fill(null);
  return copy;
}
const TICK_MS = 1000 / 30;
// Remote entities play back on the host's tick timeline, not on packet arrival times.
// clock = fastest recent (arrival - tick time), i.e. base latency; later arrivals are
// jitter, covered by an adaptive delay. Playback speed is nudged (max 8%) toward the
// target instead of jumping, so arrival jitter/bursts do not show up as stutter.
export class SnapshotBuffer {
  constructor(uid, delay = 125, { adaptive = true } = {}) {
    this.uid = uid; this.delay = delay; this.adaptive = adaptive; this.frames = [];
    this.offsets = []; this.clock = 0; this.play = null; this.lastNow = null;
    this.stats = { resets: 0, extrapolatedMs: 0, heldMs: 0 };
  }
  push(packet, at) {
    const last = this.frames.at(-1);
    if (last && packet.tick <= last.world.tick) return false;
    const world = decodeSnapshot(packet, this.uid);
    if (!world || !Number.isFinite(at)) return false;
    this.frames.push({ world, at }); if (this.frames.length > 24) this.frames.shift();
    this.offsets.push(at - world.tick * TICK_MS); if (this.offsets.length > 40) this.offsets.shift();
    this.clock = Math.min(...this.offsets);
    if (this.adaptive && this.offsets.length >= 4) {
      const late = this.offsets.map(o => o - this.clock).sort((a, b) => a - b);
      const p90 = late[Math.min(late.length - 1, Math.floor(late.length * .9))];
      const interval = last ? Math.min(6, world.tick - last.world.tick) * TICK_MS : 2 * TICK_MS;
      this.delay += (Math.max(80, Math.min(300, p90 + interval + 15)) - this.delay) * .1;
    }
    return true;
  }
  sample(now) {
    const latest = this.frames.at(-1);
    if (!latest) return null;
    const target = (now - this.clock - this.delay) / TICK_MS, elapsed = this.lastNow === null ? 0 : now - this.lastNow;
    if (this.play === null || elapsed < 0 || Math.abs(target - this.play) > 8) {
      if (this.play !== null) this.stats.resets++;
      this.play = target;
    } else this.play += elapsed / TICK_MS * (1 + Math.max(-.08, Math.min(.08, (target - this.play) * .04)));
    this.lastNow = now;
    const tick = this.play, first = this.frames[0];
    let a = first, b = first;
    if (tick >= latest.world.tick) {
      if (this.frames.length > 1) { a = this.frames.at(-2); b = latest; }
      if (tick > latest.world.tick + 3) this.stats.heldMs += elapsed; else this.stats.extrapolatedMs += elapsed;
    } else if (tick > first.world.tick) {
      for (let i = 1; i < this.frames.length; i++) {
        b = this.frames[i];
        if (tick <= b.world.tick) break;
        a = b;
      }
    }
    // At most 3 ticks (100ms) of extrapolation, from tick-time velocity.
    const span = b.world.tick - a.world.tick;
    const alpha = span > 0 ? Math.max(0, (Math.min(tick, latest.world.tick + 3) - a.world.tick) / span) : 0;
    const interpolate = key => latest.world[key].map(e => {
      const from = a.world[key].find(v => v.id === e.id), to = b.world[key].find(v => v.id === e.id);
      if (!from || !to || e.dead || e.terminal) return e;
      return { ...e, x: from.x + (to.x - from.x) * alpha, y: from.y + (to.y - from.y) * alpha };
    });
    // Only x/y are buffered. HP, action phases and warning geometry stay newest.
    return { ...latest.world, entities: interpolate('entities'), projectiles: interpolate('projectiles') };
  }
}
export function localView(world, uid) {
  const player = world.entities.find(e => e.kind === 'player' && e.pid === uid);
  return { ...world, entities: player ? [player, ...world.entities.filter(e => e !== player)] : world.entities };
}

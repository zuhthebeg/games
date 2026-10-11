// Frozen 38eb182 network code, measurement-only. Only import paths were relocated.
import { emptyInput, getTelegraphs } from '../../../js/sim/world.js';
import { ABILITIES } from '../../../js/content/combat.js';
import { BALANCE } from '../../../js/content/balance.js';

export const EDGES = ['skillEdge', 'dodgeEdge', 'potionEdge', 'manaEdge', 'scrollEdge'];
const finite = v => Number.isFinite(v) ? v : 0;
const q = v => Math.round(finite(v) * 100) / 100;
// Cumulative edge counters survive dropped RT packets; receiver queues each press once.
export class InputSender {
  constructor() { this.seq = 0; this.edges = Object.fromEntries(EDGES.map(k => [k, 0])); }
  packet(input = {}, load = 0, ack = 0) {
    for (const k of EDGES) if (input[k]) this.edges[k]++;
    return { t: 'input', seq: ++this.seq,
      v: ['mx', 'my', 'aimX', 'aimY'].map(k => q(input[k])),
      attack: !!input.attack, autoAttack: !!input.autoAttack, edges: { ...this.edges }, load, ack };
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
  'weapon', 'skill', 'sizeScale', 'eliteVariant', 'spawnLeft', 'staggerLeft', 'channel', 'deathCause'];
const HUD = ['mp', 'maxMp', 'potions', 'manaPotions', 'potionCd', 'scrolls', 'scrollRetry', 'loadRatio', 'cds', 'dodge'];
const select = (obj, keys) => Object.fromEntries(keys.filter(k => obj[k] !== undefined).map(k => [k, obj[k]]));
export function encodeSnapshot(world) {
  return { t: 'snapshot', tick: world.tick, arena: world.arena, threat: world.threat,
    round: select(world.round, ['stageId', 'state', 't', 'goal', 'timerTicks', 'threat']), pending: world.round.pending.length,
    entities: world.entities.map(e => ({ ...select(e, COMMON), ...(e.kind === 'player' ? select(e, HUD) : {}),
      x: q(e.x), y: q(e.y), hp: q(e.hp),
      act: e.act ? select(e.act, ['id', 'phase', 'elapsed', 'total', 'facing', 'ox', 'oy', 'counter']) : null })),
    projectiles: world.projectiles.map(p => ({ ...select(p, ['id', 'abilityId', 'x', 'y', 'r', 'vx', 'vy']), x: q(p.x), y: q(p.y) })),
    telegraphs: getTelegraphs(world) };
}
export function decodeSnapshot(packet, uid) {
  if (packet?.t !== 'snapshot' || !Number.isSafeInteger(packet.tick) || !Array.isArray(packet.entities)) return null;
  const copy = structuredClone(packet);
  for (const e of copy.entities) if (e.act) e.act.def = ABILITIES[e.act.id];
  const index = copy.entities.findIndex(e => e.pid === uid && e.kind === 'player');
  if (index > 0) copy.entities.unshift(...copy.entities.splice(index, 1));
  copy.round.pending = Array(copy.pending).fill(null);
  return copy;
}
export class SnapshotBuffer {
  constructor(uid, delay = 100) { this.uid = uid; this.delay = delay; this.frames = []; }
  push(packet, at) {
    if (this.frames.length && packet.tick <= this.frames.at(-1).world.tick) return false;
    const world = decodeSnapshot(packet, this.uid);
    if (!world) return false;
    this.frames.push({ world, at }); if (this.frames.length > 2) this.frames.shift();
    return true;
  }
  sample(now) {
    const b = this.frames.at(-1), a = this.frames[0];
    if (!b) return null;
    if (a === b) return b.world;
    const alpha = Math.max(0, Math.min(1, (now - this.delay - a.at) / (b.at - a.at || 1)));
    const interpolate = key => b.world[key].map(e => {
      const old = a.world[key].find(v => v.id === e.id);
      return old ? { ...e, x: old.x + (e.x - old.x) * alpha, y: old.y + (e.y - old.y) * alpha } : e;
    });
    // Telegraphs remain newest authoritative geometry/phase (never position-interpolated).
    return { ...b.world, entities: interpolate('entities'), projectiles: interpolate('projectiles') };
  }
}
export function localView(world, uid) {
  const player = world.entities.find(e => e.kind === 'player' && e.pid === uid);
  return { ...world, entities: player ? [player, ...world.entities.filter(e => e !== player)] : world.entities };
}

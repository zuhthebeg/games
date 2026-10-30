// Frozen input protocol from hitstop-only main 1cb3f8d.
import { emptyInput } from '../../js/sim/world.js';
import { dodgeInputViewTick } from '../../js/sim/dodge-lag.js';
const SANCTUARY={obstacles:[]};
export const EDGES = ['skillEdge', 'skill2Edge', 'skill3Edge', 'dodgeEdge', 'potionEdge', 'manaEdge', 'scrollEdge', 'greenEdge'];
export const TIMED_SKILL_EDGES = ['skillEdge', 'skill2Edge', 'skill3Edge'];
const SANCTUARY_OBSTACLES = Object.freeze(SANCTUARY.obstacles.map(obstacle => Object.freeze({ ...obstacle })));
const MAX_PENDING_EDGES = 30;
const finite = v => Number.isFinite(v) ? v : 0;
const q = v => Math.round(finite(v) * 100) / 100;
// Cumulative edge counters survive dropped RT packets; receiver queues each press once.
// Guests send one packet per 30Hz sim tick; `prev` repeats the two prior movement
// commands so a dropped relay message does not lose a tick of movement.
export class InputSender {
  constructor() { this.seq = 0; this.edges = Object.fromEntries(EDGES.map(k => [k, 0])); this.history = []; this.dodgeViews = []; this.skillViews = {}; }
  packet(input = {}, load = 0, ack = 0) {
    for (const k of EDGES) if (input[k]) this.edges[k]++;
    const poseTick = Number.isFinite(input.poseTick) && input.poseTick >= 0 ? input.poseTick : undefined;
    const viewTick = Number.isSafeInteger(input.viewTick) && input.viewTick >= 0 ? input.viewTick : undefined;
    if (input.dodgeEdge) this.dodgeViews = [...this.dodgeViews, [this.edges.dodgeEdge, viewTick]].slice(-4);
    for (const k of TIMED_SKILL_EDGES) if (input[k]) {
      const tick = dodgeInputViewTick(input, k);
      this.skillViews[k] = [...(this.skillViews[k] || []), [this.edges[k], Number.isSafeInteger(tick) && tick >= 0 ? tick : undefined, Object.hasOwn(input.skillPoseTicks || {}, k) ? input.skillPoseTicks[k] : poseTick]].slice(-4);
    }
    const v = ['mx', 'my', 'aimX', 'aimY'].map(k => q(input[k]));
    const packet = { t: 'input', seq: ++this.seq, v, prev: this.history.slice(),
      ...(poseTick !== undefined ? { poseTick } : {}), attack: !!input.attack, autoAttack: !!input.autoAttack, dodgeHeld:!!input.dodgeHeld, edges: { ...this.edges }, load, ack, ...(viewTick !== undefined ? { viewTick } : {}),
      ...(this.dodgeViews.length ? { dodgeViews: this.dodgeViews.map(row => [...row]) } : {}),
      ...(Object.keys(this.skillViews).length ? { skillViews: Object.fromEntries(Object.entries(this.skillViews).map(([k, rows]) => [k, rows.map(row => [...row])])) } : {}) };
    this.history = [...this.history, [packet.seq, v, { edges: { ...packet.edges }, viewTick, poseTick, dodgeViews: packet.dodgeViews, skillViews: packet.skillViews }]].slice(-2);
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
    this.skillPoseTicks = Object.fromEntries(TIMED_SKILL_EDGES.map(k => [k, []]));
    this.dodgeViews = []; this.skillViews = Object.fromEntries(TIMED_SKILL_EDGES.map(k => [k, []]));
    this.newestDodgeHeld=false;
    this.stats = { consumed: 0, starved: 0, skipped: 0 };
  }
  receive(p, now = 0) {
    if (p?.t !== 'input' || !Number.isSafeInteger(p.seq) || p.seq <= this.last || !Array.isArray(p.v)) return false;
    this.newestDodgeHeld=!!p.dodgeHeld;
    const held = { attack: !!p.attack, autoAttack: !!p.autoAttack };
    for (const row of Array.isArray(p.prev) ? p.prev : []) {
      const [seq, v, metadata] = Array.isArray(row) ? row : [];
      if (Number.isSafeInteger(seq) && seq > this.last && seq < p.seq && Array.isArray(v)) {
        this.queue.push({ seq, v, ...held, edges: metadata?.edges ?? null, viewTick: metadata?.viewTick, poseTick: metadata?.poseTick, dodgeViews: metadata?.dodgeViews, skillViews: metadata?.skillViews, arrived: now }); this.last = seq;
      }
    }
    this.queue.push({ seq: p.seq, v: p.v, ...held, edges: p.edges, viewTick: p.viewTick, poseTick: p.poseTick, dodgeViews: p.dodgeViews, skillViews: p.skillViews, arrived: now }); this.last = p.seq; this.at = now;
    if (this.queue.length > 30) { this.stats.skipped += this.queue.length - 30; this.queue.splice(0, this.queue.length - 30); }
    return true;
  }
  apply(cmd) {
    this.seq = cmd.seq;
    ['mx', 'my', 'aimX', 'aimY'].forEach((k, i) => { this.value[k] = finite(cmd.v[i]); });
    this.value.viewTick = cmd.viewTick; this.value.poseTick = cmd.poseTick;
    this.value.attack = cmd.attack; this.value.autoAttack = cmd.autoAttack;
    if (cmd.edges) for (const k of EDGES) {
      const n = cmd.edges[k];
      if (Number.isSafeInteger(n) && n >= this.seen[k]) {
        // Retain at most 30 newest presses TOTAL, not 30 more per packet.
        // Advance seen to n even when dropping overflow, so it cannot be repaid.
        const count = Math.min(MAX_PENDING_EDGES, n - this.seen[k]);
        const dropped = Math.max(0, this.pending[k] + count - MAX_PENDING_EDGES);
        if (k === 'dodgeEdge') this.dodgeViews.splice(0, dropped);
        if (TIMED_SKILL_EDGES.includes(k)) { this.skillViews[k].splice(0, dropped); this.skillPoseTicks[k].splice(0, dropped); }
        if (k === 'dodgeEdge') for (let i = n - count + 1; i <= n; i++) {
          const row = Array.isArray(cmd.dodgeViews) ? cmd.dodgeViews.find(r => Array.isArray(r) && r[0] === i) : null;
          this.dodgeViews.push(row ? row[1] : n - this.seen[k] === 1 ? cmd.viewTick : undefined);
        }
        if (TIMED_SKILL_EDGES.includes(k)) for (let i = n - count + 1; i <= n; i++) {
          const rows = cmd.skillViews?.[k];
          const row = Array.isArray(rows) ? rows.find(r => Array.isArray(r) && r[0] === i) : null;
          this.skillPoseTicks[k].push(row ? row[2] : !cmd.skillViews && n - this.seen[k] === 1 ? cmd.poseTick : undefined);
          this.skillViews[k].push(row ? row[1] : !cmd.skillViews && n - this.seen[k] === 1 ? cmd.viewTick : undefined);
        }
        this.pending[k] = Math.min(MAX_PENDING_EDGES, this.pending[k] + count); this.seen[k] = n;
      }
    }
  }
  discard(packet, now = this.at) {
    if (packet && !this.receive(packet, now)) return false;
    for (const cmd of this.queue) this.apply(cmd);
    this.queue = []; this.primed = false;
    this.pending = Object.fromEntries(EDGES.map(k => [k, 0]));
    this.skillPoseTicks = Object.fromEntries(TIMED_SKILL_EDGES.map(k => [k, []]));
    this.dodgeViews = []; this.skillViews = Object.fromEntries(TIMED_SKILL_EDGES.map(k => [k, []]));
    this.value = emptyInput(); this.newestDodgeHeld = false;
    return true;
  }
  consume(now = this.at) {
    if (now - this.at > 1000) {
      // A hidden/disconnected tab cannot leave movement or auto-attack held indefinitely.
      for (const cmd of this.queue) this.apply(cmd);
      this.queue = []; this.primed = false;
      Object.assign(this.value, { mx: 0, my: 0, attack: false, autoAttack: false, dodgeHeld:false });
    } else if (this.primed ? this.queue.length : this.queue.length >= 2 || this.queue[0] && now - this.queue[0].arrived >= 1000 / 30) {
      if (this.queue.length > 4) { this.apply(this.queue.shift()); this.stats.skipped++; }
      this.apply(this.queue.shift()); this.primed = true; this.stats.consumed++;
    } else {
      // Starved: hold aim/attack but take no step, so applied movement still equals the commands.
      this.primed = false; this.stats.starved++;
      const input = { ...this.value, mx: 0, my: 0, dodgeHeld:this.newestDodgeHeld };
      for (const k of EDGES) input[k] = false;
      return input;
    }
    const input = { ...this.value, dodgeHeld:now-this.at<=1000 && this.newestDodgeHeld };
    for (const k of EDGES) { input[k] = this.pending[k] > 0; if (input[k]) this.pending[k]--; }
    if (input.dodgeEdge) input.viewTick = this.dodgeViews.shift();
    input.skillViewTicks = {}; input.skillPoseTicks = {};
    for (const k of TIMED_SKILL_EDGES) if (input[k]) { input.skillViewTicks[k] = this.skillViews[k].shift(); input.skillPoseTicks[k] = this.skillPoseTicks[k].shift(); }
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
    this.value.attack = !!p.attack; this.value.autoAttack = !!p.autoAttack; this.value.dodgeHeld=!!p.dodgeHeld;
    for (const k of EDGES) {
      const n = p.edges?.[k];
      if (Number.isSafeInteger(n) && n >= this.seen[k]) {
        this.pending[k] = Math.min(MAX_PENDING_EDGES, this.pending[k] + (n - this.seen[k])); this.seen[k] = n;
      }
    }
    return true;
  }
  discard(packet, now = this.at) {
    if (packet && !this.receive(packet, now)) return false;
    this.pending = Object.fromEntries(EDGES.map(k => [k, 0])); this.value = emptyInput();
    return true;
  }
  consume(now = this.at) {
    const input = { ...this.value };
    // A hidden/disconnected tab cannot leave movement or auto-attack held indefinitely.
    if (now - this.at > 1000) Object.assign(input, { mx: 0, my: 0, attack: false, autoAttack: false, dodgeHeld:false });
    for (const k of EDGES) { input[k] = this.pending[k] > 0; if (input[k]) this.pending[k]--; }
    return input;
  }
}

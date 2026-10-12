// Host-only quest state machine. Tokens never enter inventory, save or loot tables.
import { ticks } from './core.js';
const eligible = p => p.kind === 'player' && !p.dead && p.hp > 0 && !p.terminal;
const inside = (p, pos, radius) => (p.x-pos.x)**2 + (p.y-pos.y)**2 <= radius**2;
const position = (world, p) => ({ x: Math.max(0, Math.min(world.arena.w, p.x)), y: Math.max(0, Math.min(world.arena.h, p.y)) });
export function createObjective(def, arena) {
  if (def.kind !== 'carry-return') throw new Error(`Unknown objective ${def.kind}`);
  return { kind: def.kind, questId: def.questId, state: 'waiting', carrier: null,
    token: { x: def.token[0]*arena.w, y: def.token[1]*arena.h },
    entry: { x: def.entry[0]*arena.w, y: def.entry[1]*arena.h },
    radius: def.radius, dwellTicks: ticks(def.dwellMs), progress: {} };
}
export function releaseCarrier(world, player) {
  const o = world.round?.objective;
  if (!o || o.state !== 'carried' || o.carrier !== player.pid) return;
  o.token = position(world, player); o.carrier = null; o.state = 'waiting'; o.progress = {};
  world.events.push({ type: 'tokenDropped', questId: o.questId, pid: player.pid, ...o.token });
}
export function stepObjective(world, inputs = {}) {
  const o = world.round.objective;
  if (!o || o.state === 'complete') return o?.state === 'complete';
  const players = world.entities.filter(p => p.kind === 'player');
  if (o.carrier !== null) {
    const carrier = players.find(p => p.pid === o.carrier);
    if (!carrier) { o.carrier = null; o.state = 'waiting'; o.progress = {}; }
    else if (!eligible(carrier)) releaseCarrier(world, carrier);
    else o.token = position(world, carrier);
  }
  const candidates = o.state === 'carried' ? players.filter(p => p.pid === o.carrier) : players;
  const progress = {};
  for (const p of candidates) {
    const inp = inputs[p.pid] || {};
    const pos = o.state === 'carried' ? o.entry : o.token;
    // Damage alone is not an interruption; movement, evasion and return channel are.
    if (!eligible(p) || p.moving || Math.hypot(inp.mx || 0, inp.my || 0) > .2 || inp.dodgeEdge || p.dodge?.dashLeft > 0 || p.channel > 0 || !inside(p, pos, o.radius)) continue;
    progress[p.pid] = (o.progress[p.pid] || 0) + 1;
    if (progress[p.pid] < o.dwellTicks) continue;
    o.progress = {};
    if (o.state === 'waiting') {
      o.carrier = p.pid; o.state = 'carried'; o.token = position(world, p);
      world.events.push({ type: 'tokenPicked', questId: o.questId, pid: p.pid });
      return false; // No pickup + return in the same tick.
    }
    o.state = 'complete';
    const participants = players.filter(eligible).map(p => p.pid);
    world.events.push({ type: 'objectiveComplete', questId: o.questId, participants });
    return true;
  }
  o.progress = progress;
  return false;
}

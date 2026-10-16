// Session-owned opt-in, not a snapshot/protocol field. Solo remains byte-identical.
import { ticks, TICK_MS } from './core.js';
import { PLAYER_BASE as PB } from '../content/combat.js';
const multiplayerWorlds = new WeakSet();
export const MULTIPLAYER_DODGE_MS = 400;
export const MULTIPLAYER_REWIND_TICKS = Math.floor(300 / TICK_MS);
export function enableMultiplayerDodge(world) { multiplayerWorlds.add(world); }
export function multiplayerDodge(world) { return multiplayerWorlds.has(world); }
export function dodgeTiming(p, multi = false) {
  const iframeTicks = ticks(multi ? Math.min(MULTIPLAYER_DODGE_MS, MULTIPLAYER_DODGE_MS + p.iframeBonusMs) : PB.dodge.iframeMs + p.iframeBonusMs);
  return { iframeTicks, perfectTicks: multi ? iframeTicks - 1 : ticks(PB.dodge.perfectMs) };
}

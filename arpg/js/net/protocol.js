import { validMasteryLevels } from '../content/skill-growth.js';
import { dodgeInputViewTick } from '../sim/dodge-lag.js';
import { currentTelegraphs } from '../render/telegraph-time.js';
import { emptyInput, getTelegraphs } from '../sim/world.js';
import { ABILITIES } from '../content/combat.js';
import { comboDef } from '../sim/basic-combo.js';
import { validZones } from '../sim/spell-zones.js';
import { validShieldModel } from '../content/shields.js';
import { whirlTimeline } from '../sim/whirl-evolution.js';
import { ticks } from '../sim/core.js';
import { BALANCE } from '../content/balance.js';

export const EDGES = ['skillEdge', 'skill2Edge', 'skill3Edge', 'dodgeEdge', 'potionEdge', 'manaEdge', 'scrollEdge', 'greenEdge'];
export const TIMED_SKILL_EDGES = ['skillEdge', 'skill2Edge', 'skill3Edge'];
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
// [제안] Freeze at departure: 2/3/4 players ×1.6/2.2/2.8, highest party level
// above stage recommendation adds 4% HP per level. Telegraph timings/damage unchanged.
// cocy 10-14 "멀티일때 몬스터 너무 강함": sub-linear party HP (was 1.6/2.2/2.8); level gap uses the party mean.
export function partyHpScale(count, partyLevel, stageId) {
  const base = [1, 1, 1.4, 1.8, 2.15][Math.max(1, Math.min(4, count))];
  const highestLevel = partyLevel;
  const recommended = BALANCE.stages[stageId]?.rec?.[0] ?? [1, 2, 3, 4, 4, 5, 6][Number(stageId.slice(1)) - 1] ?? 1;
  return base * 1.04 ** Math.max(0, Math.min(30, highestLevel) - recommended);
}
import {emberDef} from '../sim/ember-evolution.js';
const COMMON = ['whirl20', 'ember20', 'lunge20', 'skeletal', 'boneRevivalReady', 'invasionRole', 'id', 'kind', 'pid', 'type', 'team', 'x', 'y', 'r', 'facing', 'moving', 'hp', 'maxHp', 'dead', 'terminal',
  'rootUntil', 'lineage', 'invisibleUntil', 'curse', 'berserk', 'handedness', 'offhand', 'shieldModel', 'shieldGuard', 'focusResetUntil', 'weapon', 'weaponForm', 'combo', 'slow', 'sunder', 'frozenUntil', 'shieldUntil', 'shieldCharges', 'skills', 'sizeScale', 'eliteVariant', 'spawnLeft', 'staggerLeft', 'channel', 'deathCause'];
const MOTION = ['speed', 'dodgeDisabled', 'dodgeCdMult', 'iframeBonusMs', 'kx', 'ky', 'hurtInvuln',
  // Own-pawn prediction inputs (act timing, cooldowns, buffered dodge, mana gate).
  'mpRegen', 'hpRegen', 'effectiveInt', 'silverWeapon', 'cdMult', 'attackSpeedBonus', 'weaponWeight', 'armorWeight', 'bufferDodge', 'bufferDodgeDir', 'potionHealMult'];
const HUD = ['greenPotions', 'greenActive', 'greenMods', 'greenBase', 'effectiveAgi', 'mp', 'maxMp', 'potions', 'manaPotions', 'potionCd', 'scrolls', 'scrollRetry', 'loadRatio', 'cds', 'dodge'];
const select = (obj, keys) => Object.fromEntries(keys.filter(k => obj[k] !== undefined).map(k => [k, obj[k]]));
export function encodeSnapshot(world, inputSeqs = null, profiles = {}) {
  return { t: 'snapshot', statusVersion:1, tick: world.tick, arena: world.arena, threat: world.threat,
    round: select(world.round, ['stageId', 'state', 't', 'goal', 'timerTicks', 'threat', 'invasion', 'invasionExitAt']),
    ...(world.round.objective ? { objective: structuredClone(world.round.objective) } : {}), pending: world.round.pending.length,
    entities: world.entities.map(e => ({ ...select(e, COMMON), ...(e.poison ? {poison:{left:e.poison.left}} : {}), ...(e.burn ? { burn: select(e.burn, ['expiresTick']) } : {}), ...(e.kind === 'player' ? { ...select(e, HUD), ...select(e, MOTION), ...select(e, ['skillMasteryLevels']),
        pendingCounter: !!e.pendingCounter,
        ...(profiles[e.pid]?.skillMasteryLevels ? { skillMasteryLevels: { ...profiles[e.pid].skillMasteryLevels } } : {}),
        ...(inputSeqs ? { lastInputSeq: inputSeqs[e.pid] ?? 0 } : {}) } : {}),
      x: q(e.x), y: q(e.y), hp: q(e.hp),
      act: e.act ? select(e.act, ['id', 'whirl20', ...(e.act.whirl20 ? ['rate'] : []), 'ember20', 'castTick', 'lunge20', 'growth', 'zonePoint', 'step', 'executionSuccess', 'phase', 'elapsed', 'total', 'facing', 'ox', 'oy', 'counter', 'counterSecond', 'doubleCounter', 'counterTarget', 'firstCounterDamage',
        ...(e.kind === 'player' ? ['left', 'phaseTicks', 'dashStep', 'shotsFired', 'fired'] : [])]) : null })),
    ...(world.zones?.length ? { zones: world.zones.map(z => select(z, ['id', 'ownerId', 'team', 'abilityId', 'x', 'y', 'ox', 'oy', 'castTick', 'facing', 'startTick', 'activeTick', 'endTick', 'nextTick', 'intervalTicks', 'pulsesLeft', 'radius'])) } : {}),
    projectiles: world.projectiles.map(p => ({ ...select(p, ['id', 'ownerId', 'abilityId', 'step', 'x', 'y', 'r', 'vx', 'vy']), x: q(p.x), y: q(p.y) })),
    telegraphs: getTelegraphs(world) };
}
export function decodeSnapshot(packet, uid) {
  if (packet?.t !== 'snapshot' || !Number.isSafeInteger(packet.tick) || !Array.isArray(packet.entities)) return null;
  if (!validZones(packet.zones)) return null;
  // Ember origin/point are unquantized on the wire: no range-increasing rounding allowance.
  const pointValid=(x,y,ox,oy)=>[x,y,ox,oy].every(Number.isFinite) && x>=0 && y>=0 && x<=packet.arena?.w && y<=packet.arena?.h && ox>=0 && oy>=0 && ox<=packet.arena?.w && oy<=packet.arena?.h && Math.hypot(x-ox,y-oy)<=560+1e-10;
  const expires = (n,cap) => Number.isSafeInteger(n) && n>=0 && n<=packet.tick+cap;
  for (const e of packet.entities) {
    if (e.skillMasteryLevels !== undefined && !validMasteryLevels(e.skillMasteryLevels)) return null;
    if(e.ember20!==undefined && (e.ember20!==true || e.kind!=='player')) return null;
    if(e.act?.id==='ember_bolt' && !!e.ember20!==!!e.act.ember20) return null;
    if(e.act?.ember20!==undefined) {
      const a=e.act,phases=['windup','lock','active','recovery'];
      const releaseElapsed=a.phaseTicks?.windup+a.phaseTicks?.lock;
      if (!pointValid(a.zonePoint?.x,a.zonePoint?.y,a.ox,a.oy) || !Number.isSafeInteger(a.castTick) || a.castTick<0 || a.castTick+a.elapsed!==packet.tick || typeof a.fired!=='boolean' || a.fired!==(a.elapsed>releaseElapsed)) return null;
      if(a.ember20!==true || !e.ember20 || a.id!=='ember_bolt' || !phases.includes(a.phase) || !a.phaseTicks || Object.keys(a.phaseTicks).length!==4 || phases.some(k=>!Number.isSafeInteger(a.phaseTicks[k])||a.phaseTicks[k]<0||a.phaseTicks[k]>120) || !Number.isSafeInteger(a.left)||a.left<1||a.left>a.phaseTicks[a.phase] || a.total!==a.phaseTicks.windup+a.phaseTicks.lock || a.elapsed!==phases.slice(0,phases.indexOf(a.phase)).reduce((n,k)=>n+a.phaseTicks[k],0)+a.phaseTicks[a.phase]-a.left || !a.zonePoint || ![a.zonePoint.x,a.zonePoint.y,a.ox,a.oy,a.facing].every(Number.isFinite) || a.zonePoint.x<0||a.zonePoint.y<0||a.zonePoint.x>packet.arena.w||a.zonePoint.y>packet.arena.h) return null;
    }
    if(e.whirl20!==undefined && (e.whirl20!==true || e.kind!=='player')) return null;
    if(e.act?.id==='whirl' && !!e.whirl20!==!!e.act.whirl20) return null;
    if(e.act?.whirl20!==undefined) {
      const a=e.act, phases=['windup','lock','active','recovery'];
      if(a.whirl20!==true || !e.whirl20 || a.id!=='whirl' || !phases.includes(a.phase)
        || !a.phaseTicks || Object.keys(a.phaseTicks).length!==4
        || phases.some(k=>!Number.isSafeInteger(a.phaseTicks[k]) || a.phaseTicks[k]<0 || a.phaseTicks[k]>120)
        || ![a.rate,a.ox,a.oy,a.facing].every(Number.isFinite) || a.rate<=0 || a.rate>100
        || !Number.isSafeInteger(a.castTick) || a.castTick<0 || a.castTick+a.elapsed!==packet.tick
        || a.phaseTicks.windup!==Math.max(1,ticks(ABILITIES.whirl.windupMs/a.rate)) || a.phaseTicks.lock!==0
        || a.phaseTicks.active!==whirlTimeline(Math.max(1,ticks(ABILITIES.whirl.activeMs/a.rate))).total
        || a.phaseTicks.recovery!==Math.max(1,ticks(ABILITIES.whirl.recoveryMs/a.rate))
        || !Number.isSafeInteger(a.left) || a.left<1 || a.left>a.phaseTicks[a.phase]
        || !Number.isSafeInteger(a.elapsed) || a.elapsed!==phases.slice(0,phases.indexOf(a.phase)).reduce((n,k)=>n+a.phaseTicks[k],0)+a.phaseTicks[a.phase]-a.left
        || a.total!==a.phaseTicks.windup+a.phaseTicks.lock) return null;
    }
    if (e.lunge20 !== undefined && e.lunge20 !== true) return null;
    if (e.act?.id==='lunge' && !!e.lunge20!==!!e.act.lunge20) return null;
    if (e.act?.lunge20 !== undefined) {
      const a=e.act;
      if (a.lunge20!==true || !e.lunge20 || a.id!=='lunge' || !['windup','lock','active','recovery'].includes(a.phase)
        || !a.phaseTicks || Object.keys(a.phaseTicks).length!==4
        || ['windup','lock','active','recovery'].some(k=>!Number.isSafeInteger(a.phaseTicks[k]) || a.phaseTicks[k]<0 || a.phaseTicks[k]>120)
        || a.phaseTicks.active<5 || !Number.isFinite(a.dashStep) || a.dashStep<0 || a.dashStep>95
        || !Number.isSafeInteger(a.left) || a.left<1 || a.left>a.phaseTicks[a.phase]
        || !Number.isSafeInteger(a.elapsed) || a.elapsed<0 || a.elapsed>480 || !Number.isFinite(a.facing)) return null;
      const phases=['windup','lock','active','recovery'];
      const before=phases.slice(0,phases.indexOf(a.phase)).reduce((n,k)=>n+a.phaseTicks[k],0);
      if (a.elapsed!==before+a.phaseTicks[a.phase]-a.left || a.total!==a.phaseTicks.windup+a.phaseTicks.lock) return null;
    }
    if (e.greenPotions !== undefined && (!Number.isSafeInteger(e.greenPotions) || e.greenPotions < 0)) return null;
    if (e.greenActive !== undefined && typeof e.greenActive !== 'boolean') return null;
    for (const key of ['greenMods', 'greenBase']) if (e[key] !== undefined) {
      const value = e[key];
      const keys = key === 'greenBase' ? ['speed','attackSpeedBonus','dodgeCdMult','iframeBonusMs','effectiveAgi'] : ['speed','attackSpeedBonus','dodgeCdMult','iframeBonusMs'];
      if (!value || typeof value !== 'object' || Object.keys(value).length !== keys.length || keys.some(k => !Number.isFinite(value[k]) || value[k] < 0)) return null;
    }
    if (e.effectiveAgi !== undefined && (!Number.isFinite(e.effectiveAgi) || e.effectiveAgi < 0)) return null;
    if (e.greenActive && (!e.greenBase || !e.greenMods || e.greenPotions === undefined)) return null;
    if(e.shieldModel !== undefined && !validShieldModel(e.shieldModel)) return null;
    if (e.rootUntil !== undefined && !expires(e.rootUntil,90)) return null;
    if (e.poison && (!Number.isSafeInteger(e.poison.left) || e.poison.left<1 || e.poison.left>210 || Object.keys(e.poison).some(k=>k!=='left'))) return null;
    if (e.shieldCharges !== undefined && (!Number.isSafeInteger(e.shieldCharges) || e.shieldCharges < 1 || e.shieldCharges > 3 || !expires(e.shieldUntil,360))) return null;
    if (e.invisibleUntil !== undefined && !expires(e.invisibleUntil,150)) return null;
    if (e.curse && (!expires(e.curse.expiresTick,210) || !(e.curse.damageMult>=.7 && e.curse.damageMult<=1) || !(e.curse.armorMult>=.5 && e.curse.armorMult<=1))) return null;
    if (e.berserk && (!expires(e.berserk.expiresTick,210) || !(e.berserk.damageMult>=1.15 && e.berserk.damageMult<=1.3) || !(e.berserk.speedMult>=1.15 && e.berserk.speedMult<=1.3) || e.berserk.incomingMult!==1.2)) return null;
  }
  const ids=new Set();
  for(const z of packet.zones||[]) if(z.abilityId==='ember_bolt') {
    const owner=packet.entities.find(e=>e.id===z.ownerId);
    if (!pointValid(z.x,z.y,z.ox,z.oy) || !Number.isSafeInteger(z.castTick) || z.castTick<0 || z.castTick>z.startTick || owner?.kind!=='player' || !(owner.hp>0) || (packet.zones||[]).filter(a=>a.id===z.id).length!==1 || (packet.projectiles||[]).some(a=>a.id===z.id)) return null;
    const a=owner.act;
    if (a?.ember20 && z.startTick>=a.castTick && (a.castTick!==z.castTick || !a.fired || a.zonePoint.x!==z.x || a.zonePoint.y!==z.y || a.ox!==z.ox || a.oy!==z.oy || a.facing!==z.facing || z.startTick!==a.castTick+a.phaseTicks.windup+a.phaseTicks.lock)) return null;
    if(ids.has(z.id)||packet.entities.some(e=>e.id===z.id)||!owner?.ember20||owner.dead||owner.terminal||owner.channel>0||owner.team!==z.team||z.activeTick-z.startTick!==12||z.endTick!==z.activeTick||z.nextTick!==z.activeTick||z.startTick>packet.tick||z.activeTick<packet.tick||z.x<0||z.y<0||z.x>packet.arena.w||z.y>packet.arena.h||['radius','intervalTicks','pulsesLeft','dmgMult'].some(k=>z[k]!==undefined))return null;
    ids.add(z.id);
  }
  const copy = structuredClone(packet);
  copy.zones ||= [];
  for (const e of copy.entities) if (e.act) e.act.def = e.act.counter ? ABILITIES[e.act.id] : comboDef(e.act.id, e.act.step, e.weaponForm);
  for(const e of copy.entities) if(e.act?.ember20) e.act.def=emberDef(ABILITIES.ember_bolt);
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
  currentTick(now, rtt = 0) {
    const latest = this.frames.at(-1)?.world.tick;
    if (latest === undefined) return 0;
    // Minimum arrival offset includes one-way transit; ping estimates that term.
    return Math.max(latest, Math.min(latest + 7,
      Math.floor((now - this.clock + Math.max(0, Number.isFinite(rtt) ? rtt / 2 : 0)) / TICK_MS)));
  }
  sample(now, rtt = 0) {
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
    // Only positions are buffered. HP stays newest; guest action clocks advance to estimated host now.
    const positionTick = span > 0 ? a.world.tick + alpha * span : a.world.tick;
    return currentTelegraphs({ ...latest.world, positionTick, entities: interpolate('entities'), projectiles: interpolate('projectiles') }, this.currentTick(now, rtt));
  }
}
export function localView(world, uid) {
  const player = world.entities.find(e => e.kind === 'player' && e.pid === uid);
  return { ...world, entities: player ? [player, ...world.entities.filter(e => e !== player)] : world.entities };
}

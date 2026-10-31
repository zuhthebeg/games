import {volleyWave} from '../sim/volley-evolution.js';
import {frostDef} from '../sim/frost-evolution.js';
import {pierceDef} from '../sim/pierce-evolution.js';
import {emberDef,lockEmberPoint} from '../sim/ember-evolution.js';
import { whirlTimeline } from '../sim/whirl-evolution.js';
import { lungeTimeline, nextLungeFrame } from '../sim/lunge-evolution.js';
// Display-only replay of the host's stepPlayer() for the guest's own pawn: the same
// tick order, act timeline (windup/lock/active/recovery speed factors, dash steps),
// buffered dodge and skill/basic starts, so prediction matches the host while
// attacking/casting. It never deals damage, emits events or touches a sim world.
// Kept honest by test/net-player-prediction.test.js, which replays it against the
// real host step() every tick.
import { useGreenPotion } from '../sim/green-potion.js';
import { dodgeViewTick, dodgeInputViewTick } from '../sim/dodge-lag.js';
import { DT, ticks, dist2, shapeHitsCircle } from '../sim/core.js';
import { ABILITIES, WEAPONS, PLAYER_BASE as PB, canUseSkill } from '../content/combat.js';
import { attackRate } from '../content/balance.js';
import { updateShieldGuard, shieldRushPosition, movementInput, dodgeStart, walkingPosition, dashPosition, knockPosition, arenaPosition } from '../sim/movement.js';

import { tickCombo, resetCombo, beginCombo, finishCombo, comboDef, nextComboStep } from '../sim/basic-combo.js';

import { lockSpellPoint } from '../sim/spell-zones.js';

import { skillGrowth } from '../content/skill-growth.js';

const PHASES = ['windup', 'lock', 'active', 'recovery'];
const SKILL_EDGES = ['skillEdge', 'skill2Edge', 'skill3Edge'];
const AUTO_AIM_RANGE = 560, AUTO_SHOT_REACH = 0.85;
const targetable = e => !e.dead && !e.terminal && !(e.spawnLeft > 0);
const canCancel = act => !act || (act.def.cancelInto || []).includes(act.phase);

// Positions the guest cannot know (host-only collisions, hits) are left to reconciliation.
export function predictionBlocked(p) {
  return !p || p.dead || p.terminal || p.channel > 0 || p.staggerLeft > 0;
}

function endAct(p) {
  const act = p.act;
  // Execution outcomes are host-only. Never predict a cooldown for an unresolved attempt.
  const cd = ticks((act.def.executeUndead && !act.executionSuccess ? 0 : act.def.cooldownMs || 0) * (p.cdMult || 1));
  if (cd) p.cds = { ...p.cds, [act.id]: cd };
  finishCombo(p, act);
  p.act = null;
}
function skipEmptyPhases(p) {
  const act = p.act;
  while (act && act.left === 0) {
    const i = PHASES.indexOf(act.phase);
    if (i === PHASES.length - 1) { endAct(p); return; }
    act.phase = PHASES[i + 1];
    act.left = act.phaseTicks[act.phase];
    if (act.phase === 'active' && act.def.delivery === 'dash') act.dashStep = act.def.dash.distance / Math.max(1, act.left);
    if (act.phase === 'active' && act.left === 0) act.left = 1;
  }
}
function startAct(p, abilityId, facing, tick) {
  if (abilityId !== 'invisibility') delete p.invisibleUntil;
  const step = beginCombo(p, abilityId);
  const base=comboDef(abilityId,step,p.weaponForm);
  const def=abilityId==='frost_lance' && p.frost20 ? frostDef(base) : abilityId==='pierce_shot' && p.pierce20 ? pierceDef(base) : abilityId==='ember_bolt' && p.ember20 ? emberDef(base) : base;
  const rate = abilityId === WEAPONS[p.weapon].basic || p.skills.includes(abilityId)
    ? attackRate(p.attackSpeedBonus, p.weaponWeight, p.loadRatio, p.armorWeight, p.weapon) * (p.berserk?.speedMult ?? 1) : 1;
  const phaseTicks = Object.fromEntries(PHASES.map(phase => {
    const ms = def[`${phase}Ms`] || 0;
    return [phase, ms > 0 || phase === 'active' ? Math.max(1, ticks(ms / (def.burst && phase === 'active' ? 1 : rate))) : 0];
  }));
  const flame=abilityId==='flame_ring' && p.flame20===true;
  if(flame)phaseTicks.active=4;
  const cleave=abilityId==='heavy_cleave' && p.cleave20===true;
  if(cleave)phaseTicks.active=4;
  const volley=abilityId==='volley' && p.volley20===true;
  if(volley) phaseTicks.active=4;
  const whirl=abilityId==='whirl' && p.whirl20===true;
  if(whirl) phaseTicks.active=whirlTimeline(phaseTicks.active).total;
  const evolution = abilityId === 'lunge' && p.lunge20 === true;
  if (evolution) phaseTicks.active=lungeTimeline(phaseTicks.active).total;
  const growth = skillGrowth(abilityId, p.skillMasteryLevels?.[abilityId]);
  p.act = { ...(abilityId==='blast_arrow' && p.blast20 ? {blast20:true,rate,castTick:tick,fired:false} : {}), ...(flame ? {flame20:true,rate,castTick:tick,fired:false} : {}), ...(cleave ? {cleave20:true,rate,castTick:tick,fired:false} : {}), ...(volley ? {volley20:true,rate,castTick:tick,shotsFired:0,fired:false} : {}), ...(abilityId==='frost_lance' && p.frost20 ? {frost20:true,rate,castTick:tick} : {}), ...(abilityId==='pierce_shot' && p.pierce20 ? {pierce20:true,rate,castTick:tick} : {}), ...(whirl ? {whirl20:true,rate,castTick:tick} : {}), ...(abilityId==='ember_bolt' && p.ember20 ? {ember20:true} : {}), ...(growth && (ABILITIES[abilityId].requiresSkeleton || abilityId === 'protective_shield' || abilityId === 'berserk' || abilityId === 'sword_wave' || growth.count !== skillGrowth(abilityId).count) ? { growth } : {}), ...(evolution ? {lunge20:true} : {}), ...(step ? { step } : {}), id: abilityId, def, phase: 'windup', left: phaseTicks.windup, elapsed: 0, phaseTicks, total: phaseTicks.windup + phaseTicks.lock, facing, ox: p.x, oy: p.y, dashStep: 0 };
  p.facing = facing;
  skipEmptyPhases(p);
}
function resolveAim(p, inp, mlen, others) {
  if (inp.aimX || inp.aimY) return Math.atan2(inp.aimY, inp.aimX);
  let best = null, bestD = AUTO_AIM_RANGE * AUTO_AIM_RANGE;
  for (const e of others) {
    if (e.team === p.team || !targetable(e) || e.invisibleUntil) continue;
    const d2 = dist2(p.x, p.y, e.x, e.y);
    if (d2 < bestD) { bestD = d2; best = e; }
  }
  if (best) return Math.atan2(best.y - p.y, best.x - p.x);
  if (mlen > 0.15) return Math.atan2(inp.my, inp.mx);
  return p.facing;
}
function basicReachTarget(p, def, others) {
  let best = null, bestD = Infinity;
  for (const e of others) {
    if (e.team === p.team || !targetable(e) || e.invisibleUntil) continue;
    const d2 = dist2(p.x, p.y, e.x, e.y);
    if (d2 >= bestD) continue;
    const reach = def.delivery === 'shape'
      ? shapeHitsCircle(def.shape, p.x, p.y, Math.atan2(e.y - p.y, e.x - p.x), e.x, e.y, e.r)
      : d2 <= (def.projectile.rangePx * AUTO_SHOT_REACH) ** 2;
    if (reach) { bestD = d2; best = e; }
  }
  return best;
}

// One host tick for the guest's own pawn. `others` = latest known entities (auto-aim only).
export function predictPlayerTick(state, inp, { arena, others = [], tick = 0, multiplayerDodge = false, onAutoAttack } = {}) {
  if (predictionBlocked(state)) return state.act?.flame20 || state.act?.cleave20 || state.act?.volley20 || state.act?.whirl20 || state.act?.lunge20 || state.act?.ember20 ? {...state,act:null} : state;
  const p = { ...state, ...(state.shieldGuard ? {shieldGuard:{...state.shieldGuard}} : {}), dodge: { ...state.dodge }, cds: { ...state.cds }, act: state.act ? { ...state.act } : null, ...(state.combo ? { combo: { ...state.combo } } : {}) };
  if (p.invisibleUntil && p.invisibleUntil <= tick) delete p.invisibleUntil;
  if (p.berserk && (p.berserk.expiresTick <= tick || !canUseSkill('berserk',p.weapon,p.weaponForm,p.lineage,p.handedness))) delete p.berserk;
  const rooted=p.rootUntil>tick;
  if (rooted) {p.dodge.dashLeft=0;p.bufferDodge=0;p.kx=0;p.ky=0;p.moving=false;}
  else if (p.rootUntil) delete p.rootUntil;
  tickCombo(p);
  const d = p.dodge;
  if (inp.attack) delete p.invisibleUntil;
  const guarding=updateShieldGuard(p,inp);
  if (d.cdLeft > 0) d.cdLeft--;
  if (d.iframeLeft > 0) d.iframeLeft--;
  if (p.hurtInvuln > 0) p.hurtInvuln--;
  if (p.potionCd > 0) p.potionCd--;
  if (p.scrollRetry > 0) p.scrollRetry--;
  if (p.bufferDodge > 0) p.bufferDodge--;
  for (const k in p.cds) if (p.cds[k] > 0) p.cds[k]--;
  p.mp = Math.min(p.maxMp, p.mp + (p.mpRegen || 0) * DT);
  if (p.hpRegen > 0) p.hp = Math.min(p.maxHp, p.hp + p.hpRegen * DT);
  const { mlen, mx, my } = movementInput(inp);
  if (inp.dodgeEdge && !rooted && !p.dodgeDisabled && (p.offhand !== 'shield' || inp.dodgeHeld)) {
    p.bufferDodge = ticks(PB.bufferMs);
    p.bufferDodgeDir = p.offhand === 'shield' && (inp.aimX || inp.aimY)
      ? [Math.cos(Math.atan2(inp.aimY,inp.aimX)),Math.sin(Math.atan2(inp.aimY,inp.aimX))]
      : p.offhand !== 'shield' && mlen > 0.2 ? [mx, my] : [Math.cos(p.facing), Math.sin(p.facing)];
  }
  const finish = () => { Object.assign(p, knockPosition(p)); Object.assign(p, arenaPosition(p, arena)); return p; };
  if (p.bufferDodge > 0 && d.cdLeft === 0 && d.dashLeft === 0 && canCancel(p.act)) {
    if (p.act) endAct(p);
    resetCombo(p);
    const start = inp.dodgeEdge ? dodgeViewTick(tick, inp.viewTick, multiplayerDodge) : tick;
    const movement = dodgeStart(p, p.bufferDodgeDir, start, multiplayerDodge);
    movement.dodge.iframeLeft = Math.max(0, movement.dodge.iframeLeft - (tick - start));
    Object.assign(d, movement.dodge); if (movement.shieldGuard) { p.shieldGuard=movement.shieldGuard; p.shieldGuard.left=1; } p.facing = movement.facing; p.bufferDodge = 0; p.pendingCounter = null;
  }
  if (guarding && p.act?.id !== 'shield_bash') { if(p.act)endAct(p); p.moving=false; return finish(); }
  if(p.act?.id === 'shield_bash') {
    const act=p.act;
    if(!rooted && act.phase === 'active') Object.assign(p,shieldRushPosition(p,act.dashStep,others,arena));
    p.facing=act.facing;p.moving=act.phase === 'active';
    act.elapsed++;act.left--;skipEmptyPhases(p);
    return finish();
  }
  const dodgeSkillEdge = SKILL_EDGES.find(k => inp[k]);
  const dodgeSkillId = p.skills?.[SKILL_EDGES.indexOf(dodgeSkillEdge)];
  const dodgeSkill = ABILITIES[dodgeSkillId];
  if (dodgeSkill?.dodgeShot && canUseSkill(dodgeSkillId, p.weapon, p.weaponForm, p.lineage, p.handedness)
    && !rooted && !p.dodgeDisabled && d.cdLeft === 0 && d.dashLeft === 0 && canCancel(p.act)
    && !(p.cds[dodgeSkillId] > 0) && p.mp >= dodgeSkill.manaCost) {
    const facing = resolveAim(p, inp, mlen, others);
    if (p.act) endAct(p);
    resetCombo(p);
    const dir = mlen > .2 ? [mx, my] : [-Math.cos(facing), -Math.sin(facing)];
    const start = dodgeViewTick(tick, dodgeInputViewTick(inp, dodgeSkillEdge), multiplayerDodge);
    const movement = dodgeStart(p, dir, start, multiplayerDodge);
    movement.dodge.iframeLeft = Math.max(0, movement.dodge.iframeLeft - (tick - start));
    Object.assign(d, movement.dodge);
    p.pendingCounter = null; p.bufferDodge = 0;
    p.mp -= dodgeSkill.manaCost;
    startAct(p, dodgeSkillId, facing, tick);
  }
  if (d.dashLeft > 0) {
    if (p.act?.def.dodgeShot) { p.act.elapsed++; p.act.left--; skipEmptyPhases(p); }
    const movement = dashPosition(p);
    Object.assign(d, movement.dodge); p.x = movement.x; p.y = movement.y; p.moving = movement.moving;
    return finish();
  }
  if (inp.greenEdge) useGreenPotion(p);
  // Potions share one cooldown and gate later skill casts through MP.
  if (inp.potionEdge && p.potions > 0 && p.potionCd === 0 && p.hp < p.maxHp) {
    p.potions--; p.potionCd = ticks(PB.potion.cooldownMs);
    p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * PB.potion.healFrac * p.potionHealMult));
  }
  if (inp.manaEdge && p.manaPotions > 0 && p.potionCd === 0 && p.mp < p.maxMp) {
    p.manaPotions--; p.potionCd = ticks(PB.potion.cooldownMs);
    p.mp = Math.min(p.maxMp, p.mp + Math.round(PB.manaPotion * p.potionHealMult));
  }
  if (inp.scrollEdge && p.scrolls > 0 && p.scrollRetry === 0 && !p.act) {
    p.channel = ticks(PB.scroll.channelMs); p.moving = false;
    return finish();
  }
  const w = WEAPONS[p.weapon];
  const skillPressed = SKILL_EDGES.some(k => inp[k]);
  const skillId = p.skills?.[SKILL_EDGES.findIndex(k => inp[k])];
  if (skillId && !(skillId==='blast_arrow' && p.act?.blast20) && !(skillId==='flame_ring' && p.act?.flame20) && !(skillId==='heavy_cleave' && p.act?.cleave20) && !(skillId==='volley' && p.act?.volley20) && !ABILITIES[skillId]?.dodgeShot && canUseSkill(skillId, p.weapon, p.weaponForm, p.lineage, p.handedness) && canCancel(p.act)) {
    const def = ABILITIES[skillId];
    if (!(p.cds[skillId] > 0) && p.mp >= (def.manaCost || 0) && (!def.minHp || p.hp >= def.minHp) && !((def.burst || def.zone || def.status || skillId === 'sword_wave') && p.act?.id === skillId)) {
      if (p.act) endAct(p);
      p.mp -= def.manaCost || 0;
      startAct(p, skillId, resolveAim(p, inp, mlen, others), tick);
      if (p.act.ember20) {
        p.act.zonePoint=lockEmberPoint(p,inp,p.act.facing,others,arena,tick);
        p.act.facing=Math.atan2(p.act.zonePoint.y-p.y,p.act.zonePoint.x-p.x);
      }
      else if (def.zone || def.groundTarget) p.act.zonePoint = lockSpellPoint(p, p.act.facing, others, arena, Math.hypot(inp.aimX || 0, inp.aimY || 0), def.zone || def.groundTarget);
    }
  }
  const autoTarget = !p.invisibleUntil && !inp.attack && typeof inp.autoStart !== 'boolean' && inp.autoAttack && !p.act && !(p.cds[w.basic] > 0)
    ? basicReachTarget(p, comboDef(w.basic, nextComboStep(p), p.weaponForm), others) : null;
  if (!p.act && (inp.attack || inp.autoStart || autoTarget) && !(p.cds[w.basic] > 0)
    && (!p.pendingCounter || p.bufferDodge > 0 || skillPressed || inp.scrollEdge)) {
    const facing = autoTarget ? Math.atan2(autoTarget.y - p.y, autoTarget.x - p.x) : resolveAim(p, inp, mlen, others);
    if (autoTarget) onAutoAttack?.(facing);
    startAct(p, w.basic, facing, tick);
  }
  if (p.act) {
    const act = p.act;
    p.facing = act.facing;
    if(act.blast20 && act.phase==='active')act.fired=true;
    if(act.volley20 && act.phase==='active') {const wave=volleyWave(act.phaseTicks.active-act.left);if(wave) {act.shotsFired=wave;act.fired=true;}}
    if (act.phase === 'active' && act.def.status && !act.fired) {
      act.fired=true;
      if (act.def.status === 'invisibility') {p.invisibleUntil=tick+ticks(act.growth.durationMs);p.pendingCounter=null;}
      if (act.def.status === 'berserk') p.berserk={...act.growth,expiresTick:tick+ticks(act.growth.durationMs)};
    }
    if (act.phase === 'active' && act.def.spin) p.facing += Math.PI * 2 * (act.phaseTicks.active - act.left) / Math.max(1, act.phaseTicks.active - 1);
    const lunge=act.lunge20 && act.phase==='active' ? nextLungeFrame(act) : null;
    if (lunge) {act.dashStep=lunge.distance;p.moving=!!lunge.segment;}
    if (!rooted && act.phase === 'active' && act.def.delivery === 'dash' && (!lunge || lunge.segment)) {
      if(act.id === 'shield_bash') Object.assign(p,shieldRushPosition(p,act.dashStep,others,arena));
      else {p.x += Math.cos(act.facing) * act.dashStep; p.y += Math.sin(act.facing) * act.dashStep;} p.moving = true;
    }
    act.elapsed++; act.left--;
    skipEmptyPhases(p);
  }
  if (!rooted) Object.assign(p, walkingPosition(p, inp));
  return finish();
}

// Decide automatic basic starts on the same tick/order as replay (cooldowns,
// dodge, potions and skills included). autoStart is an edge, not held attack.
// Keep autoAttack for old hosts; new hosts use the explicit autoStart contract.
// Without a live prediction the host keeps deciding auto starts.
export function guestTickInput(state, input, context) {
  if (!state || !context?.enabled || context.roundEnded) return input;
  const command = { ...input, autoStart: false };
  if (!input.autoAttack || input.attack) return command;
  predictPlayerTick(state, input, { ...context, onAutoAttack(facing) {
    command.autoStart = true;
    if (!input.aimX && !input.aimY) { command.aimX = Math.cos(facing); command.aimY = Math.sin(facing); }
  } });
  return command;
}

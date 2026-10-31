import {blast20,blastComponent,BLAST_CIRCLE} from './blast-evolution.js';
import {flame20,flameShape} from './flame-evolution.js';
import {cleave20,cleaveShape} from './cleave-evolution.js';
import {volley20,VOLLEY_WAVES,volleyWave} from './volley-evolution.js';
import {frost20,frostDef} from './frost-evolution.js';
import {ember20,emberDef,emberDamage,lockEmberPoint} from './ember-evolution.js';
import {pierce20,pierceDef} from './pierce-evolution.js';
import { whirl20, whirlTimeline, nextWhirlFrame } from './whirl-evolution.js';
import { lunge20, lungeTimeline, nextLungeFrame } from './lunge-evolution.js';
import { useGreenPotion, clearGreenPotion } from './green-potion.js';
import {BOSS_TUNING, isBossType} from '../content/boss-tuning.js';
import { recordAttackPoses, bindAttackPose, attackShapeHits } from './attack-lag.js';
import { separateBodyPair } from './body-contact.js';
// Deterministic round simulation. Host-authoritative in multiplayer (design §7.5, §15.2):
// the host calls step() at 30Hz with every player's input; guests render snapshots.
// Inputs are per-tick: booleans named *Edge are true only on the tick the button went down
// (the input layer latches presses until the next sim tick consumes them).

import {
  DT, ticks, rand, pickWeighted, turnToward, dist2, shapeHitsCircle, segmentCircleEntry,
  TEAM_PLAYER, TEAM_MONSTER,
} from './core.js';
import { ABILITIES, WEAPONS, MONSTERS, STAGES, PLAYER_BASE, SKILL_SLOTS, canUseSkill, weaponAttackMultiplier } from '../content/combat.js';
import { SANCTUARY } from '../content/sanctuary.js';

import { MONSTER_VARIANTS } from '../content/monsters.js';

import { BALANCE, statEffect, attackRate, threatMultipliers, FRIENDLY_PROJECTILE_DAMAGE, monsterSizeProfile } from '../content/balance.js';

import { validShieldModel, shieldSpec } from '../content/shields.js';
import { updateShieldGuard, shieldRushPosition, shieldBlocks, shieldDamage, loadEffects, movementInput, dodgeStart, walkingPosition, dashPosition, knockPosition, arenaPosition } from './movement.js';
export { loadEffects } from './movement.js';

import { resetGuestDodgeHits, pruneGuestHits, recordGuestHit, trackGuestKnock, rewindGuestDodge } from './dodge-lag.js';

import { createObjective, stepObjective } from './quest-objectives.js';

import { tickCombo, resetCombo, beginCombo, finishCombo, comboDef, nextComboStep } from './basic-combo.js';

import { enableMultiplayerDodge, multiplayerDodge, dodgeTiming } from './dodge-policy.js';

import { lockSpellPoint, zoneContains, MAX_ZONES } from './spell-zones.js';

import { skillGrowth, boundedMasteryLevels } from '../content/skill-growth.js';

const PB = PLAYER_BASE;
const AUTO_AIM_RANGE = 560;
const AUTO_SHOT_REACH = 0.85; // auto attack fires shots only inside 85% of their range
const SPAWN_IN_MS = 700;
const BASIC_ABILITIES = new Set(Object.values(WEAPONS).map((w) => w.basic));
export const SKILL_EDGES = ['skillEdge', 'skill2Edge', 'skill3Edge'];

// Up to three skill slots (skills-v2 §2). Unknown or weapon-forbidden ids become empty;
// an empty first slot falls back to the kit skill, except a staff-locked request
// stays empty so a blocked button cannot silently cast the weapon kit instead.
export function playerSkills(mods, weapon) {
  const ids = Array.isArray(mods.skills) ? mods.skills : [mods.skill];
  const slots = Array.from({ length: SKILL_SLOTS }, (_, i) => (canUseSkill(ids[i], weapon, mods.weaponForm, mods.lineage, mods.handedness) ? ids[i] : null));
  if (!slots[0] && !ABILITIES[ids[0]]?.requiresFocus && !ABILITIES[ids[0]]?.requiresSkeleton && !ABILITIES[ids[0]]?.requiresTwohand && ids[0] !== 'sword_wave') slots[0] = WEAPONS[weapon].skill;
  return slots;
}

export function emptyInput() {
  return { mx: 0, my: 0, aimX: 0, aimY: 0, attack: false, autoAttack: false, skillEdge: false, skill2Edge: false, skill3Edge: false, dodgeEdge: false, dodgeHeld: false, potionEdge: false, manaEdge: false, scrollEdge: false };
}

export function createWorld({ seed = 1, threat = 1, arena = { w: 1400, h: 860 }, partyHpMult = 1, multiplayerDodge: multiDodge = false } = {}) {
  threatMultipliers(threat);
  const world = {
    tick: 0, rng: seed >>> 0, nextId: 1, arena, threat, partyHpMult,
    entities: [], projectiles: [], events: [],
    majorBusyBy: 0, // EncounterDirector majorAttackToken: one big attack at a time early on (design §7.1)
    round: null,
  };
  if (multiDodge) enableMultiplayerDodge(world);
  return world;
}

// mods come from the meta layer (level, stats, gear). The sim never reads stats directly.
export function addPlayer(world, { pid, weapon = 'blade', x, y, facing = 0, dodgeEnabled = true, mods = {}, skillMasteryLevels }) {
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
    ...(['skeleton_knight','skeleton_mage','skeleton_archer'].includes(mods.lineage) ? {lineage:mods.lineage} : {}),
    ...(ember20(skillMasteryLevels) ? {ember20:true} : {}),
    ...(blast20(skillMasteryLevels) ? {blast20:true} : {}),
    ...(flame20(skillMasteryLevels) ? {flame20:true} : {}),
    ...(cleave20(skillMasteryLevels) ? {cleave20:true} : {}),
    ...(volley20(skillMasteryLevels) ? {volley20:true} : {}),
    ...(frost20(skillMasteryLevels) ? {frost20:true} : {}),
    ...(pierce20(skillMasteryLevels) ? {pierce20:true} : {}),
    ...(whirl20(skillMasteryLevels) ? {whirl20:true} : {}),
    ...(lunge20(skillMasteryLevels) ? {lunge20:true} : {}),
    ...(skillMasteryLevels ? { skillMasteryLevels: boundedMasteryLevels(skillMasteryLevels) } : {}),
    x: x ?? world.arena.w * 0.22, y: y ?? world.arena.h * 0.5, r: PB.r, facing,
    kx: 0, ky: 0, moving: false,
    hp: maxHp, maxHp, mp: maxMp, maxMp, mpRegen: mods.mpRegen ?? PB.mpRegen,
    hpRegen: mods.hpRegen ?? 0, critChance: mods.critChance ?? 0, critMult: mods.critMult ?? 1.5,
    speed: PB.speed * (mods.speedMult ?? 1),
    dmgMult: { blade: 1, bow: 1, focus: 1, ...(mods.dmgMult || {}) },
    ...(mods.effectiveInt !== undefined ? { effectiveInt: Number.isFinite(mods.effectiveInt) ? Math.max(0, Math.min(10000, mods.effectiveInt)) : 0 } : {}),
    ...( ['fire', 'frost', 'holy'].includes(mods.staffAffinity) ? { staffAffinity: mods.staffAffinity } : {}),
    ...(weapon === 'blade' && mods.handedness === 2 ? {handedness:2} : {}),
    ...(mods.silverWeapon === true ? { silverWeapon: true } : {}),
    cdMult: mods.cdMult ?? 1,
    attackSpeedBonus: mods.attackSpeedBonus ?? 0, weaponWeight: mods.weaponWeight ?? 8,
    // Keep legacy no-armor serialized traces byte-identical.
    ...(mods.armorWeight ? { armorWeight: mods.armorWeight } : {}),
    ...((weapon === 'blade' || weapon === 'focus' && mods.weaponForm === 'wand') && mods.handedness !== 2 && mods.offhand === 'shield' ? {offhand:'shield',...(validShieldModel(mods.shieldModel) ? {shieldModel:{v:1,type:mods.shieldModel.type}} : {})} : {}),
    pendingCounter: null,
    dodgeCdMult: mods.dodgeCdMult ?? 1, iframeBonusMs: mods.iframeBonusMs ?? 0,
    potionHealMult: mods.potionHealMult ?? 1, poiseMult: mods.poiseMult ?? 1, loadRatio: 0, ac: Math.max(0, mods.ac ?? 0),
    ...(mods.weaponForm ? { weaponForm: mods.weaponForm } : {}),
    // Melee guard only on blade pawns so bow/focus serialized traces stay byte-identical.
    ...(weapon === 'blade' && BALANCE.melee.guard !== 1 ? { guard: BALANCE.melee.guard } : {}),
    skills: playerSkills(mods, weapon),
    weapon, act: null, cds: {},
    dodge: { cdLeft: 0, iframeLeft: 0, dashLeft: 0, dx: 0, dy: 0, startedTick: -9999, perfectPaid: false },
    // Explicit fixture capability only; absent on every legacy player.
    ...(dodgeEnabled === false ? { dodgeDisabled: true } : {}),
    bufferDodge: 0, bufferDodgeDir: [0, 0],
    hurtInvuln: 0,
    ...(mods.greenPotions > 0 && mods.greenMods ? {
      greenPotions: mods.greenPotions, greenActive: false, effectiveAgi: mods.effectiveAgi,
      greenMods: {speed: PB.speed * mods.greenMods.speedMult, attackSpeedBonus: mods.greenMods.attackSpeedBonus, dodgeCdMult: mods.greenMods.dodgeCdMult, iframeBonusMs: mods.greenMods.iframeBonusMs},
    } : {}),
    potions: mods.potions ?? 3, manaPotions: mods.manaPotions ?? 0, potionCd: 0,
    scrolls: mods.scrolls ?? 1, scrollRetry: 0, channel: 0,
    ...(mods.boneRevival === true ? { boneRevival: true, boneRevivalReady: true } : {}),
    dead: false, terminal: null, deathCause: null,
  };
  tickCombo(ent);
  world.entities.push(ent);
  return ent;
}

export function spawnMonster(world, type, x, y, { hpMult = 1, dmgMult = 1, elite = false, threat = 1, stageId = null, facing = Math.PI } = {}) {
  const def = MONSTERS[type];
  if (!def) throw new Error(`unknown monster ${type}`);
  const tuning = BOSS_TUNING[type];
  hpMult *= tuning?.hp || 1;
  dmgMult *= tuning?.damage || 1;
  const size = stageId ? monsterSizeProfile(stageId, elite, type === 'goblin_chief', rand(world))
    : { scale: 1, mean: 1, hp: 1 };
  const ent = {
    id: world.nextId++, kind: 'monster', type, team: TEAM_MONSTER,
    x, y, r: def.r * size.scale * (tuning?.size || 1), sizeScale: size.scale, sizeMean: size.mean, sizeHpMult: size.hp, facing, kx: 0, ky: 0, moving: false,
    hp: Math.max(1, Math.round(def.hp * hpMult * size.hp)), maxHp: Math.max(1, Math.round(def.hp * hpMult * size.hp)),
    dmgMult, eliteVariant: elite, threat, stageId, poise: def.poise * (tuning?.poise || 1), maxPoise: def.poise * (tuning?.poise || 1),
    ...(tuning ? {speedMult:tuning.speed, cdMult:tuning.cooldown, thinkMult:tuning.think} : {}),
    act: null, cds: {}, lastActs: [], thinkLeft: ticks((400 + rand(world) * 400) * (tuning?.think || 1)),
    targetId: 0, strafe: rand(world) < 0.5 ? -1 : 1, staggerLeft: 0,
    spawnLeft: ticks(SPAWN_IN_MS), dead: false,
  };
  world.entities.push(ent);
  world.events.push({ type: 'spawn', id: ent.id, monster: type, elite, threat, x, y });
  return ent;
}

export function startStage(world, stageId, { playerSide = 'left' } = {}) {
  for (const p of world.entities) cancelVolley(world,p);
  cancelBlastShots(world);
  const st = STAGES[stageId];
  if (!st) throw new Error(`unknown stage ${stageId}`);
  if (world.zones) world.zones = [];
  for (const p of world.entities) if (p.act?.blast20 || p.act?.flame20 || p.act?.cleave20 || p.act?.whirl20 || p.act?.def.zone || p.act?.def.spin) endAct(world, p, true);
  if (world.projectiles.some(pr => ABILITIES[pr.abilityId]?.spin)) world.projectiles = world.projectiles.filter(pr => !ABILITIES[pr.abilityId]?.spin);
  for (const p of world.entities) if (p.kind === 'player') {resetGuestDodgeHits(p);if(p.shieldGuard)p.shieldGuard.left=0;delete p.invisibleUntil;delete p.berserk;delete p.curse;delete p.rootUntil;if(p.poison)p.poison=null;}
  if (st.arena) {
    for (const p of world.entities.filter(e => e.kind === 'player')) {
      p.x *= st.arena.w / world.arena.w; p.y *= st.arena.h / world.arena.h;
    }
    world.arena = { ...st.arena };
  }
  world.round = {
    stageId, threat: st.goal === 'timer' ? 1 : world.threat, state: 'running', t: 0, goal: st.goal,
    timerTicks: st.timerMs ? ticks(st.timerMs) : 0, maxConcurrent: st.maxConcurrent,
    pending: st.spawns.map((s) => ({ ...s, atTicks: ticks(s.at) })),
  };
  if (playerSide === 'right') {
    world.round.playerSide = 'right';
    world.round.pending = world.round.pending.map(s => ({ ...s, fx: 1 - s.fx }));
    for (const p of world.entities.filter(e => e.kind === 'player')) {
      p.x = world.arena.w - p.x; p.facing = Math.PI;
    }
  }
  if (st.objective) {
    world.round.objective = createObjective(st.objective, world.arena);
    if (playerSide === 'right') {
      const o = world.round.objective;
      // All existing objective geometry is owned by this round, not STAGES.
      for (const key of ['entry', 'token']) if (o[key]) o[key].x = world.arena.w - o[key].x;
      if (o.markers) o.markers = o.markers.map(p => ({ ...p, x: world.arena.w - p.x }));
    }
    for (const p of world.entities.filter(e => e.kind === 'player')) {
      p.x = world.round.objective.entry.x; p.y = world.round.objective.entry.y;
    }
  }
}

export function startSanctuary(world) {
  world.arena = { ...SANCTUARY.arena, obstacles: SANCTUARY.obstacles.map(obstacle => ({ ...obstacle })) };
  const players = world.entities.filter(entity => entity.kind === 'player');
  const firstX = SANCTUARY.spawn.x - (players.length - 1) * 22;
  for (const [index, player] of players.entries()) {
    player.x = firstX + index * 44;
    player.y = SANCTUARY.spawn.y;
  }
  world.round = {
    stageId: SANCTUARY.id, goal: 'sanctuary', state: 'running', t: 0,
    threat: 1, maxConcurrent: 0, pending: [],
  };
}

// Carry weight (design §8.3). The meta layer owns the weight math; the sim only applies the tier effects.
export function setLoad(world, pid, ratio) {
  const p = world.entities.find((e) => e.kind === 'player' && e.pid === pid);
  if (p) p.loadRatio = ratio;
}

const alive = (e) => !e.dead && !e.terminal;
const isTargetable = (e) => alive(e) && !(e.spawnLeft > 0);

export function cancelBlastShots(world,ownerId=null) {
 world.projectiles=world.projectiles.filter(pr=>{if(!pr.blast20 || ownerId!==null&&pr.ownerId!==ownerId)return true;world.events.push({type:'projectileEnd',id:pr.id,x:pr.x,y:pr.y,ability:pr.abilityId});return false;});
}
export function cancelVolley(world, ent) {if(ent.act?.flame20 || ent.act?.cleave20 || ent.act?.volley20) endAct(world,ent,true);}
function cancelBlockedVolley(world,p) {if((p.act?.flame20 || p.act?.cleave20 || p.act?.volley20) && (!alive(p)||p.hp<=0||p.terminal||p.channel>0||p.staggerLeft>0||world.round?.state!=='running')) cancelVolley(world,p);}

export function step(world, inputs = {}) {
  world.events = [];
  if(world.round?.state!=='running')cancelBlastShots(world);
  for(const pr of [...world.projectiles])if(pr.blast20&&!world.entities.some(e=>e.id===pr.ownerId&&!e.terminal))cancelBlastShots(world,pr.ownerId);
  if (world.round?.goal === 'sanctuary') {
    inputs = Object.fromEntries(world.entities.filter(entity => entity.kind === 'player').map(player => {
      const input = inputs[player.pid] || {};
      return [player.pid, { ...emptyInput(),
        mx: Number.isFinite(input.mx) ? input.mx : 0,
        my: Number.isFinite(input.my) ? input.my : 0 }];
    }));
  }
  for(const p of world.entities) cancelBlockedVolley(world,p);
  for (const p of world.entities) if (p.kind === 'player' && (p.dead || p.terminal || world.round?.state !== 'running')) clearGreenPotion(p);
  for(const p of world.entities) if((p.act?.flame20 || p.act?.cleave20 || p.act?.whirl20 || p.act?.ember20) && (p.dead||p.terminal||p.channel>0||world.round?.state!=='running')) endAct(world,p,true);
  recordAttackPoses(world);
  if (world.zones && world.round && world.round.state !== 'running') world.zones = [];
  // Only new objective rounds freeze here; legacy full-world traces stay byte-identical.
  if (world.round?.objective && world.round.state !== 'running') { for(const p of world.entities) {if(p.shieldGuard) p.shieldGuard.left=0;delete p.invisibleUntil;delete p.berserk;delete p.curse;delete p.rootUntil;if(p.poison)p.poison=null;} return world.events; }
  for (const ent of world.entities) {
    for (const key of ['curse','berserk']) if (ent[key] && (world.tick >= ent[key].expiresTick || !alive(ent) || world.round && world.round.state !== 'running' || key === 'berserk' && !canUseSkill('berserk',ent.weapon,ent.weaponForm,ent.lineage,ent.handedness))) delete ent[key];
    if (ent.invisibleUntil && (world.tick >= ent.invisibleUntil || !alive(ent) || world.round && world.round.state !== 'running')) delete ent.invisibleUntil;
    if (ent.shieldUntil && (world.tick >= ent.shieldUntil || !alive(ent))) { delete ent.shieldUntil; delete ent.shieldCharges; }
    if (ent.frozenUntil && (world.tick >= ent.frozenUntil || !alive(ent))) delete ent.frozenUntil;
    if (ent.rootUntil && (world.tick >= ent.rootUntil || !alive(ent) || world.round && world.round.state !== 'running')) delete ent.rootUntil;
    if (ent.poison) stepPoison(world, ent);
    if (ent.burn) stepBurn(world, ent);
    if (ent.slow && (world.tick >= ent.slow.expiresTick || !alive(ent))) delete ent.slow;
    if (ent.sunder && world.tick >= ent.sunder.expiresTick) delete ent.sunder;
    if (ent.kind === 'player') stepPlayer(world, ent, inputs[ent.pid] || emptyInput());
    else stepMonster(world, ent);
  }
  stepProjectiles(world);
  stepZones(world);
  separate(world);
  for (const ent of world.entities) clampToArena(world, ent);
  stepRound(world, inputs);
  for(const p of world.entities) cancelBlockedVolley(world,p);
  for (const p of world.entities) if (p.kind === 'player' && (p.dead || p.terminal || world.round?.state !== 'running')) clearGreenPotion(p);
  for(const p of world.entities) if(p.shieldGuard && (!alive(p) || world.round && world.round.state !== 'running')) p.shieldGuard.left=0;
  if (world.zones && world.round && world.round.state !== 'running') world.zones = [];
  if (world.round && world.round.state !== 'running') for (const e of world.entities) {delete e.invisibleUntil;delete e.berserk;delete e.curse;delete e.rootUntil;if(e.poison)e.poison=null;}
  for(const p of world.entities) if(p.act?.whirl20 && (!alive(p) || p.channel>0 || world.round?.state!=='running')) endAct(world,p,true);
  if(world.round?.state!=='running')cancelBlastShots(world);
  for(const pr of [...world.projectiles])if(pr.blast20&&world.entities.some(e=>e.id===pr.ownerId&&e.terminal))cancelBlastShots(world,pr.ownerId);
  world.tick++;
  return world.events;
}

// ---------------------------------------------------------------- players

function canCancel(act) {
  return !act || (act.def.cancelInto || []).includes(act.phase);
}

function stepPlayer(world, p, inp) {
  cancelBlockedVolley(world,p);
  const d = p.dodge;
  if ((p.act?.flame20 || p.act?.cleave20 || p.act?.whirl20 || p.act?.lunge20 || p.act?.ember20) && (!alive(p) || p.staggerLeft>0 || p.channel>0)) endAct(world,p,true);
  if (inp.attack) delete p.invisibleUntil;
  pruneGuestHits(p, world.tick);
  tickCombo(p);
  const guarding=updateShieldGuard(p,inp);
  if (d.cdLeft > 0) d.cdLeft--;
  if (d.iframeLeft > 0) d.iframeLeft--;
  if (p.hurtInvuln > 0) p.hurtInvuln--;
  if (p.potionCd > 0) p.potionCd--;
  if (p.scrollRetry > 0) p.scrollRetry--;
  if (p.bufferDodge > 0) p.bufferDodge--;
  for (const k in p.cds) if (p.cds[k] > 0) p.cds[k]--;
  if (!alive(p)) { p.pendingCounter = null; if(p.shieldGuard)p.shieldGuard.left=0; return; }
  const rooted = p.rootUntil > world.tick;
  if (rooted) { d.dashLeft=0; p.bufferDodge=0; p.kx=0; p.ky=0; p.moving=false; }
  if (!alive(p)) { p.pendingCounter = null; if(p.shieldGuard)p.shieldGuard.left=0; return; }
  if (p.pendingCounter && world.tick > p.pendingCounter.expiresTick) p.pendingCounter = null;

  p.mp = Math.min(p.maxMp, p.mp + p.mpRegen * DT);
  if (p.hpRegen > 0) p.hp = Math.min(p.maxHp, p.hp + p.hpRegen * DT);
  const { mlen, mx, my } = movementInput(inp);

  if (inp.dodgeEdge && !rooted && !p.dodgeDisabled && (p.offhand !== 'shield' || inp.dodgeHeld)) {
    p.bufferDodge = ticks(PB.bufferMs);
    p.bufferDodgeDir = p.offhand === 'shield' && (inp.aimX || inp.aimY)
      ? [Math.cos(Math.atan2(inp.aimY,inp.aimX)),Math.sin(Math.atan2(inp.aimY,inp.aimX))]
      : p.offhand !== 'shield' && mlen > 0.2 ? [mx, my] : [Math.cos(p.facing), Math.sin(p.facing)];
  }

  // return scroll channel (design §6.2): no move/attack; dodge cancels it voluntarily.
  if (p.channel > 0) {
    p.pendingCounter = null;
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
    resetCombo(p);
    const movement = dodgeStart(p, p.bufferDodgeDir, world.tick, multiplayerDodge(world));
    Object.assign(d, movement.dodge);
    p.facing = movement.facing;
    if (movement.shieldGuard) p.shieldGuard = {...movement.shieldGuard,left:1};
    p.pendingCounter = null;
    p.bufferDodge = 0;
    world.events.push({ type: 'dodge', id: p.id });
    rewindGuestDodge(world, p, inp, awardPerfectDodge);
    // Rewound focus contact already completed this dodge at its total blink endpoint.
    if (p.weapon === 'focus' && d.perfectPaid) {p.moving=false;decayKnock(p);return;}
  }

  if (p.pendingCounter?.kind === 'shield' && !p.act) {
    const pending=p.pendingCounter,target=world.entities.find(e=>e.id===pending.attackerId);
    p.pendingCounter=null;
    const liveTarget=target && isTargetable(target) && !(target.invisibleUntil>world.tick) && target.team!==p.team ? target : null;
    const x=liveTarget?.x ?? pending.fromX,y=liveTarget?.y ?? pending.fromY;
    startAct(world,p,'shield_bash',Number.isFinite(x)&&Number.isFinite(y)?Math.atan2(y-p.y,x-p.x):p.facing,true);
    p.act.counter=true;p.act.counterTarget=pending.attackerId;
    if(p.shieldGuard?.left>0)p.shieldGuard.facing=p.facing;
    world.events.push({type:'counter',id:p.id,pid:p.pid,attackerId:pending.attackerId,dodgeTick:pending.dodgeTick,ability:'shield_bash'});
  }
  if (guarding && p.act?.id !== 'shield_bash') {
    if(p.act) endAct(world,p,true);
    p.moving=false; decayKnock(p); return;
  }
  if (p.act?.id === 'shield_bash') { advanceAct(world,p); decayKnock(p); return; }

  // A dodge-shot must pass the same dodge gate; movement and perfect-dodge rewards
  // remain owned by the ordinary dodge machinery, never a fabricated counter.
  const dodgeSkillEdge = SKILL_EDGES.find(k => inp[k]);
  const dodgeSkillId = p.skills[SKILL_EDGES.indexOf(dodgeSkillEdge)];
  const dodgeSkill = ABILITIES[dodgeSkillId];
  if (dodgeSkill?.dodgeShot && canUseSkill(dodgeSkillId, p.weapon, p.weaponForm, p.lineage, p.handedness)
    && !rooted && !p.dodgeDisabled && d.cdLeft === 0 && d.dashLeft === 0 && canCancel(p.act)
    && !(p.cds[dodgeSkillId] > 0) && p.mp >= dodgeSkill.manaCost) {
    const facing = resolveAim(world, p, inp, mlen);
    if (p.act) endAct(world, p, true);
    resetCombo(p);
    const dir = mlen > .2 ? [mx, my] : [-Math.cos(facing), -Math.sin(facing)];
    Object.assign(d, dodgeStart(p, dir, world.tick, multiplayerDodge(world)).dodge);
    p.pendingCounter = null; p.bufferDodge = 0;
    p.mp -= dodgeSkill.manaCost;
    startAct(world, p, dodgeSkillId, facing);
    world.events.push({ type: 'dodge', id: p.id });
    rewindGuestDodge(world, p, inp, awardPerfectDodge, dodgeSkillEdge);
  }

  if (d.dashLeft > 0) {
    if (p.act?.def.dodgeShot) advanceAct(world, p);
    const movement = dashPosition(p);
    Object.assign(d, movement.dodge);
    p.x = movement.x; p.y = movement.y; p.moving = movement.moving;
    decayKnock(p);
    return;
  }

  if (inp.greenEdge && world.round?.state === 'running' && useGreenPotion(p)) world.events.push({type: 'greenPotion', id: p.id});
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
    p.pendingCounter = null;
    // Accepted return starts irrevocably cancel this owner's pending ember impacts.
    if (world.zones) world.zones=world.zones.filter(z=>z.abilityId!=='ember_bolt'||z.ownerId!==p.id);
    p.channel = ticks(PB.scroll.channelMs);
    world.events.push({ type: 'channelStart', id: p.id, ticks: p.channel });
    p.moving = false;
    decayKnock(p);
    return;
  }

  const w = WEAPONS[p.weapon];
  // First pressed slot wins this tick; an empty slot is a no-op.
  const skillPressed = SKILL_EDGES.some((k) => inp[k]);
  const skillId = p.skills[SKILL_EDGES.findIndex((k) => inp[k])];
  if (skillId && !(skillId==='blast_arrow' && p.act?.blast20) && !(skillId==='flame_ring' && p.act?.flame20) && !(skillId==='heavy_cleave' && p.act?.cleave20) && !(skillId==='volley' && p.volley20 && (world.round?.state!=='running' || p.act?.volley20)) && !(skillId==='whirl' && p.whirl20 && world.round?.state!=='running') && !ABILITIES[skillId]?.dodgeShot && canUseSkill(skillId, p.weapon, p.weaponForm, p.lineage, p.handedness) && canCancel(p.act)) {
    const def = skillId==='ember_bolt' && p.ember20 ? emberDef(ABILITIES[skillId]) : ABILITIES[skillId];
    if (!(p.cds[skillId] > 0) && p.mp >= (def.manaCost || 0) && (!def.minHp || p.hp >= def.minHp) && !((def.burst || def.status || skillId === 'sword_wave') && p.act?.id === skillId) && (!def.zone || p.act?.id !== skillId && (world.zones?.length || 0) + world.entities.filter(e => e !== p && e.act?.def.zone && !e.act.fired).length < MAX_ZONES)) {
      if (p.act) endAct(world, p, true);
      p.mp -= def.manaCost || 0;
      const sacrificed = def.hpCostFrac ? Math.min(p.hp-1,Math.max(1,Math.floor(p.hp*def.hpCostFrac))) : 0;
      p.hp -= sacrificed;
      startAct(world, p, skillId, resolveAim(world, p, inp, mlen));
      if (sacrificed) p.act.sacrificed = sacrificed;
      if (!p.act?.whirl20) bindAttackPose(world, p, p.act, inp, SKILL_EDGES.find(k => inp[k]));
      if (p.act.ember20) {
        p.act.zonePoint=lockEmberPoint(p,inp,p.act.facing,world.entities,world.arena,world.tick);
        p.act.facing=Math.atan2(p.act.zonePoint.y-p.y,p.act.zonePoint.x-p.x);
      }
      else if (def.zone || def.groundTarget) p.act.zonePoint = lockSpellPoint(p, p.act.facing, world.entities, world.arena, Math.hypot(inp.aimX || 0, inp.aimY || 0), def.zone || def.groundTarget);
    }
  }
  // Explicit controls win; a pending counter reserves the next basic slot,
  // including the iframe tail after dash movement. Never cancel a running act.
  if (!p.act && p.pendingCounter && d.iframeLeft === 0 && p.bufferDodge === 0
    && !skillPressed && !inp.scrollEdge) {
    const pending = p.pendingCounter;
    const target = world.entities.find((e) => e.id === pending.attackerId);
    const counterAbility = pending.kind === 'shield' ? 'shield_bash' : w.basic;
    const def = ABILITIES[counterAbility];
    const facing = target ? Math.atan2(target.y - p.y, target.x - p.x) : p.facing;
    const inRange = target && isTargetable(target) && !(target.invisibleUntil>world.tick) && target.team !== p.team
      && (def.delivery === 'shape'
        ? shapeHitsCircle(def.shape, p.x, p.y, facing, target.x, target.y, target.r)
        : dist2(p.x, p.y, target.x, target.y) <= def.projectile.rangePx ** 2);
    p.pendingCounter = null; // consume even when the original attacker is gone/out of reach
    if (inRange && !(p.cds[w.basic] > 0)) {
      startAct(world, p, counterAbility, facing, true);
      p.act.counter = true;
      p.act.counterTarget = target.id;
      if (pending.kind === 'second') { p.act.counterSecond = true; p.act.firstCounterDamage = pending.damage; }
      else if (p.weapon === 'blade' && p.weaponForm !== 'blunt' && p.offhand !== 'shield') p.act.doubleCounter = true;
      world.events.push({ type: 'counter', id: p.id, pid: p.pid, attackerId: target.id,
        dodgeTick: pending.dodgeTick, ability: counterAbility });
    }
  }

  // Auto attack (cocy 10-11 option): the basic attack is held for the player only while a
  // hostile is inside its real reach, aimed at that hostile. Dodge and skills stay manual.
  const autoTarget = !p.invisibleUntil && !inp.attack && typeof inp.autoStart !== 'boolean' && inp.autoAttack && !p.act && !(p.cds[w.basic] > 0)
    ? basicReachTarget(world, p, comboDef(w.basic, nextComboStep(p), p.weaponForm)) : null;
  if (!p.act && (inp.attack || inp.autoStart || autoTarget) && !(p.cds[w.basic] > 0)
    && (!p.pendingCounter || p.bufferDodge > 0 || skillPressed || inp.scrollEdge)) {
    startAct(world, p, w.basic, autoTarget ? Math.atan2(autoTarget.y - p.y, autoTarget.x - p.x) : resolveAim(world, p, inp, mlen));
    bindAttackPose(world, p, p.act, inp);
  }

  if (p.act) advanceAct(world, p);

  if (!rooted) Object.assign(p, walkingPosition(p, inp));
  decayKnock(p);
}

// Nearest hostile the basic attack would actually reach from here (shape) or comfortably reach (shot).
function basicReachTarget(world, p, def) {
  let best = null, bestD = Infinity;
  for (const e of world.entities) {
    if (e.team === p.team || !isTargetable(e) || e.invisibleUntil > world.tick) continue;
    const d2 = dist2(p.x, p.y, e.x, e.y);
    if (d2 >= bestD) continue;
    const reach = def.delivery === 'shape'
      ? shapeHitsCircle(def.shape, p.x, p.y, Math.atan2(e.y - p.y, e.x - p.x), e.x, e.y, e.r)
      : d2 <= (def.projectile.rangePx * AUTO_SHOT_REACH) ** 2;
    if (reach) { bestD = d2; best = e; }
  }
  return best;
}

function resolveAim(world, p, inp, mlen) {
  if (inp.aimX || inp.aimY) return Math.atan2(inp.aimY, inp.aimX);
  let best = null, bestD = AUTO_AIM_RANGE * AUTO_AIM_RANGE;
  for (const e of world.entities) {
    if (e.team === p.team || !isTargetable(e) || e.invisibleUntil > world.tick) continue;
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
  if (m.rootUntil > world.tick) {m.moving=false;m.kx=0;m.ky=0;}
  if (m.frozenUntil > world.tick) { m.moving = false; m.kx = 0; m.ky = 0; return; }
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
        startAct(world, m, pick.id, Math.atan2(target.y - m.y, target.x - m.x) + (ABILITIES[pick.id].aimOffsetDeg || 0) * Math.PI / 180);
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
  const eligible = e => e.kind === 'player' && alive(e) && e.team !== m.team && !(e.invisibleUntil > world.tick)
    && !(e.skeletal && MONSTERS[m.type]?.lifeState === 'undead' && !isBoss(m) && !m.provokedBy?.includes(e.id));
  let cur = world.entities.find((e) => e.id === m.targetId && eligible(e));
  let best = null, bestD = Infinity;
  for (const e of world.entities) {
    if (!eligible(e)) continue;
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
  if (m.rootUntil > world.tick) {m.moving=false;m.kx=0;m.ky=0;return;}
  const [lo, hi] = def.keepRange;
  const ang = Math.atan2(target.y - m.y, target.x - m.x);
  let dir;
  if (dist > hi) dir = ang;
  else if (dist < lo) dir = ang + Math.PI;
  else {
    if (rand(world) < 0.01) m.strafe = -m.strafe;
    dir = ang + (m.strafe * Math.PI) / 2;
  }
  const sp = (dist >= lo && dist <= hi ? def.speed * 0.45 : def.speed) * (m.slow?.speedMult ?? 1) * (m.speedMult || 1);
  m.x += Math.cos(dir) * sp * DT;
  m.y += Math.sin(dir) * sp * DT;
  m.facing = turnToward(m.facing, ang, (540 * Math.PI / 180) * DT);
  m.moving = sp > 0;
}

// ---------------------------------------------------------------- shared act machine

const PHASES = ['windup', 'lock', 'active', 'recovery'];

function startAct(world, ent, abilityId, facing, counter = false) {
  if (abilityId !== 'invisibility') delete ent.invisibleUntil;
  const comboStep = ent.kind === 'player' ? beginCombo(ent, abilityId, counter) : 0;
  const step = counter && ABILITIES[abilityId].combo ? 1 : comboStep;
  let def = counter ? ABILITIES[abilityId] : comboDef(abilityId, step, ent.weaponForm);
  if (abilityId==='frost_lance' && ent.frost20) def=frostDef(def);
  if (abilityId==='pierce_shot' && ent.pierce20) def=pierceDef(def);
  if (abilityId==='ember_bolt' && ent.ember20) def=emberDef(def);
  const authoredGrowth=skillGrowth(abilityId,ent.skillMasteryLevels?.[abilityId]);
  if (abilityId === 'poison_arrow') def={...def,damage:authoredGrowth.damage,poison:{...def.poison,damage:authoredGrowth.dotDamage,durationMs:authoredGrowth.durationMs}};
  if (abilityId === 'blood_spear') def={...def,damage:authoredGrowth.damage};
  const rate = ent.kind === 'player' && (abilityId === WEAPONS[ent.weapon].basic || ent.skills.includes(abilityId))
    ? attackRate(ent.attackSpeedBonus, ent.weaponWeight, ent.loadRatio, ent.armorWeight, ent.weapon) * (ent.berserk?.speedMult ?? 1) : 1;
  const phaseTicks = Object.fromEntries(PHASES.map((phase) => {
    const ms = def[`${phase}Ms`] || 0;
    return [phase, ms > 0 || phase === 'active' ? Math.max(1, ticks(ms / (def.burst && phase === 'active' ? 1 : rate))) : 0];
  }));
  const blast=abilityId==='blast_arrow' && ent.blast20===true;
  const flame=abilityId==='flame_ring' && ent.flame20===true;
  if(flame) phaseTicks.active=4;
  const cleave=abilityId==='heavy_cleave' && ent.cleave20===true;
  if(cleave) phaseTicks.active=4;
  const volley = abilityId==='volley' && ent.volley20===true;
  if(volley) phaseTicks.active=4;
  const whirl = abilityId === 'whirl' && ent.whirl20 === true;
  if (whirl) phaseTicks.active=whirlTimeline(phaseTicks.active).total;
  const evolution = abilityId === 'lunge' && ent.lunge20 === true;
  if (evolution) phaseTicks.active=lungeTimeline(phaseTicks.active).total;
  const growth = skillGrowth(abilityId, ent.skillMasteryLevels?.[abilityId]);
  ent.act = {
    ...(blast ? {blast20:true,castTick:world.tick,blastDamage:sourceMult(ent,def),blastPoise:ent.poiseMult??1} : {}),
    ...(flame ? {flame20:true,castTick:world.tick,flameDamage:sourceMult(ent,def),flamePoise:ent.poiseMult??1} : {}),
    ...(cleave ? {cleave20:true,castTick:world.tick,cleaveDamage:sourceMult(ent,def),cleavePoise:ent.poiseMult??1} : {}),
    ...(volley ? {volley20:true,castTick:world.tick,shotsFired:0,volleyMuzzle:ent.r+4,volleyDamage:sourceMult(ent,def),volleyPoise:ent.poiseMult??1} : {}),
    ...(growth && (ABILITIES[abilityId].requiresSkeleton || abilityId === 'protective_shield' || abilityId === 'berserk' || abilityId === 'sword_wave' || growth.count !== skillGrowth(abilityId).count) ? { growth } : {}),
    ...(abilityId==='ember_bolt' && ent.ember20 ? {ember20:true,castTick:world.tick} : {}),
    ...(abilityId==='frost_lance' && ent.frost20 ? {frost20:true,castTick:world.tick} : {}),
    ...(abilityId==='pierce_shot' && ent.pierce20 ? {pierce20:true,castTick:world.tick} : {}),
    ...(whirl ? {whirl20:true,castTick:world.tick,whirlBudgets:{}} : {}),
    ...(evolution ? {lunge20:true, lungeBudgets:{}} : {}), rate, phaseTicks,
    ...(step ? { step } : {}),
    id: abilityId, def, phase: 'windup', left: phaseTicks.windup, elapsed: 0,
    total: phaseTicks.windup + phaseTicks.lock,
    facing, ox: ent.x, oy: ent.y, hit: [], fired: false, dashStep: 0,
  };
  ent.facing = facing;
  if (def.major) world.majorBusyBy = ent.id;
  world.events.push({ type: 'act', id: ent.id, ability: abilityId, ...(step ? { step } : {}) });
  skipEmptyPhases(world, ent);
}

function skipEmptyPhases(world, ent) {
  const act = ent.act;
  while (act && act.left === 0) {
    const i = PHASES.indexOf(act.phase);
    if (i === PHASES.length - 1) { endAct(world, ent, false); return; }
    act.phase = PHASES[i + 1];
    act.left = act.phaseTicks[act.phase];
    if (!act.flame20 && !act.cleave20 && !act.volley20 && !act.whirl20 && !act.ember20 && (act.phase === 'lock' || (act.phase === 'active' && !act.def.anchored))) {
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
  const cd = ticks((act.def.executeUndead && !act.executionSuccess ? 0 : act.def.cooldownMs || 0) * (ent.cdMult || 1));
  if (cd) ent.cds[act.id] = cd;
  if (ent.kind === 'monster') {
    ent.lastActs = [act.id, ...ent.lastActs].slice(0, 2);
    ent.thinkLeft = ticks((220 + rand(world) * 380) * (ent.thinkMult || 1));
  }
  if (ent.kind === 'player') {
    finishCombo(ent, act, interrupted);
    if (!interrupted && act.doubleCounter && alive(ent)) ent.pendingCounter = {kind:'second',attackerId:act.counterTarget,damage:act.firstCounterDamage || {},dodgeTick:ent.dodge.startedTick,expiresTick:world.tick+ticks(BALANCE.counter.graceMs)};
  }
  ent.act = null;
  if (interrupted) world.events.push({ type: 'actCancel', id: ent.id, ability: act.id, ...(act.step ? { step: act.step } : {}) });
}

function advanceAct(world, ent, target) {
  const act = ent.act;
  const def = act.def;
  if (act.phase === 'windup') {
    if (def.trackTurnDeg && target) {
      const want = Math.atan2(target.y - ent.y, target.x - ent.x);
      act.facing = turnToward(act.facing, want, (def.trackTurnDeg * Math.PI / 180) * DT);
    }
    // Evolved casts keep immutable origin identity; shape contacts use current center.
    if (!act.flame20 && !act.cleave20 && !act.volley20 && !act.whirl20 && !act.ember20) { act.ox = ent.x; act.oy = ent.y; }
  }
  ent.facing = act.facing;
  // Bash movement is phase-owned, like prediction: no stale walking flag in
  // windup or stale active-rush flag in recovery/final frames.
  if (act.id === 'shield_bash') ent.moving = act.phase === 'active';
  if (act.phase === 'active') {
    if (def.spin) ent.facing = act.facing + Math.PI * 2 * (act.phaseTicks.active - act.left) / Math.max(1, act.phaseTicks.active - 1);
    doActive(world, ent, act);
  }
  if (!ent.act) return;
  act.elapsed++;
  act.left--;
  skipEmptyPhases(world, ent);
}

function doActive(world, ent, act) {
  const def = act.def;
  if (def.status) {
    if (act.fired) return;
    act.fired=true;
    const growth=act.growth, expiresTick=world.tick+ticks(growth.durationMs);
    if (def.status === 'invisibility') {
      ent.invisibleUntil=expiresTick; ent.pendingCounter=null;
      for (const foe of world.entities) if (foe.team !== ent.team && foe.targetId === ent.id) foe.targetId=0;
    } else if (def.status === 'root') {
      const point=act.zonePoint;
      for (const target of world.entities) {
        if (target.team === ent.team || !isTargetable(target) || MONSTERS[target.type]?.invulnerable || target.ccImmune || !shapeHitsCircle({...def.shape,radius:growth.radius},point.x,point.y,0,target.x,target.y,target.r)) continue;
        target.rootUntil=Math.max(target.rootUntil||0,world.tick+ticks(growth.durationMs/(isBoss(target)?3:1)));
        target.kx=0;target.ky=0;target.moving=false;
        if (target.dodge) {target.dodge.dashLeft=0;target.bufferDodge=0;}
        world.events.push({type:'root',src:ent.id,id:target.id,ability:act.id,x:target.x,y:target.y});
      }
      world.events.push({type:'handsBurst',id:ent.id,ability:act.id,x:point.x,y:point.y,radius:growth.radius});
    } else if (def.status === 'berserk') ent.berserk={...growth,expiresTick};
    else for (const target of world.entities) if (target.team !== ent.team && isTargetable(target) && shapeHitsCircle(def.shape,ent.x,ent.y,act.facing,target.x,target.y,target.r)) {
      const old=target.curse;
      target.curse={expiresTick:Math.max(expiresTick,old?.expiresTick||0),damageMult:Math.min(growth.damageMult,old?.damageMult??1),armorMult:Math.min(growth.armorMult,old?.armorMult??1)};
    }
    world.events.push({type:'statusCast',id:ent.id,ability:act.id});
  } else if (def.delivery === 'sacrifice') {
    if (act.fired) return;
    act.fired=true;
    const g=act.growth;
    for (const target of world.entities) if (target.team !== ent.team && isTargetable(target) && shapeHitsCircle({...def.shape,radius:g.radius},ent.x,ent.y,0,target.x,target.y,target.r)) {
      applyHit(world,target,{srcId:ent.id,srcKind:ent.kind,srcType:ent.weapon,abilityId:act.id,def:{...def,damage:act.sacrificed*g.damagePerHp},mult:1,poiseMult:1,fromX:ent.x,fromY:ent.y});
    }
    world.events.push({type:'explode',id:ent.id,presentationOwner:ent.id,ability:act.id,x:ent.x,y:ent.y,radius:g.radius});
    world.events.push({type:'statusCast',id:ent.id,ability:act.id});
  } else if (def.zone) {
    if (act.fired) return;
    act.fired = true;
    if ((world.zones?.length || 0) >= MAX_ZONES) return;
    const point = act.zonePoint;
    const growth = act.growth;
    const zone = { ...(act.ember20 ? {ox:act.ox,oy:act.oy,castTick:act.castTick} : {}), ...(growth?.radius ? {radius:growth.radius} : {}), ...(growth ? { pulsesLeft: growth.count, intervalTicks: ticks(growth.intervalMs) } : {}), id: world.nextId++, ownerId: ent.id, team: ent.team, abilityId: act.id,
      x: point.x, y: point.y, facing: act.facing, startTick: world.tick,
      activeTick: world.tick + ticks(def.zone.delayMs || 0),
      endTick: world.tick + ticks((def.zone.delayMs || 0) + (growth?.durationMs ?? (act.id === 'meteor' && growth ? (growth.count - 1) * growth.intervalMs : def.zone.durationMs || 0))),
      nextTick: world.tick + ticks(def.zone.delayMs || 0), dmgMult: sourceMult(ent, def) };
    (world.zones ||= []).push(zone);
    world.events.push({ type: 'zoneCast', id: ent.id, castId: zone.id, ability: act.id, x: zone.x, y: zone.y });
  } else if (def.executeUndead) {
    if (act.fired) return;
    act.fired = true;
    const target = world.entities.filter(t => t.kind === 'monster' && t.team !== ent.team && isTargetable(t)
      && t.hp > 0 && MONSTERS[t.type]?.lifeState === 'undead' && !MONSTERS[t.type].invulnerable
      && dist2(ent.x, ent.y, t.x, t.y) <= def.executeUndead.radius ** 2)
      .sort((a, b) => dist2(ent.x, ent.y, a.x, a.y) - dist2(ent.x, ent.y, b.x, b.y) || a.id - b.id)[0];
    act.executionSuccess = !!target && rand(world) < turnUndeadChance(ent.effectiveInt, isBoss(target), ent.staffAffinity === 'holy');
    world.events.push({ type: 'turnUndead', src: ent.id, dst: target?.id, ability: act.id,
      success: act.executionSuccess, x: target?.x ?? ent.x, y: target?.y ?? ent.y });
    if (act.executionSuccess) applyHit(world, target, { srcId: ent.id, srcKind: ent.kind, srcType: ent.weapon,
      abilityId: act.id, def, execute: true, mult: 1, poiseMult: 1, fromX: ent.x, fromY: ent.y });
  } else if (def.shield) {
    if (act.fired) return;
    act.fired = true;
    for (const target of world.entities) {
      if (target.kind !== 'player' || target.team !== ent.team || !alive(target) || target.hp <= 0
        || dist2(ent.x, ent.y, target.x, target.y) > def.shield.radius ** 2) continue;
      target.shieldUntil = world.tick + ticks(act.growth.durationMs);
      target.shieldCharges = act.growth.charges;
      world.events.push({ type: 'shield', src: ent.id, dst: target.id, ability: act.id, x: target.x, y: target.y });
    }
  } else if (def.heal) {
    if (act.fired) return;
    act.fired = true;
    world.events.push({ type: 'healCast', id: ent.id, ability: act.id,
      x: ent.x, y: ent.y, radius: def.heal.radius });
    for (const target of world.entities) {
      if ((target.kind === 'monster' && MONSTERS[target.type]?.lifeState === 'undead' || target.kind === 'player' && target.skeletal)
        && target.team !== ent.team && isTargetable(target) && target.hp > 0 && dist2(ent.x, ent.y, target.x, target.y) <= def.heal.radius ** 2) {
        applyHit(world, target, { srcId: ent.id, srcKind: ent.kind, srcType: ent.weapon, abilityId: act.id,
          def: { ...def, damage: 48 }, mult: sourceMult(ent, def), poiseMult: 1, fromX: ent.x, fromY: ent.y });
      }
      if (target.kind !== 'player' || target.team !== ent.team || !alive(target) || target.hp <= 0
        || dist2(ent.x, ent.y, target.x, target.y) > def.heal.radius ** 2) continue;
      const heal = Math.min(target.maxHp - target.hp, Math.round(target.maxHp * def.heal.maxHpFrac * (1 + BALANCE.stats.focusDamage * statEffect(ent.effectiveInt ?? BALANCE.stats.base)) * (ent.staffAffinity === 'holy' ? 1.2 : 1)));
      if (heal <= 0) continue;
      target.hp += heal;
      world.events.push({ type: 'heal', src: ent.id, dst: target.id, pid: target.pid, ability: act.id,
        heal, hp: target.hp, maxHp: target.maxHp, x: target.x, y: target.y });
    }
  } else if (def.delivery === 'shape') {
    const activeTick = act.phaseTicks.active - act.left;
    if (act.whirl20) {
      const {segment}=nextWhirlFrame(act);
      if(act.whirlSegment!==segment) {act.whirlSegment=segment;act.hit=[];}
    }
    if (def.repeatHitMs && activeTick > 0 && activeTick % ticks(def.repeatHitMs) === 0) act.hit = [];
    hitShape(world, ent, act, act.flame20 ? flameShape(activeTick) : act.cleave20 ? cleaveShape(activeTick) : def.shape, act.flame20 || act.cleave20 || def.anchored ? act.ox : ent.x, act.flame20 || act.cleave20 || def.anchored ? act.oy : ent.y);
  } else if (def.delivery === 'dash') {
    if (ent.rootUntil > world.tick) {ent.moving=false;return;}
    if (act.lunge20) {
      const frame=nextLungeFrame(act);
      ent.moving=frame.segment!==0;
      if (!frame.segment) return;
      if (act.lungeSegment!==frame.segment) {act.lungeSegment=frame.segment;act.hit=[];}
      act.dashStep=frame.distance;
    }
    if(act.id === 'shield_bash') Object.assign(ent,shieldRushPosition(ent,act.dashStep,world.entities,world.arena));
    else { ent.x += Math.cos(act.facing) * act.dashStep; ent.y += Math.sin(act.facing) * act.dashStep; }
    ent.moving = true;
    if (act.lunge20) Object.assign(ent,arenaPosition(ent,world.arena));
    hitShape(world, ent, act, { type: 'circle', radius: ent.r + def.dash.bodyPad, offset: 0 }, ent.x, ent.y);
  } else if (def.delivery === 'projectile') {
    const activeTick = act.phaseTicks.active - act.left;
    const wave=act.volley20 ? volleyWave(activeTick) : 0;
    if(act.volley20) {if(!wave || act.shotsFired>=wave) return;act.shotsFired=wave;}
    else if (def.burst) {
      const count = act.growth?.count ?? def.burst.count;
      if ((act.shotsFired || 0) >= count || (act.growth ? activeTick < Math.floor((act.shotsFired || 0) * act.phaseTicks.active / count) : activeTick % Math.max(1, ticks(def.burst.intervalMs)) !== 0)) return;
      act.shotsFired = (act.shotsFired || 0) + 1;
    } else if (act.fired) return;
    act.fired = true;
    const pr = act.id === 'blood_spear' ? {...def.projectile,rangePx:act.growth.range,pierce:act.growth.targets-1} : act.id === 'sword_wave' ? {...def.projectile,rangePx:act.growth.range,pierce:act.growth.targets-1} : def.projectile;
    const projectileIds=[];
    const offsets=act.volley20 ? VOLLEY_WAVES[wave-1] : null;
    for (let i = 0; i < (offsets?.length??pr.count); i++) {
      const spread = offsets ? offsets[i]*Math.PI/180 : pr.count > 1 ? ((i / (pr.count - 1)) - 0.5) * pr.spreadDeg * Math.PI / 180 : 0;
      const a = act.facing + spread + (def.spin ? Math.PI * 2 * (act.growth ? (act.shotsFired - 1) / act.growth.count : activeTick / act.phaseTicks.active) : 0);
      projectileIds.push(world.nextId);
      world.projectiles.push({
        ...(act.blast20 ? {blast20:true} : {}),
        ...(act.volley20 ? {volley20:true} : {}),
        id: world.nextId++, team: ent.team, ownerId: ent.id, ownerKind: ent.kind,
        ownerType: ent.type || ent.weapon, abilityId: act.id,
        ...(act.frost20 ? {frost20:true} : {}),
        ...(act.pierce20 ? {pierce20:true} : {}),
        ...(act.step || act.id === 'poison_arrow' || act.id === 'blood_spear' ? { ...(act.step ? {step:act.step} : {}), def } : {}),
        x: (act.volley20?act.ox:ent.x) + Math.cos(a) * (act.volley20?act.volleyMuzzle:ent.r+4), y: (act.volley20?act.oy:ent.y) + Math.sin(a) * (act.volley20?act.volleyMuzzle:ent.r+4),
        vx: Math.cos(a) * pr.speed, vy: Math.sin(a) * pr.speed, r: pr.radius,
        travelled: 0, range: pr.rangePx, pierce: pr.pierce, hit: [],
        dmgMult: (act.blast20?act.blastDamage:act.volley20?act.volleyDamage:sourceMult(ent, def)) * (act.counter ? BALANCE.counter.damage : 1),
        poiseMult: (act.blast20?act.blastPoise:act.volley20?act.volleyPoise:(ent.poiseMult ?? 1)) * (act.counter ? BALANCE.counter.poise : 1), counter: !!act.counter,
      });
    }
    world.events.push({ type: 'projectile', id: ent.id, ability: act.id, ...(act.volley20 ? {volley20:true,castTick:act.castTick,wave,ox:act.ox,oy:act.oy,facing:act.facing,projectileIds} : {}), ...(act.step ? { step: act.step } : {}) });
  }
}

// Boss identity is authored, not inferred from durability or random elite stats.
const isBoss = t => !!(isBossType(t.type) || t.boss || MONSTERS[t.type]?.boss || t.type === 'goblin_chief'
  || MONSTER_VARIANTS[t.type]?.speciesTags.includes('boss'));
export function turnUndeadChance(value, boss = false, holy = false) {
  const intelligence = Number.isFinite(value) ? Math.max(0, value) : 0;
  return boss ? Math.min(.009, Math.min(.008, .001 + intelligence * .00002) + (holy ? .001 : 0))
    : Math.min(.7, .10 + intelligence * .005 + (holy ? .05 : 0));
}

function sourceMult(ent, def) {
  if (ent.kind === 'player') return (ent.dmgMult[def.family] ?? 1) * (ent.curse?.damageMult ?? 1) * (ent.berserk?.damageMult ?? 1)
    * (def.family === 'focus' && def.element && def.element === ent.staffAffinity ? 1.25 : 1);
  return (ent.dmgMult ?? 1) * (ent.curse?.damageMult ?? 1);
}

function hitShape(world, ent, act, shape, ox, oy) {
  for (const t of world.entities) {
    if (t.team === ent.team || !isTargetable(t) || act.hit.includes(t.id)) continue;
    if (!attackShapeHits(world, ent, act, shape, ox, oy, t)) continue;
    if (act.counterSecond && !act.firstCounterDamage?.[t.id]) continue;
    act.hit.push(t.id);
    const dealt = applyHit(world, t, {
      srcId: ent.id, srcKind: ent.kind, srcType: ent.type || ent.weapon, abilityId: act.id,
      ...(act.counterSecond ? {fixedDamage:act.firstCounterDamage[t.id]*.7} : {}),
      ...(act.lunge20 ? {lungeAct:act} : {}),
      ...(act.whirl20 ? {whirlAct:act} : {}),
      def: act.def, counter: !!act.counter, ...(act.step ? { step: act.step } : {}),
      mult: (act.flame20 ? act.flameDamage : act.cleave20 ? act.cleaveDamage : sourceMult(ent, act.def)) * (act.counter ? BALANCE.counter.damage : 1),
      poiseMult: (act.flame20 ? act.flamePoise : act.cleave20 ? act.cleavePoise : (ent.poiseMult ?? 1)) * (act.id === 'slash' && ent.kind === 'player' && ent.weaponForm === 'blunt' ? 1.4 : 1)
        * (act.counter ? BALANCE.counter.poise : 1), fromX: act.flame20 || act.cleave20 ? act.ox : ent.x, fromY: act.flame20 || act.cleave20 ? act.oy : ent.y,
      cause: { shape, ox: act.flame20 || act.whirl20 ? ox : act.ox, oy: act.flame20 || act.whirl20 ? oy : act.oy, facing: act.facing },
    });
    if (act.doubleCounter && dealt) (act.firstCounterDamage ||= {})[t.id] = dealt;
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

function awardPerfectDodge(world, t, hit, sinceDodge) {
  const attacker = world.entities.find((e) => e.id === hit.srcId);
  // Orphaned hostile shots count as perfect, but cannot schedule a counter.
  const hostile = attacker ? attacker.team !== t.team : hit.srcKind !== 'player';
  if (hit.counter || !hostile || t.dodge.perfectPaid || sinceDodge < 0
    || sinceDodge > dodgeTiming(t, multiplayerDodge(world)).perfectTicks) return false;
  t.dodge.perfectPaid = true;
  if (t.weapon === 'focus' && t.offhand !== 'shield') {
    const length=Math.hypot(t.dodge.dx,t.dodge.dy)||1;
    t.x=(t.dodge.originX ?? t.x)+t.dodge.dx/length*PB.dodge.distance*1.6;
    t.y=(t.dodge.originY ?? t.y)+t.dodge.dy/length*PB.dodge.distance*1.6;
    Object.assign(t,arenaPosition(t,world.arena));t.dodge.dashLeft=0;t.pendingCounter=null;
    if (!(t.focusResetUntil > world.tick)) {
      for (const id of t.skills.filter(Boolean)) t.cds[id]=0;
      t.focusResetUntil=world.tick+ticks(8000);
    }
  } else if (attacker || t.offhand === 'shield') t.pendingCounter = { ...(t.offhand === 'shield' ? {kind:'shield',fromX:hit.fromX,fromY:hit.fromY} : {}), attackerId: hit.srcId, dodgeTick: t.dodge.startedTick,
    expiresTick: t.dodge.startedTick + Math.max(ticks(t.offhand === 'shield' ? 400 : PB.dodge.dashMs),
      dodgeTiming(t, multiplayerDodge(world)).iframeTicks) + ticks(BALANCE.counter.graceMs) };
  world.events.push({ type: 'perfectDodge', id: t.id, pid: t.pid, attackerId: hit.srcId,
    srcId: hit.srcId, dodgeTick: t.dodge.startedTick, ability: hit.abilityId, ...(t.offhand === 'shield' ? {kind:'block'} : t.weapon === 'focus' ? {kind:'blink'} : {}) });
  return true;
}

function applyHit(world, t, hit) {
  if (!alive(t) || t.hp <= 0) return;
  let def = hit.def;
  if (t.kind === 'player') {
    if ((!hit.periodic || hit.zonePulse) && t.dodge.iframeLeft > 0) {
      if (!awardPerfectDodge(world, t, hit, world.tick - t.dodge.startedTick)) {
        world.events.push({ type: 'miss', id: t.id, ability: hit.abilityId });
      }
      return;
    }
    if ((!hit.periodic || hit.zonePulse) && t.hurtInvuln > 0) return;
  }
  const mdef = t.kind === 'monster' ? MONSTERS[t.type] : null;
  const splitAct=hit.lungeAct || hit.whirlAct;
  const budgets=hit.whirlAct ? splitAct.whirlBudgets : splitAct?.lungeBudgets;
  const prior=budgets?.[t.id];
  let dmg = prior?.damage ?? (hit.fixedDamage ?? def.damage * hit.mult);
  if (prior && hit.whirlAct) dmg *= Math.min(1,(t.guard || 1)/prior.guard);
  // Fixed follow-up counters already include the first hit's silver bonus; DOT and
  // execution bypass specialization. No RNG or timing change for ordinary weapons.
  if (!prior && hit.srcKind === 'player' && (!hit.periodic || hit.weaponZone) && !hit.execute && hit.fixedDamage === undefined) {
    const source=world.entities.find(e=>e.id===hit.srcId);
    dmg *= weaponAttackMultiplier(source?.silverWeapon, hit.abilityId, t.skeletal ? 'undead' : mdef?.lifeState, source?.handedness);
  }
  if (!prior && hit.fixedDamage === undefined && mdef && t.burn && world.tick <= t.burn.expiresTick) dmg *= 1.1;
  if (!prior && hit.fixedDamage === undefined && mdef && t.sunder && world.tick < t.sunder.expiresTick) dmg *= ABILITIES.armor_break.sunder.damageMult;
  let exposed = false;
  if (!prior && mdef && hit.fixedDamage === undefined) {
    if (t.staggerLeft > 0) { dmg *= 1.3; exposed = true; }
    else if (t.act && t.act.phase === 'recovery') { dmg *= 1.15; exposed = true; }
  }
  if (!prior && t.kind === 'player' && t.ac > 0 && (!hit.periodic || hit.weaponZone)) dmg *= BALANCE.armor.k / (BALANCE.armor.k + t.ac * (t.curse?.armorMult ?? 1));
  if (!prior && mdef && t.curse && hit.fixedDamage === undefined) dmg *= 2 - t.curse.armorMult;
  if (!prior && t.kind === 'player' && shieldSpec(t.shieldModel)?.undeadWard && !hit.execute) {
    const source=world.entities.find(e=>e.id===hit.srcId);
    if(source?.skeletal || MONSTERS[source?.type]?.lifeState === 'undead') dmg *= 1-shieldSpec(t.shieldModel).undeadWard;
  }
  if (!prior && t.berserk) dmg *= t.berserk.incomingMult;
  if (!prior && t.kind === 'player' && t.guard && !hit.periodic) dmg *= t.guard;
  // LUK crit (cocy 10-12): players' direct hits only; no RNG draw at 0% so luck-less runs stay identical.
  let crit = prior?.crit ?? false;
  if (!prior && mdef && !hit.periodic && !hit.execute && hit.fixedDamage === undefined) {
    const src = world.entities.find((e) => e.id === hit.srcId);
    if (hit.counter && src?.weapon === 'bow') { crit=true;dmg*=1.8; }
    else if (src?.kind === 'player' && src.critChance > 0 && rand(world) < src.critChance) { crit = true; dmg *= src.critMult; }
  }
  dmg = hit.execute ? t.hp : Math.max(1, Math.round(dmg));
  if (splitAct) {
    // First-only gets floor(B/2), second-only ceil(B/2); both exactly B.
    // Freeze the target budget on first contact, before stagger/exposure can change it.
    if (!prior) budgets[t.id]={damage:dmg,crit,...(hit.whirlAct ? {guard:t.guard||1} : {})};
    def={...def,poise:(def.poise||0)/2,knockback:(def.knockback||0)/2};
  }
  const blocked = t.kind === 'player' && shieldBlocks(t,hit);
  if (blocked) {
    if (awardPerfectDodge(world,t,hit,world.tick-t.dodge.startedTick)) {
      world.events.push({type:'shieldBlock',id:t.id,src:hit.srcId,dmg:0});return;
    }
    dmg=shieldDamage(dmg,t.shieldModel);
  }
  if (splitAct) {
    // Guard rounding belongs to the whole cast budget, not each half.
    const budget=budgets[t.id];
    budget.defendedDamage ??= dmg;
    const defended=Math.min(budget.defendedDamage,dmg);
    dmg=(hit.whirlAct ? splitAct.whirlSegment : splitAct.lungeSegment)===1 ? Math.floor(defended/2) : Math.ceil(defended/2);
  }
  const attacker = world.entities.find(e => e.id === hit.srcId);
  const hostile = attacker ? attacker.team !== t.team : hit.srcKind !== 'player';
  if (t.kind === 'player' && dmg > 0 && hostile && t.shieldUntil > world.tick) {
    t.shieldCharges = Math.max(0, (t.shieldCharges ?? 1) - 1);
    if (!t.shieldCharges) { delete t.shieldUntil; delete t.shieldCharges; }
    world.events.push({ type: 'shieldBreak', remaining: t.shieldCharges ?? 0, id: t.id, src: hit.srcId, ability: hit.abilityId, x: t.x, y: t.y });
    return;
  }
  if (blocked) {
    world.events.push({type:'shieldBlock',id:t.id,src:hit.srcId,dmg});
  }
  if (mdef && attacker?.kind === 'player' && hostile && (attacker.skeletal || attacker.boneRevival)) t.provokedBy = [...new Set([...(t.provokedBy || []), attacker.id])];
  if (mdef && mdef.invulnerable) t.hp = Math.max(1, t.hp); // scarecrow: takes hits, never dies
  else t.hp -= dmg;

  if (dmg > 0) delete t.invisibleUntil;
  const kbResist = mdef ? mdef.kbResist : 0;
  const ang = Math.atan2(t.y - hit.fromY, t.x - hit.fromX);
  const kb = (def.knockback || 0) * (1 - kbResist) * DT * 2.2;
  if (t.kind === 'player') {
    const recordHit=splitAct ? {...hit} : hit;
    if (splitAct) {delete recordHit.lungeAct;delete recordHit.whirlAct;}
    recordGuestHit(world, t, blocked ? {...recordHit,shieldBlocked:true} : recordHit, dmg, Math.cos(ang) * kb, Math.sin(ang) * kb);
  }
  t.kx += Math.cos(ang) * kb;
  t.ky += Math.sin(ang) * kb;
  world.events.push({ type: 'hit', src: hit.srcId, dst: t.id, dmg, x: t.x, y: t.y, exposed, ability: hit.abilityId, ...(hit.counter ? { counter: true } : {}), ...(crit ? { crit: true } : {}), ...(hit.periodic && (mdef || hit.abilityId === 'poison_arrow') ? { periodic: true } : {}), ...(hit.zonePulse ? { zonePulse: true } : {}), ...(hit.castId ? { castId: hit.castId } : {}), ...(hit.step ? { step: hit.step } : {}) });

  if (def.poison && t.hp > 0 && !mdef?.invulnerable) {
      const status = def.poison;
      const left = ticks(status.durationMs);
      const interval = ticks(status.intervalMs);
      const dotHit = { ...hit, periodic: true, def: { damage: status.damage, knockback: 0 } };
      if (!t.poison) {
        t.poison = { left, interval, next: interval, hit: dotHit };
        world.events.push({ type: 'poison', id: t.id, ability: hit.abilityId, x:t.x, y:t.y });
      } else {
        t.poison.left = Math.max(t.poison.left, left);
        if (status.damage * hit.mult > t.poison.hit.def.damage * t.poison.hit.mult) {
          t.poison.hit = dotHit;
          t.poison.interval = interval;
        }
      }
    }

  if (t.kind === 'player') {
    if(!hit.periodic && t.pendingCounter?.kind === 'shield')t.pendingCounter=null;
    if (!hit.periodic && t.act?.id === 'shield_bash') {endAct(world,t,true);t.pendingCounter=null;}
    if (!hit.periodic) { t.hurtInvuln = ticks(PB.hurtInvulnMs); resetCombo(t); }
    if (t.channel > 0) {
      t.channel = 0;
      t.scrollRetry = ticks(PB.scroll.retryMs);
      world.events.push({ type: 'channelBroken', id: t.id });
    }
    if (t.hp <= 0 && t.boneRevivalReady) {
      t.boneRevivalReady = false;
      t.skeletal = true;
      t.hp = Math.max(1, Math.round(t.maxHp * 0.3));
      t.poison = null;
      delete t.invisibleUntil; delete t.curse; delete t.berserk; delete t.burn; delete t.frozenUntil; delete t.rootUntil; t.poison=null; delete t.slow; delete t.sunder; delete t.shieldUntil; delete t.shieldCharges;
      t.pendingCounter = null; t.channel = 0; t.kx = 0; t.ky = 0;
      if (t.shieldGuard) t.shieldGuard.left = 0;
      if (t.act) endAct(world, t, true);
      world.events.push({ type: 'revive', id: t.id, pid: t.pid, hp: t.hp, x: t.x, y: t.y });
      return;
    }
    if (t.hp <= 0) {
      t.hp = 0;
      t.dead = true;
      delete t.shieldUntil; delete t.shieldCharges; delete t.invisibleUntil; delete t.berserk; delete t.curse;
      t.pendingCounter = null;
      t.terminal = 'death';
      if (t.act) endAct(world, t, true);
      t.deathCause = { ability: hit.abilityId, by: hit.srcType, tick: world.tick, ...hit.cause };
      world.events.push({ type: 'death', id: t.id, pid: t.pid, cause: t.deathCause });
    }
    return;
  }

  if (mdef && !mdef.invulnerable && t.hp > 0 && !hit.periodic && !hit.execute && hostile) {
    const wasFrozen = t.frozenUntil > world.tick;
    if (wasFrozen && dmg >= Math.max(30, t.maxHp * .1)) {
      delete t.frozenUntil;
      world.events.push({ type: 'freezeBreak', id: t.id, x: t.x, y: t.y });
    }
    if (!wasFrozen && hit.abilityId === 'frost_lance' && rand(world) < (isBoss(t) ? .1 : .3)) {
      t.frozenUntil = world.tick + ticks(isBoss(t) ? 500 : 1500);
      if (t.act) endAct(world, t, true);
      t.moving = false; t.kx = 0; t.ky = 0;
      world.events.push({ type: 'freeze', id: t.id, x: t.x, y: t.y });
    }
    if (attacker?.kind === 'player' && def.family === 'focus' && def.element === 'fire') {
      const burnHit = { ...hit, periodic: true, def: { damage: 4, knockback: 0 } };
      t.burn = { expiresTick: world.tick + ticks(3000), nextTick: t.burn?.nextTick ?? world.tick + ticks(500), hit: burnHit };
      world.events.push({ type: 'burn', id: t.id, x: t.x, y: t.y });
    }
  }
  if (def.slow && mdef && !mdef.invulnerable && t.hp > 0) {
    t.slow = { expiresTick: world.tick + ticks(def.slow.durationMs), speedMult: def.slow.speedMult };
    world.events.push({ type: 'slow', id: t.id, ability: hit.abilityId });
  }
  if (def.sunder && t.hp > 0) {
    t.sunder = { expiresTick: world.tick + ticks(def.sunder.durationMs) };
    world.events.push({ type: 'sunder', id: t.id, ability: hit.abilityId });
  }

  // Heavy-poise bosses/elites (cocy 10-13): plain basic attacks never wear poise; skills, crits and counters do.
  const plainBasic = mdef.heavyPoise && BASIC_ABILITIES.has(hit.abilityId) && !crit && !hit.counter;
  if (mdef.poise > 0 && t.staggerLeft === 0 && !plainBasic) {
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
    delete t.invisibleUntil; delete t.curse; delete t.berserk; delete t.burn; delete t.frozenUntil; delete t.rootUntil; t.poison=null;
    if (t.act) endAct(world, t, true);
    world.events.push({ type: 'kill', id: t.id, monster: t.type, elite: t.eliteVariant, threat: t.threat, stageId: t.stageId, by: hit.srcId, xp: mdef.xp, x: t.x, y: t.y });
  }
  return dmg;
}

// One host-owned burn slot: recasts refresh duration, never add a second ticking stack.
function stepBurn(world, target) {
  const burn = target.burn;
  if (!alive(target) || MONSTERS[target.type]?.invulnerable) { delete target.burn; return; }
  if (world.tick >= burn.nextTick && burn.nextTick <= burn.expiresTick) {
    burn.nextTick += ticks(500);
    applyHit(world, target, burn.hit);
  }
  if (target.burn && world.tick >= burn.expiresTick) delete target.burn;
}

// Host-owned finite hazards. No collision bodies; no client prediction side effects.
function stepZones(world) {
  if (!world.zones?.length) return;
  const keep = [];
  for (const zone of world.zones) {
    const owner = world.entities.find(e => e.id === zone.ownerId);
    if (!owner || !alive(owner) || owner.team !== zone.team || world.round && world.round.state !== 'running') continue;
    if (zone.abilityId==='ember_bolt' && owner.channel>0) continue;
    const def = zone.abilityId==='ember_bolt' ? emberDef(ABILITIES.ember_bolt) : ABILITIES[zone.abilityId];
    if (world.tick >= zone.nextTick && world.tick >= zone.activeTick && (zone.abilityId === 'meteor' || zone.abilityId === 'ember_bolt' || world.tick < zone.endTick)) {
      const pulse = !!def.zone.intervalMs;
      zone.nextTick += zone.intervalTicks ?? ticks(def.zone.intervalMs || 10000);
      if (zone.pulsesLeft !== undefined) zone.pulsesLeft--;
      world.events.push({ type: pulse ? 'zonePulse' : 'explode', id: zone.id, ability: zone.abilityId, ...(zone.abilityId==='ember_bolt' ? {presentationOwner:owner.id,castId:zone.id,ember20:true} : {}),
        x: zone.x, y: zone.y, radius: zone.radius || def.zone.radius || 0 });
      for (const target of world.entities) {
        if (target.team === zone.team || !isTargetable(target) || !zoneContains(zone, zone.radius ? {...def.zone,radius:zone.radius} : def.zone, target)) continue;
        applyHit(world, target, { srcId: owner.id, srcKind: owner.kind, srcType: owner.weapon,
          abilityId: zone.abilityId, def:zone.abilityId==='ember_bolt'?{...def,damage:emberDamage(zone,target)}:def, mult: zone.dmgMult, poiseMult: 1, castId: zone.id,
          ...(def.zone.physical ? { weaponZone: true } : {}),
          ...(pulse ? { periodic: true, zonePulse: true, castId: zone.id } : {}), fromX: zone.x, fromY: zone.y,
          cause: { shape: { type: 'circle', radius: def.zone.radius || def.zone.width, offset: 0 }, ox: zone.x, oy: zone.y, facing: zone.facing } });
      }
    }
    if (world.tick < zone.endTick && (zone.abilityId !== 'meteor' || (zone.pulsesLeft || 0) > 0 || world.tick < zone.activeTick)) keep.push(zone);
  }
  world.zones = keep;
}

// ---------------------------------------------------------------- projectiles

// Clip the sweep at range/arena expiry: final-tick hits cannot tunnel or overshoot range.
function projectileSweep(world, pr) {
  const ax = pr.x, ay = pr.y, dx = pr.vx * DT, dy = pr.vy * DT;
  const distance = Math.hypot(dx, dy);
  let limit = distance ? Math.min(1, Math.max(0, pr.range - pr.travelled) / distance) : 1;
  if (dx > 0) limit = Math.min(limit, (world.arena.w - ax) / dx);
  else if (dx < 0) limit = Math.min(limit, -ax / dx);
  if (dy > 0) limit = Math.min(limit, (world.arena.h - ay) / dy);
  else if (dy < 0) limit = Math.min(limit, -ay / dy);
  limit = Math.max(0, limit);
  return { ax, ay, dx, dy, distance, limit, bx: ax + dx * limit, by: ay + dy * limit };
}

// Earliest tick fraction at which two moving circles touch (relative motion), null on a miss.
function movingCircleContact(a, b, radius) {
  const px = b.ax - a.ax, py = b.ay - a.ay, vx = b.dx - a.dx, vy = b.dy - a.dy;
  const c = px * px + py * py - radius * radius;
  if (c <= 0) return 0;
  const A = vx * vx + vy * vy, B = px * vx + py * vy;
  if (A === 0 || B >= 0) return null;
  const disc = B * B - A * c;
  return disc < 0 ? null : (-B - Math.sqrt(disc)) / A;
}

// Opposing player shots (human vs skeleton) cancel each other. Monster shots never clash,
// so PvE stays unchanged. A shot that reaches any body first takes that hit instead.
function projectileClashes(world, live, sweeps) {
  const first = live.map((pr, i) => {
    const s = sweeps[i];
    let t = s.limit;
    for (const target of world.entities) {
      if (target.id === pr.ownerId || !isTargetable(target) || pr.hit.includes(target.id)) continue;
      const entry = segmentCircleEntry(s.ax, s.ay, s.bx, s.by, target.x, target.y, target.r + pr.r);
      if (entry !== null) t = Math.min(t, entry * s.limit);
    }
    return t;
  });
  const pairs = [];
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    if (a.ownerKind !== 'player' || b.ownerKind !== 'player' || a.team === b.team) continue;
    const t = movingCircleContact(sweeps[i], sweeps[j], a.r + b.r);
    if (t !== null && t <= first[i] && t <= first[j]) pairs.push({ i, j, t });
  }
  pairs.sort((p, q) => p.t - q.t || live[p.i].id - live[q.i].id || live[p.j].id - live[q.j].id);
  const clashed = new Map();
  for (const p of pairs) if (!clashed.has(p.i) && !clashed.has(p.j)) { clashed.set(p.i, p); clashed.set(p.j, p); }
  return clashed;
}

function stepProjectiles(world) {
  const keep = [];
  const live = world.projectiles.filter(pr => !((pr.def || ABILITIES[pr.abilityId]).spin && !world.entities.some(e => e.id === pr.ownerId && alive(e))));
  const sweeps = live.map(pr => projectileSweep(world, pr));
  const clashed = projectileClashes(world, live, sweeps);
  for (const [i, pr] of live.entries()) {
    const def = pr.def || ABILITIES[pr.abilityId];
    const { ax, ay, dx, dy, distance, limit, bx, by } = sweeps[i];
    const clash = clashed.get(i);
    if (clash) {
      pr.x = ax + dx * clash.t; pr.y = ay + dy * clash.t;
      if (clash.i === i) {
        const o = sweeps[clash.j];
        world.events.push({ type: 'projectileClash', a: pr.id, b: live[clash.j].id,
          x: (pr.x + o.ax + o.dx * clash.t) / 2, y: (pr.y + o.ay + o.dy * clash.t) / 2 });
      }
      world.events.push({ type: 'projectileEnd', id: pr.id, x: pr.x, y: pr.y, ability: pr.abilityId });
      continue;
    }
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
          srcId: pr.ownerId, srcKind: pr.ownerKind, srcType: pr.ownerType, abilityId: pr.abilityId, def, ...(pr.step ? { step: pr.step } : {}),
          mult: pr.dmgMult * (friendly ? FRIENDLY_PROJECTILE_DAMAGE : 1), poiseMult: pr.poiseMult, counter: !!pr.counter,
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
  world.events.push({ type: 'explode', x: pr.x, y: pr.y, radius, ability: pr.abilityId, ...(pr.blast20 ? {blast20:true,ownerId:pr.ownerId,facing:Math.atan2(pr.vy,pr.vx)} : {}), ...(pr.step ? { step: pr.step } : {}) });
  for (const t of world.entities) {
    if (t.team === pr.team || !isTargetable(t) || pr.hit.includes(t.id)) continue;
    const component=pr.blast20 ? blastComponent(pr.x,pr.y,Math.atan2(pr.vy,pr.vx),t) : null;
    if (pr.blast20 ? !component : dist2(pr.x, pr.y, t.x, t.y) > (radius + t.r) ** 2) continue;
    pr.hit.push(t.id);
    applyHit(world, t, {
      srcId: pr.ownerId, srcKind: pr.ownerKind, srcType: pr.ownerType, abilityId: pr.abilityId,
      counter: !!pr.counter, ...(pr.step ? { step: pr.step } : {}), def: { ...def, damage: def.damage * 0.6 }, mult: pr.dmgMult, poiseMult: pr.poiseMult, fromX: pr.x, fromY: pr.y,
      cause: { shape: component || { type: 'circle', radius, offset: 0 }, ox: pr.x, oy: pr.y, facing: component && component!==BLAST_CIRCLE ? Math.atan2(pr.vy,pr.vx) : 0 },
    });
  }
}

// ---------------------------------------------------------------- physics helpers

function decayKnock(e) {
  trackGuestKnock(e);
  Object.assign(e, knockPosition(e));
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
      separateBodyPair(a, b, world.arena, world.tick);
    }
  }
}

function clampToArena(world, e) {
  Object.assign(e, arenaPosition(e, world.arena));
}

// ---------------------------------------------------------------- round

function stepRound(world, inputs) {
  const rd = world.round;
  if (!rd || rd.state !== 'running') return;
  rd.t++;
  if (rd.goal === 'sanctuary') return;
  // Combat/death already ran: a same-tick death cannot be resurrected by success.
  const objectiveCleared = rd.objective ? stepObjective(world, inputs) : false;
  if (objectiveCleared) rd.pending = [];
  const monsters = world.entities.filter((e) => e.kind === 'monster' && !e.dead && !e.terminal && e.team !== TEAM_PLAYER);
  let aliveCount = monsters.length;
  const timerCleared = rd.goal === 'timer' && rd.t >= rd.timerTicks;
  // Empty combat advances only the next scheduled timestamp group, never the round clock.
  // Spawn-in grace counts alive; overflow stays due under the normal concurrency gate.
  if (!aliveCount && !objectiveCleared && !timerCleared && rd.pending.length) {
    const next = Math.min(...rd.pending.map(s => s.atTicks));
    if (next > rd.t) rd.pending = rd.pending.map(s => s.atTicks === next ? { ...s, atTicks: rd.t } : s);
  }
  rd.pending = rd.pending.filter((s) => {
    if (timerCleared || s.atTicks > rd.t || aliveCount >= rd.maxConcurrent) return true;
    const stage = STAGES[rd.stageId];
    const threat = threatMultipliers(rd.threat);
    // Random damage variant, not the old archetype classification. No new attack or AI loop.
    const elite = !MONSTERS[s.monster].invulnerable && s.monster !== 'goblin_chief'
      && stage.eliteChance > 0 && rand(world) < stage.eliteChance;
    const spawned = spawnMonster(world, s.monster, s.fx * world.arena.w, s.fy * world.arena.h, {
      hpMult: (world.partyHpMult ?? 1) * BALANCE.monsterHp * (stage.hpMult || 1) * threat.hp * (elite ? BALANCE.elite.hp : 1) * (s.monster === 'goblin_chief' ? (stage.bossHpMult || 1) : 1),
      dmgMult: (stage.dmgMult || 1) * threat.damage * (elite ? BALANCE.elite.damage : 1),
      elite, threat: rd.threat, stageId: rd.stageId,
      ...(rd.playerSide === 'right' ? { facing: 0 } : {}),
    });
    if (rd.objective?.kind === 'kill-target' && s.slot === rd.objective.targetSlot && rd.objective.targetId === null) rd.objective.targetId = spawned.id;
    aliveCount++;
    return false;
  });
  const players = world.entities.filter((e) => e.kind === 'player');
  const invaders = players.filter(p => p.invasionRole === 'invader');
  const hunters = players.filter(p => p.invasionRole !== 'invader');
  const cleared = !invaders.some(alive) && (rd.goal === 'objective' ? objectiveCleared
    : rd.goal === 'timer' ? rd.t >= rd.timerTicks : !rd.pending.length && aliveCount === 0);
  if (cleared) {
    for (const p of hunters) if (!p.terminal && (!rd.objective || alive(p) && p.hp > 0)) { p.terminal = 'clear'; p.pendingCounter = null; }
  }
  // Last defender gone: leave ten seconds for the survivor to collect death loot, then extract without a consumable.
  if (rd.invasion && hunters.every(p => p.terminal) && invaders.some(alive)) {
    rd.invasionExitAt ??= rd.t + ticks(10000);
    if (rd.t >= rd.invasionExitAt) for (const p of invaders) if (!p.terminal) p.terminal = 'return_scroll';
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
    if (m.act?.def.groundTarget && m.act.phase === 'windup') {const a=m.act;out.push({id:m.id,ability:a.id,phase:a.phase,progress:a.elapsed/a.total,facing:0,major:false,shape:{...a.def.shape,radius:a.growth.radius},ox:a.zonePoint.x,oy:a.zonePoint.y});}
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

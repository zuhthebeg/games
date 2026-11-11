import { BUTTONS, isAttackChainWindow, pickAimTarget, COMBO_TIMELINES } from '../sim/world.js';

export function autoAttackDefault({ pointerType = '', coarsePointer = false } = {}) {
  return pointerType === 'touch' || pointerType === 'coarse' || coarsePointer;
}

export function attackReach(player) {
  if (player.family === 'crossbow') return 9;
  if (player.family === 'staff') return 7;
  return COMBO_TIMELINES[0].range + 0.3;
}

function angleByte(dx, dz) {
  return Math.round((Math.atan2(dz, dx) / (Math.PI * 2) * 256 + 256) % 256);
}

function canAutoAttack(world, player) {
  return world?.mode === 'stage' &&
    player &&
    !player.dead &&
    !player.downed &&
    player.dodgeTicks <= 0 &&
    !player.skillCast;
}

export class AttackInputAssistant {
  constructor() {
    this.lastSentAttack = false;
    this.triggerKey = null;
    this.pendingPress = false;
    this.lastForcedRelease = false;
  }

  reset() {
    this.lastSentAttack = false;
    this.triggerKey = null;
    this.pendingPress = false;
  }

  build(rawInput, world, player, { autoAttack = false } = {}) {
    const input = { ...rawInput };
    delete input.attackHeld;
    this.lastForcedRelease = false;
    let buttons = Number(rawInput.buttons) || 0;
    const autoEligible = autoAttack && canAutoAttack(world, player);
    const target = autoEligible ? pickAimTarget(world, player, attackReach(player)) : null;
    if (target) buttons |= BUTTONS.ATTACK;

    const canHold = canAutoAttack(world, player);
    const held = canHold && (Boolean(rawInput.attackHeld) || Boolean(target));
    if (!held) {
      this.triggerKey = null;
      this.pendingPress = false;
      this.lastSentAttack = Boolean(buttons & BUTTONS.ATTACK);
      return { ...input, buttons };
    }

    const triggerKey = !player.attack
      ? 'idle'
      : isAttackChainWindow(player)
        ? `chain:${player.attack.castId ?? player.attack.step}:${player.attack.step}`
        : null;
    if (triggerKey === null) this.triggerKey = null;
    let forceRelease = false;
    if (triggerKey !== null && triggerKey !== this.triggerKey) {
      this.triggerKey = triggerKey;
      if (this.lastSentAttack) {
        forceRelease = true;
        this.pendingPress = true;
      }
    } else if (this.pendingPress) this.pendingPress = false;

    this.lastForcedRelease = forceRelease;
    if (forceRelease) buttons &= ~BUTTONS.ATTACK;
    else buttons |= BUTTONS.ATTACK;
    this.lastSentAttack = Boolean(buttons & BUTTONS.ATTACK);

    if (target) {
      const dx = target.x - player.x;
      const dz = target.z - player.z;
      const range = attackReach(player);
      return {
        ...input,
        buttons,
        aim: angleByte(dx, dz),
        ad: Math.min(range, Math.max(0, Math.round(Math.hypot(dx, dz) * 10) / 10)),
        autoAim: true,
      };
    }
    return { ...input, buttons };
  }
}

export function buildPartyAssistedInput(assistant, rawInput, partyClient, player, options = {}) {
  const { inputView, ...assistOptions } = options;
  return assistant.build(
    rawInput,
    partyClient.viewAimWorld?.(inputView) ?? partyClient.viewWorld() ?? partyClient.stageWorld,
    player,
    assistOptions,
  );
}

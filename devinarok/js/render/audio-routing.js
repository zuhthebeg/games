const SKILL_SOUNDS = Object.freeze({
  spin: 'slash-whoosh',
  dash: 'slash-whoosh',
  guard: 'shield-clang',
  quake: 'heavy-slam',
  deadBurst: 'heavy-slam',
  pierce: 'arrow-flight',
  vault: 'crossbow-shot',
  volley: 'arrow-flight',
  poisonArrow: 'crossbow-shot',
  rain: 'arrow-flight',
  flame: 'flame',
  frost: 'frost',
  cursedHands: 'summon',
  blink: 'blink',
  meteor: 'staff-cast',
});

const FAMILY_SKILL_SOUNDS = Object.freeze({
  sword: Object.freeze({ 1: 'slash-whoosh', 2: 'slash-whoosh', 3: 'shield-clang', 4: 'heavy-slam' }),
  crossbow: Object.freeze({ 1: 'arrow-flight', 2: 'crossbow-shot', 3: 'arrow-flight', 4: 'arrow-flight' }),
  staff: Object.freeze({ 1: 'flame', 2: 'frost', 3: 'blink', 4: 'staff-cast' }),
});

const BOSS_ENEMY_KINDS = new Set(['commander', 'ashwarden', 'skeletonking']);

export function castSoundFor(event = {}) {
  if (event.skillId === 'counter') {
    if (event.family === 'crossbow') return 'crossbow-shot';
    if (event.family === 'staff') return 'staff-cast';
    return 'sword-swing';
  }
  if (event.skillKey && Object.hasOwn(SKILL_SOUNDS, event.skillKey)) return SKILL_SOUNDS[event.skillKey];
  if (event.skill !== undefined) return FAMILY_SKILL_SOUNDS[event.family]?.[event.skill] ?? 'staff-cast';
  if (event.family === 'staff') return 'staff-cast';
  if (event.family === 'sword') return event.step ? 'slash-whoosh' : 'sword-swing';
  return null;
}

export function hitSoundLayers(event = {}, source = null) {
  const skillKey = event.skillKey;
  const isSwordMeleeSkill = source?.family === 'sword'
    && (skillKey === 'spin' || skillKey === 'dash' || event.skill === 1 || event.skill === 2);
  return [
    { name: isSwordMeleeSkill ? 'heavy-hit' : 'impact', gain: 1 },
    ...(event.critical ? [{ name: 'crit-hit', gain: 0.7 }] : []),
  ];
}

export function deathSoundLayers(event = {}, world = {}) {
  const dead = world.entities?.find((entity) => entity.id === event.entityId);
  const layers = ['enemy-death'];
  if (dead?.kind === 'enemy') {
    layers.push(dead.boss || BOSS_ENEMY_KINDS.has(dead.enemyKind) ? 'boss-death' : 'bone-snap');
  }
  return layers;
}

export function impactSoundFor(event = {}) {
  if (event.kind === 'meteor') return 'meteor-impact';
  if (event.kind === 'flame') return 'flame';
  if (event.kind === 'frost') return 'frost';
  if (event.kind === 'quake' || event.kind === 'deadBurst') return 'heavy-slam';
  return 'impact';
}

export function canPlayBoneSnap(now, previousAt = -Infinity, minIntervalMs = 70) {
  return now - previousAt >= minIntervalMs;
}

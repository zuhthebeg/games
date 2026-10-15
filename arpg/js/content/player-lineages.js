// Identity/weapon metadata only. No character creation, unlock or combat effects.
export const PLAYER_LINEAGES = Object.freeze({
  human: Object.freeze({ id: 'human', family: null, baseForm: 'human', evolvedForm: 'human',
    weaponForms: Object.freeze(['sword', 'blunt', 'bow', 'wand', 'staff']) }),
  skeleton_mage: Object.freeze({ id: 'skeleton_mage', family: 'focus', baseForm: 'skeleton_mage', evolvedForm: 'lich',
    weaponForms: Object.freeze(['wand', 'staff']) }),
  skeleton_knight: Object.freeze({ id: 'skeleton_knight', family: 'blade', baseForm: 'skeleton_knight', evolvedForm: 'death_knight',
    weaponForms: Object.freeze(['sword', 'blunt']) }),
  skeleton_archer: Object.freeze({ id: 'skeleton_archer', family: 'bow', baseForm: 'skeleton_archer', evolvedForm: 'death_archer',
    weaponForms: Object.freeze(['bow']) }),
});

// An absent field (not an explicitly invalid value) preserves every old human save.
export function playerLineage(saveOrId = 'human') {
  const id = saveOrId !== null && typeof saveOrId === 'object' && !Array.isArray(saveOrId)
    ? (Object.hasOwn(saveOrId, 'lineage') ? saveOrId.lineage : 'human') : saveOrId;
  if (typeof id !== 'string' || !Object.hasOwn(PLAYER_LINEAGES, id)) throw new Error('알 수 없는 계보입니다.');
  return PLAYER_LINEAGES[id];
}

export function playerForm(saveOrId, level = saveOrId?.level) {
  const lineage = playerLineage(saveOrId);
  if (!Number.isInteger(level) || level < 1 || level > 30) throw new Error('캐릭터 레벨은 1~30이어야 합니다.');
  return level === 30 ? lineage.evolvedForm : lineage.baseForm;
}

export const normalizedWeaponForm = def => def?.form
  ?? (def?.family === 'blade' ? 'sword' : def?.family === 'bow' ? 'bow' : undefined);

export function lineageAllowsWeapon(saveOrId, def) {
  const lineage = playerLineage(saveOrId);
  return def?.kind !== 'weapon' || lineage.id === 'human'
    || (def.family === lineage.family && lineage.weaponForms.includes(normalizedWeaponForm(def)));
}

// Approved single-skeleton equipment progression. Internal knight slot stays compatible.
export const KNIGHT_ARMOR_LEVELS = Object.freeze({ hands: 8, feet: 15, body: 22, head: 30 });
export function knightEquipmentAllowed(save, def) {
  return save.lineage !== 'skeleton_knight' || !Object.hasOwn(KNIGHT_ARMOR_LEVELS, def?.kind)
    || save.level >= KNIGHT_ARMOR_LEVELS[def.kind];
}

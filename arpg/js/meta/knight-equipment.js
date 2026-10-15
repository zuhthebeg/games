// One gate for the pending armor design. No invented levels, bonus or evolution.
// Until the unlock schedule is approved, knight armor stays in inventory only.
export function knightEquipmentAllowed(save, def) {
  return save.lineage !== 'skeleton_knight' || !['head', 'body', 'hands', 'feet'].includes(def?.kind);
}

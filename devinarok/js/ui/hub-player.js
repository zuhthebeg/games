import { equipmentLook } from '../content/items.js';
import { playerFamily } from '../content/lineages.js';

export function applyHubEquipmentLook(player, equipment, character = null) {
  const look = equipmentLook(equipment);
  Object.assign(player, {
    equipment,
    family: playerFamily(character, look),
    characterKind: look.characterKind,
    look,
  });
  return look;
}

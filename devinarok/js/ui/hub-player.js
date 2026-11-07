import { equipmentLook } from '../content/items.js';

export function applyHubEquipmentLook(player, equipment) {
  const look = equipmentLook(equipment);
  Object.assign(player, {
    equipment,
    family: look.family,
    characterKind: look.characterKind,
    look,
  });
  return look;
}

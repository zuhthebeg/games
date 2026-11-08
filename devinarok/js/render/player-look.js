export function playerModelKey(entity) {
  return entity.characterKind || 'knight';
}

export function playerLookKey(look = {}) {
  return [
    look.family ?? 'sword',
    look.weapon ?? '1H_Sword',
    look.offhand ?? '',
    Boolean(look.helmet),
    Boolean(look.cape),
    look.weaponRarity ?? '',
  ].join(':');
}

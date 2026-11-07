export function playerModelKey(entity) {
  return entity.characterKind || 'knight';
}

export function playerLookKey(look = {}) {
  return [
    look.weapon ?? '1H_Sword',
    Boolean(look.helmet),
    Boolean(look.cape),
    look.weaponRarity ?? '',
  ].join(':');
}

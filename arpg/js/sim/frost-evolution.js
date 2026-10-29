// Frozen departure admission, never mutable display mastery.
export const frost20 = levels => Number.isInteger(levels?.frost_lance) && levels.frost_lance>=20 && levels.frost_lance<=30;
export function frostDef(base) {return {...base,projectile:{...base.projectile,pierce:3}};}

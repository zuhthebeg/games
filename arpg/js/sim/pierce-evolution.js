// Departure capability is separate from mutable display mastery.
export const pierce20 = levels => Number.isInteger(levels?.pierce_shot) && levels.pierce_shot>=20 && levels.pierce_shot<=30;
export function pierceDef(base) {return {...base,projectile:{...base.projectile,pierce:5}};}

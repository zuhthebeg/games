// Departure-only authority; display mastery never changes an accepted cast.
export const volley20 = levels => Number.isInteger(levels?.volley) && levels.volley>=20 && levels.volley<=30;
export const VOLLEY_WAVES = Object.freeze([Object.freeze([-22,0,22]),Object.freeze([-11,11])]);
export const volleyWave = index => index===0 ? 1 : index===3 ? 2 : 0;
export const volleyShots = act => {const e=act.elapsed-act.total;return Number(e>0)+Number(e>3);};

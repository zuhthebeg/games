import {ABILITIES} from '../content/combat.js';
export const flame20=levels=>Number.isInteger(levels?.flame_ring)&&levels.flame_ring>=20&&levels.flame_ring<=30;
export const flameShape=index=>({...ABILITIES.flame_ring.shape,radius:ABILITIES.flame_ring.shape.radius*(index+1)/4});
// Only completed authoritative contacts may be presented.
export const flameFront=act=>Math.min(3,act.elapsed-act.total-1);

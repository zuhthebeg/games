import {ABILITIES} from '../content/combat.js';
export const cleave20=levels=>Number.isInteger(levels?.heavy_cleave)&&levels.heavy_cleave>=20&&levels.heavy_cleave<=30;
export const cleaveShape=index=>({...ABILITIES.heavy_cleave.shape,range:168.75*(index+1)/4});
// Presentation describes completed host ticks, not the next simulation contact.
export const cleaveFront=act=>Math.min(3,act.elapsed-act.total-1);

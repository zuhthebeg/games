import {shapeHitsCircle} from './core.js';
export const blast20=levels=>Number.isInteger(levels?.blast_arrow)&&levels.blast_arrow>=20&&levels.blast_arrow<=30;
export const BLAST_CIRCLE=Object.freeze({type:'circle',radius:108,offset:0});
export const BLAST_CONE=Object.freeze({type:'cone',range:162,arc:60,offset:0});
export function blastComponent(x,y,facing,target){return shapeHitsCircle(BLAST_CIRCLE,x,y,0,target.x,target.y,target.r)?BLAST_CIRCLE:shapeHitsCircle(BLAST_CONE,x,y,facing,target.x,target.y,target.r)?BLAST_CONE:null;}

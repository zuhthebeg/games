import {ticks} from '../sim/core.js';
export const FLAME_KEYS=['id','flame20','rate','castTick','phase','elapsed','total','facing','ox','oy','left','phaseTicks','dashStep','fired'];
export function validFlameAct(a,arena,tick){
 const phases=['windup','lock','active','recovery'];
 if(!a||Object.keys(a).length!==14||FLAME_KEYS.some(k=>!Object.hasOwn(a,k))||a.id!=='flame_ring'||a.flame20!==true||![a.rate,a.ox,a.oy,a.facing].every(Number.isFinite)||a.rate<=0||a.rate>100||a.ox<0||a.oy<0||a.ox>arena?.w||a.oy>arena?.h||!Number.isFinite(arena?.w)||!Number.isFinite(arena?.h))return false;
 const p={windup:Math.max(1,ticks(360/a.rate)),lock:0,active:4,recovery:Math.max(1,ticks(280/a.rate))};
 return a.phase!=='lock'&&phases.includes(a.phase)&&a.phaseTicks&&Object.keys(a.phaseTicks).length===4&&phases.every(k=>Object.hasOwn(a.phaseTicks,k)&&a.phaseTicks[k]===p[k])&&Number.isSafeInteger(a.left)&&a.left>=1&&a.left<=p[a.phase]&&Number.isSafeInteger(a.elapsed)&&a.elapsed>=0&&a.elapsed===phases.slice(0,phases.indexOf(a.phase)).reduce((n,k)=>n+p[k],0)+p[a.phase]-a.left&&Number.isSafeInteger(a.castTick)&&a.castTick>=0&&a.castTick+a.elapsed===tick&&a.total===p.windup&&a.dashStep===0&&a.fired===false;
}

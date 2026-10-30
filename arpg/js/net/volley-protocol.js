import {ABILITIES} from '../content/combat.js';
import {STAGES} from '../content/combat.js';
import {ticks} from '../sim/core.js';
import {volleyShots} from '../sim/volley-evolution.js';
const phases=['windup','lock','active','recovery'];
const actKeys=new Set(['id','volley20','rate','castTick','phase','elapsed','total','facing','ox','oy','left','phaseTicks','dashStep','shotsFired','fired']);
const shotKeys=new Set(['id','ownerId','abilityId','x','y','r','vx','vy','volley20']);
const eventKeys=new Set(['type','id','ability','volley20','castTick','wave','ox','oy','facing','projectileIds']);
const positive=n=>Number.isSafeInteger(n)&&n>0;
const only=(o,keys)=>Object.keys(o).every(k=>keys.has(k));
export function validVolleyAct(a,arena,tick) {
  if(!a || !only(a,actKeys) || a.volley20!==true || a.id!=='volley' || !phases.includes(a.phase) || ![a.rate,a.ox,a.oy,a.facing].every(Number.isFinite) || a.rate<=0 || a.rate>100 || a.ox<0 || a.oy<0 || a.ox>arena?.w || a.oy>arena?.h) return false;
  if(!a.phaseTicks || Object.keys(a.phaseTicks).length!==4 || phases.some(k=>a.phaseTicks[k]!== (k==='active'?4:k==='lock'?0:Math.max(1,ticks(ABILITIES.volley[k+'Ms']/a.rate))))) return false;
  if(!Number.isSafeInteger(a.castTick) || a.castTick<0 || !Number.isSafeInteger(a.elapsed) || a.castTick+a.elapsed!==tick || !Number.isSafeInteger(a.left) || a.left<1 || a.left>a.phaseTicks[a.phase] || a.elapsed!==phases.slice(0,phases.indexOf(a.phase)).reduce((n,k)=>n+a.phaseTicks[k],0)+a.phaseTicks[a.phase]-a.left || a.total!==a.phaseTicks.windup || a.dashStep!==0) return false;
  return Number.isInteger(a.shotsFired) && a.shotsFired===volleyShots(a) && a.fired===(a.shotsFired>0);
}
export function validVolleyShot(p,packet,admitted) {
  if(!only(p,shotKeys) || p.volley20!==true || p.abilityId!=='volley' || admitted!==true || !positive(p.id) || !positive(p.ownerId) || ![p.x,p.y,p.vx,p.vy,p.r].every(Number.isFinite) || p.r!==7 || Math.abs(Math.hypot(p.vx,p.vy)-700)>1e-8 || p.x<0 || p.y<0 || p.x>packet.arena?.w || p.y>packet.arena?.h) return false;
  return !packet.entities.some(e=>e.id===p.id) && packet.projectiles.filter(q=>q.id===p.id).length===1 && !(packet.zones||[]).some(z=>z.id===p.id);
}
// Stage history may accompany a newly-sized arena. Do not validate old origins
// against only the latest arena. All authored stages bound the journal envelope.
const maxW=Math.max(1280,...Object.values(STAGES).map(s=>s.arena?.w||0));
const maxH=Math.max(720,...Object.values(STAGES).map(s=>s.arena?.h||0));
export function validVolleyEvent(e,tick,capability) {
  if(e?.volley20===undefined && e?.projectileIds===undefined) return !(e?.type==='projectile' && e.ability==='volley' && capability(e.id)===true);
  if(!only(e,eventKeys) || e.type!=='projectile' || e.ability!=='volley' || e.volley20!==true || !positive(e.id) || capability(e.id)!==true || ![e.ox,e.oy,e.facing].every(Number.isFinite) || e.ox<0 || e.oy<0 || e.ox>maxW || e.oy>maxH || !Number.isSafeInteger(e.castTick) || e.castTick<0 || !Number.isSafeInteger(tick) || e.castTick>tick || ![1,2].includes(e.wave) || !Array.isArray(e.projectileIds) || e.projectileIds.length!==(e.wave===1?3:2)) return false;
  return e.projectileIds.every((id,i,ids)=>positive(id) && id!==e.id && (!i || id===ids[i-1]+1));
}

import {ticks} from '../sim/core.js';
import {STAGES} from '../content/combat.js';
const maxW=Math.max(1280,...Object.values(STAGES).map(s=>s.arena?.w||0)),maxH=Math.max(720,...Object.values(STAGES).map(s=>s.arena?.h||0));
const exact=(v,keys)=>v&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function validBlastAct(a,arena,tick){
 const phases=['windup','lock','active','recovery'],keys=['id','blast20','rate','castTick','phase','elapsed','total','facing','ox','oy','left','phaseTicks','dashStep','fired'];
 if(!exact(a,keys)||a.id!=='blast_arrow'||a.blast20!==true||![a.rate,a.ox,a.oy,a.facing,arena?.w,arena?.h].every(Number.isFinite)||a.rate<=0||a.rate>100||a.ox<0||a.oy<0||a.ox>arena.w||a.oy>arena.h)return false;
 const p={windup:Math.max(1,ticks(320/a.rate)),lock:0,active:Math.max(1,ticks(34/a.rate)),recovery:Math.max(1,ticks(260/a.rate))};
 return a.phase!=='lock'&&phases.includes(a.phase)&&exact(a.phaseTicks,phases)&&phases.every(k=>a.phaseTicks[k]===p[k])&&Number.isSafeInteger(a.left)&&a.left>=1&&a.left<=p[a.phase]&&Number.isSafeInteger(a.elapsed)&&a.elapsed>=0&&a.elapsed===phases.slice(0,phases.indexOf(a.phase)).reduce((n,k)=>n+p[k],0)+p[a.phase]-a.left&&Number.isSafeInteger(a.castTick)&&a.castTick>=0&&a.castTick+a.elapsed===tick&&a.total===p.windup&&a.dashStep===0&&a.fired===(a.elapsed>p.windup);
}
export function validBlastShot(p,packet,owner){return exact(p,['id','ownerId','abilityId','blast20','x','y','r','vx','vy'])&&p.blast20===true&&p.abilityId==='blast_arrow'&&owner?.kind==='player'&&owner.blast20===true&&!owner.terminal&&Number.isSafeInteger(p.id)&&p.id>0&&Number.isSafeInteger(p.ownerId)&&p.ownerId>0&&[p.x,p.y,p.vx,p.vy,p.r,packet.arena?.w,packet.arena?.h].every(Number.isFinite)&&p.r===9&&Math.abs(Math.hypot(p.vx,p.vy)-640)<1e-8&&p.x>=0&&p.y>=0&&p.x<=packet.arena.w&&p.y<=packet.arena.h;}
export function validBlastEvent(e,capability){
 if(e?.type!=='explode'||e.ability!=='blast_arrow')return e?.blast20===undefined;
 if(!capability)return e.blast20===undefined;
 if(!Number.isSafeInteger(e.presentationOwner)||capability(e.presentationOwner)===undefined)return false;
 if(!capability(e.presentationOwner))return e.blast20===undefined&&e.ownerId===undefined&&e.facing===undefined;
 return exact(e,['type','x','y','radius','ability','blast20','ownerId','facing','presentationOwner'])&&e.blast20===true&&e.ownerId===e.presentationOwner&&[e.x,e.y,e.facing].every(Number.isFinite)&&e.x>=0&&e.y>=0&&e.x<=maxW&&e.y<=maxH&&e.radius===108;
}

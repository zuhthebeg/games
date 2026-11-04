import {ticks} from '../sim/core.js';
import {STAGES} from '../content/combat.js';
const maxW=Math.max(1280,...Object.values(STAGES).map(s=>s.arena?.w||0)),maxH=Math.max(720,...Object.values(STAGES).map(s=>s.arena?.h||0));
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function validHealAct(a,arena,tick){
 const phases=['windup','lock','active','recovery'],keys=['id','heal20','rate','castTick','phase','elapsed','total','facing','ox','oy','left','phaseTicks','dashStep','fired'];
 if(!exact(a,keys)||a.id!=='healing_light'||a.heal20!==true||![a.rate,a.ox,a.oy,a.facing,arena?.w,arena?.h].every(Number.isFinite)||a.rate<=0||a.rate>100||a.ox<0||a.oy<0||a.ox>arena.w||a.oy>arena.h)return false;
 const p={windup:Math.max(1,ticks(500/a.rate)),lock:Math.max(1,ticks(100/a.rate)),active:Math.max(1,ticks(100/a.rate)),recovery:Math.max(1,ticks(300/a.rate))};
 return phases.includes(a.phase)&&exact(a.phaseTicks,phases)&&phases.every(k=>a.phaseTicks[k]===p[k])&&Number.isSafeInteger(a.left)&&a.left>=1&&a.left<=p[a.phase]&&Number.isSafeInteger(a.elapsed)&&a.elapsed>=0&&a.elapsed===phases.slice(0,phases.indexOf(a.phase)).reduce((n,k)=>n+p[k],0)+p[a.phase]-a.left&&Number.isSafeInteger(a.castTick)&&a.castTick>=0&&a.castTick+a.elapsed===tick&&a.total===p.windup+p.lock&&a.dashStep===0&&a.fired===(a.elapsed>p.windup+p.lock);
}
export function validHealEvent(e,capability){
 const marked=e?.heal20!==undefined||e?.outerRadius!==undefined;
 if(e?.type!=='healCast')return !marked;
 if(!capability)return !marked;
 if(!Number.isSafeInteger(e.id)||capability(e.id)===undefined)return false;
 if(!capability(e.id))return !marked;
 return validCue(e);
}
function validCue(e){return exact(e,['type','id','ability','x','y','radius','heal20','outerRadius'])&&e.type==='healCast'&&e.ability==='healing_light'&&Number.isSafeInteger(e.id)&&e.id>0&&e.heal20===true&&e.radius===160&&e.outerRadius===240&&[e.x,e.y].every(Number.isFinite)&&e.x>=0&&e.y>=0&&e.x<=maxW&&e.y<=maxH;}

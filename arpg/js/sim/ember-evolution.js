// Parent engineering defaults, not a new skill or meteor growth variant.
export const EMBER = Object.freeze({radius:117,inner:12,delay:12,range:560,reach:280});
export const ember20 = levels => Number.isInteger(levels?.ember_bolt) && levels.ember_bolt>=20 && levels.ember_bolt<=30;
export function emberDef(base) { return {...base,delivery:'zone',zone:{radius:117,delayMs:400}}; }
// Exact circle equality is included; inner overlap wins once (target radius included).
export function emberDamage(zone,target) {return Math.hypot(target.x-zone.x,target.y-zone.y)<=12+target.r?60:36;}
export function lockEmberPoint(p,inp,facing,entities,arena,tick=0) {
 let dx=inp.aimX,dy=inp.aimY;
 if (!(Number.isFinite(dx)&&Number.isFinite(dy)&&Math.hypot(dx,dy)>0)) {
  const legal=e=>e.team!==p.team&&!e.dead&&!e.terminal&&!(e.spawnLeft>0)&&!(e.invisibleUntil>tick)&&Math.hypot(e.x-p.x,e.y-p.y)<=560;
  const target=entities.filter(legal).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)||a.id-b.id)[0];
  dx=target?target.x-p.x:Math.cos(facing)*280;dy=target?target.y-p.y:Math.sin(facing)*280;
 }
 const length=Math.hypot(dx,dy);
 const scale=length ? Math.min(1,560/length) : 1;
 return {x:Math.max(0,Math.min(arena.w,p.x+dx*scale)),y:Math.max(0,Math.min(arena.h,p.y+dy*scale))};
}

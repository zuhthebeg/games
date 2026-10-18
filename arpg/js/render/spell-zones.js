import { ABILITIES } from '../content/combat.js';
import { MAX_ZONES } from '../sim/spell-zones.js';
export const SPELL_ZONE_VFX = Object.freeze({ meteor: ABILITIES.meteor.zone, firewall: ABILITIES.firewall.zone });
// One reusable Graphics context, bounded geometry. Presentation only, including reduced motion.
export function paintSpellZones(g, world, reduced = false) {
  g.clear();
  const pending = world.entities.filter(e=>!e.dead && !e.terminal && e.act?.zonePoint && ['windup','lock'].includes(e.act.phase));
  const zones = world.zones || [];
  for (const zone of [...pending.map(e=>({abilityId:e.act.id,...e.act.zonePoint,facing:e.act.facing,pending:true})),...zones].slice(0,MAX_ZONES)) {
    const def=SPELL_ZONE_VFX[zone.abilityId];
    if (!def) continue;
    const x=zone.x,y=zone.y;
    if (def.radius) {
      const remaining=zone.pending ? 1 : Math.max(0,(zone.activeTick-world.tick)/Math.max(1,zone.activeTick-zone.startTick));
      g.circle(x,y,def.radius).fill({color:0xf06d28,alpha:.12}).stroke({color:0xffb34b,width:3,alpha:.9});
      g.moveTo(x-12,y).lineTo(x+12,y).moveTo(x,y-12).lineTo(x,y+12).stroke({color:0xffe3aa,width:2});
      g.arc(x,y,def.radius-7,-Math.PI/2,-Math.PI/2+Math.PI*2*(1-remaining)).stroke({color:0xffdc81,width:4});
      if (!zone.pending) {
        const height=reduced ? 42 : 32+remaining*210;
        if (!reduced) g.moveTo(x,y-height-65).lineTo(x,y-height).stroke({color:0xfca344,width:17,alpha:.6});
        g.circle(x,y-height,19).fill(0xf27a30).circle(x-3,y-height+3,10).fill(0xffdf91);
      }
    } else {
      const dx=-Math.sin(zone.facing),dy=Math.cos(zone.facing),nx=Math.cos(zone.facing),ny=Math.sin(zone.facing),half=def.length/2;
      const a={x:x-dx*half,y:y-dy*half},b={x:x+dx*half,y:y+dy*half};
      g.moveTo(a.x,a.y).lineTo(b.x,b.y).stroke({color:0xe76a26,width:def.width*2,alpha:zone.pending ? .18 : .35});
      g.moveTo(a.x,a.y).lineTo(b.x,b.y).stroke({color:0xffc45c,width:3,alpha:.9});
      if (!zone.pending) {
        const age=world.tick-zone.startTick, remaining=Math.max(0,(zone.endTick-world.tick)/(zone.endTick-zone.startTick));
        const pulse=!reduced && age%15<3;
        for(let i=0;i<=10;i++) {
          const px=a.x+(b.x-a.x)*i/10,py=a.y+(b.y-a.y)*i/10;
          const h=reduced ? 24 : 24+(pulse?12:0)+((i+Math.floor(age/3))%3)*4;
          g.moveTo(px-7,py).quadraticCurveTo(px-11,py-12,px,py-h).quadraticCurveTo(px+12,py-7,px+7,py).fill({color:0xf18b35,alpha:.95});
          g.moveTo(px-3,py).lineTo(px,py-h*.6).lineTo(px+4,py).fill(0xffe19b);
        }
        // Duration track offset from the line, visible without animation/color discrimination.
        g.moveTo(a.x+nx*27,a.y+ny*27).lineTo(b.x+nx*27,b.y+ny*27).stroke({color:0x32231c,width:6});
        g.moveTo(a.x+nx*27,a.y+ny*27).lineTo(a.x+(b.x-a.x)*remaining+nx*27,a.y+(b.y-a.y)*remaining+ny*27).stroke({color:0xffdf99,width:4});
      }
    }
  }
}

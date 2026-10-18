// Shared geometry only: guests can display a locked target but never own a zone.
export const MAX_ZONES = 32;
export function lockSpellPoint(p, facing, entities, arena, manual, def) {
  let reach = def.reach;
  if (!manual) {
    const nearest = entities.filter(e => e.team !== p.team && !e.dead && !e.terminal && !(e.spawnLeft > 0))
      .map(e => Math.hypot(e.x - p.x, e.y - p.y)).filter(d => d <= def.range).sort((a,b) => a-b)[0];
    if (nearest !== undefined) reach = nearest;
  }
  reach = Math.min(def.range, reach);
  return { x: Math.max(0, Math.min(arena.w, p.x + Math.cos(facing) * reach)), y: Math.max(0, Math.min(arena.h, p.y + Math.sin(facing) * reach)) };
}
export function zoneContains(zone, def, target) {
  const dx=target.x-zone.x, dy=target.y-zone.y;
  if (def.radius) return dx*dx+dy*dy <= (def.radius+target.r)**2;
  const along = -dx*Math.sin(zone.facing)+dy*Math.cos(zone.facing);
  const across = dx*Math.cos(zone.facing)+dy*Math.sin(zone.facing);
  return across*across + Math.max(0,Math.abs(along)-def.length/2)**2 <= (def.width+target.r)**2;
}
export function validZones(zones) {
  return zones === undefined || Array.isArray(zones) && zones.length <= MAX_ZONES && zones.every(z => z && ['meteor','firewall'].includes(z.abilityId)
    && ['id','ownerId','team','startTick','activeTick','endTick'].every(k=>Number.isSafeInteger(z[k]) && z[k]>=0)
    && ['x','y','facing'].every(k=>Number.isFinite(z[k]) && Math.abs(z[k])<=100000)
    && z.activeTick>=z.startTick && z.endTick>=z.activeTick && z.endTick-z.startTick<=120);
}

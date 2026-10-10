import { emptyInput, getTelegraphs } from '../../js/sim/world.js';
import { shapeHitsCircle } from '../../js/sim/core.js';

// Read-only policy. A 200 ms decision cadence approximates reaction latency; no state writes.
export function botInput(world, player) {
  const input = emptyInput();
  input.potionEdge = player.hp < player.maxHp * .35;
  const target = world.entities.filter(e => e.kind === 'monster' && !e.dead && !e.spawnLeft)
    .sort((a, b) => Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0];
  const danger = getTelegraphs(world).find(t => (t.phase === 'lock' || t.progress > .7)
    && shapeHitsCircle(t.shape,t.ox,t.oy,t.facing,player.x,player.y,player.r+12));
  if (danger) {
    // Choose the lateral side with room, rather than repeatedly dodging into the arena wall.
    const nx = -Math.sin(danger.facing), ny = Math.cos(danger.facing);
    const margin = sign => Math.min(player.x+nx*150*sign,world.arena.w-player.x-nx*150*sign,
      player.y+ny*150*sign,world.arena.h-player.y-ny*150*sign);
    const sign = margin(1) >= margin(-1) ? 1 : -1;
    input.mx=nx*sign; input.my=ny*sign; input.dodgeEdge=true;
  } else if (target) {
    const dx=target.x-player.x,dy=target.y-player.y,d=Math.hypot(dx,dy)||1;
    input.aimX=dx;input.aimY=dy;
    const ranged=player.weapon!=='blade',lo=ranged?220:0,hi=ranged?310:65;
    const direction=d<lo?-1:d>hi?1:0;
    input.mx=dx/d*direction;input.my=dy/d*direction;
    input.attack=d<(ranged?500:110);input.skillEdge=d<(ranged?460:160);
  }
  return input;
}

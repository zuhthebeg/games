// Position-only body constraints, in the host's existing entity/pair order.
export function bodyContactEligible(a, b) {
  return !a.dead && !a.terminal && !(a.spawnLeft > 0) && !b.dead && !b.terminal && !(b.spawnLeft > 0)
    && !(a.kind === 'player' && b.kind === 'player')
    && !(a.kind === 'player' && a.dodge?.dashLeft > 0)
    && !(b.kind === 'player' && b.dodge?.dashLeft > 0);
}
export function bodyWeight(e, tick) {
  return e.act?.phase === 'active' && e.act.def.delivery === 'dash' || e.frozenUntil > tick ? 0 : 1;
}
function capacity(e, nx, ny, {w,h}) {
  return Math.max(0,Math.min(nx > 0 ? (w-e.r-e.x)/nx : nx < 0 ? (e.r-e.x)/nx : Infinity,
    ny > 0 ? (h-e.r-e.y)/ny : ny < 0 ? (e.r-e.y)/ny : Infinity));
}
// One bounded pair solve. A wall-blocked body's unused share goes to the other
// movable body, rather than being discarded by the end-of-tick arena clamp.
export function separateBodyPair(a, b, arena, tick) {
  if (!bodyContactEligible(a,b)) return;
  const aw=bodyWeight(a,tick),bw=bodyWeight(b,tick),tot=aw+bw;
  if (!tot) return;
  // Out-of-bounds integration is clamped before allocating available room.
  for(const e of [a,b]) {e.x=Math.max(e.r,Math.min(arena.w-e.r,e.x));e.y=Math.max(e.r,Math.min(arena.h-e.r,e.y));}
  const min=a.r+b.r,ex=b.x-a.x,ey=b.y-a.y,d=Math.sqrt(ex*ex+ey*ey);
  if (d>=min) return;
  let nx,ny;
  if(d>0){nx=ex/d;ny=ey/d;}
  else {
    // Entity IDs, not RNG or frame time. Prefer the stable axis/sign, switching
    // only if that axis has no room (e.g. a fixed body against a world edge).
    const sign=a.id<b.id?1:-1;
    const axes=[[sign,0],[0,sign],[-sign,0],[0,-sign]];
    [nx,ny]=axes[0];let best=-1;
    for(const [x,y] of axes){const room=(aw?capacity(a,-x,-y,arena):0)+(bw?capacity(b,x,y,arena):0);if(room>best){best=room;nx=x;ny=y;}if(room>=min)break;}
  }
  let depth=min-d;
  if ((aw?capacity(a,-nx,-ny,arena):0)+(bw?capacity(b,nx,ny,arena):0)<depth) {
    // Opposite walls at a corner can block both halves of the radial normal.
    // Solve a cardinal exit analytically, not repeated push/clamp oscillation.
    let best=Infinity;
    for(const [x,y] of [[1,0],[0,1],[-1,0],[0,-1]]) {
      const along=ex*x+ey*y,need=-along+Math.sqrt(along*along+min*min-d*d);
      const room=(aw?capacity(a,-x,-y,arena):0)+(bw?capacity(b,x,y,arena):0);
      if(need<=room&&need<best){best=need;nx=x;ny=y;}
    }
    if(Number.isFinite(best))depth=best;
  }
  const ac=aw?capacity(a,-nx,-ny,arena):0,bc=bw?capacity(b,nx,ny,arena):0;
  const push=depth/2;
  if(ac>=depth*(aw/tot)&&bc>=depth*(bw/tot)){
    a.x-=nx*push*2*(aw/tot);a.y-=ny*push*2*(aw/tot);
    b.x+=nx*push*2*(bw/tot);b.y+=ny*push*2*(bw/tot);return;
  }
  let ap=Math.min(ac,depth*aw/tot),bp=Math.min(bc,depth*bw/tot);
  let left=Math.max(0,depth-ap-bp);
  const extraA=Math.min(ac-ap,left);ap+=extraA;left-=extraA;
  bp+=Math.min(bc-bp,left);
  a.x-=nx*ap;a.y-=ny*ap;b.x+=nx*bp;b.y+=ny*bp;
}

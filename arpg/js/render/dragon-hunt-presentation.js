// Read-only overlay. Every plume stays inside the authoritative projected sector.
// Prepared kits have only generic six-frame attack clips, NOT authored breath/stomp/tail clips.
export const HUNT_DRAGONS = new Set(['ember_dragon','frost_dragon','venom_dragon']);
const BREATHS={ember_breath:[0xf28b3c,0xffdf85],frost_breath:[0x8ad3e8,0xe3faff],venom_breath:[0x88c64a,0xcbe78d]};
export function huntDragonFrame(act,count=6) {
 const phases=act.phaseTicks || Object.fromEntries(['windup','lock','active','recovery'].map(p=>[p,Math.ceil((act.def[p+'Ms']||0)/(1000/30))]));
 const start={windup:0,lock:phases.windup,active:phases.windup+phases.lock,recovery:phases.windup+phases.lock+phases.active};
 const progress=Math.max(0,Math.min(.999,(act.elapsed-start[act.phase])/Math.max(1,phases[act.phase])));
 const frame=act.phase==='windup'?Math.floor(progress*2):act.phase==='lock'?2:act.phase==='active'?3+Math.floor(progress*2):5;
 return Math.min(count-1,frame);
}
export function paintHuntDragonVfx(g,tg,tick,reduced=false) {
 const colors=BREATHS[tg.ability];if(!colors)return;
 if(tg.phase!=='active') { g.circle(42,0,8+tg.progress*6).fill({color:colors[1],alpha:.6});return; }
 const half=tg.shape.arc*Math.PI/360, range=tg.shape.range;
 // The cone itself remains the shared red danger cue; elemental jets never exceed it.
 for(let i=-2;i<=2;i++) {
  const a=i*half*.3,r=range*(.75+(reduced?0:Math.sin(tick*.4+i)*.04));
  const x=Math.cos(a)*r,y=Math.sin(a)*r;
  if(tg.ability==='venom_breath')g.ellipse(x*.7,y*.7,range*.12,range*.055).fill({color:colors[i%2?0:1],alpha:.36});
  else g.poly([35,0,x,y-range*.022,x+range*.04,y,x,y+range*.022]).fill({color:colors[i%2?0:1],alpha:.68});
 }
}

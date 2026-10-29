// Round-admission capability, independent of live display mastery.
export function whirl20(levels) {
  return Number.isInteger(levels?.whirl) && levels.whirl>=20 && levels.whirl<=30;
}
export function whirlTimeline(activeTicks) {
  const first=Math.max(1,Math.ceil(activeTicks/2)),second=Math.max(1,Math.floor(activeTicks/2));
  return {first,second,total:first+second};
}
function frame(act,t) {
  const {first,second}=whirlTimeline(act.phaseTicks.active);
  if(t<0 || t>=first+second) return {segment:0,progress:0};
  return t<first ? {segment:1,progress:(t+1)/first} : {segment:2,progress:(t-first+1)/second};
}
export function nextWhirlFrame(act) {return frame(act,act.phaseTicks.active-act.left);}
// Stored elapsed is the next step; presentation shows the contact just completed.
export function whirlFrame(act) {return frame(act,act.elapsed-act.phaseTicks.windup-act.phaseTicks.lock-1);}

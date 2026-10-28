// Parent tuning defaults: total190, two95 segments, three fixed host ticks.
// Combat eligibility is captured once at round admission, never live VFX metadata.
export function lunge20(levels) {
  const n=levels?.lunge;
  return Number.isInteger(n) && n>=20 && n<=30;
}
export function lungeTimeline(activeTicks) {
  const first=Math.max(1,Math.ceil(activeTicks/2)), second=Math.max(1,Math.floor(activeTicks/2));
  return {first,second,total:first+3+second};
}
export function lungeFrame(act) {
  const {first,second}=lungeTimeline(act.phaseTicks.active-3);
  const t=act.phaseTicks.active-act.left;
  return t<first ? {segment:1,distance:95/first} : t<first+3 ? {segment:0,distance:0} : {segment:2,distance:95/second};
}

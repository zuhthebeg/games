// Presentation-only clocks. No combat constants or gameplay state are changed here.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const GS_STATE_SECONDS = { charge: 1.5, roll: .62, drink: 1.25, hit: .42, stun: 1.25, down: 1.15, dead: 2.3 };
export function gsClipName(p) {
  if (p.state === 'atk') return ['v','h','h2','spin'].includes(p.cur?.sw) ? p.cur.sw : 'other';
  return p.state === 'idle' ? (p.moving ? 'walk' : 'idle') : Object.hasOwn(GS_STATE_SECONDS, p.state) ? p.state : 'idle';
}
export function gsClipTime(p, clip) {
  const end = clip.duration;
  if (p.state === 'idle') return ((p.moving ? (p.walk || 0) / 2.6 : (p.t || 0)) % end + end) % end;
  if (p.state === 'atk' && p.cur && clip.impact) {
    const a=p.cur, t=clamp(p.t,0,a.dur), [hit0,hit1]=clip.impact;
    if(t<=a.h0) return hit0*(t/Math.max(a.h0,1e-8));
    if(t<=a.h1 && a.h1>a.h0) return hit0+(hit1-hit0)*(t-a.h0)/(a.h1-a.h0);
    return hit1+(end-hit1)*(t-a.h1)/Math.max(a.dur-a.h1,1e-8);
  }
  return end * clamp(p.t / (GS_STATE_SECONDS[p.state] || end),0,1);
}

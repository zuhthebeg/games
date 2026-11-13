// Presentation-only clocks. No combat constants or gameplay state are changed here.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const GS_STATE_SECONDS = { charge: 1.5, roll: .62, drink: 1.25, hit: .42, stun: 1.25, down: 1.15, dead: 2.3 };
export function gsClipName(p) {
  if(p.state==='guard') return 'guard';
  if (p.state === 'atk' && (p.combo === -1 || p.cur?.charge > 0 && !p.cur?.shot)) return 'heavy';
  if (p.state === 'atk') return ['v','h','h2','spin'].includes(p.cur?.sw) ? p.cur.sw : 'other';
  return p.state === 'idle' ? (p.moving ? 'walk' : 'idle') : Object.hasOwn(GS_STATE_SECONDS, p.state) ? p.state : 'idle';
}
export function gsClipTime(p, clip) {
  const end = clip.duration;
  if(p.state==='guard') return end*.5;
  if (p.state === 'idle') return ((p.moving ? (p.walk || 0) / 2.6 : (p.t || 0)) % end + end) % end;
  if (p.state === 'atk' && p.cur && clip.impact) {
    const a=p.cur, t=clamp(p.t,0,a.dur), [hit0,hit1]=clip.impact;
    if(t<=a.h0) return hit0*(t/Math.max(a.h0,1e-8));
    if(t<=a.h1 && a.h1>a.h0) return hit0+(hit1-hit0)*(t-a.h0)/(a.h1-a.h0);
    return hit1+(end-hit1)*(t-a.h1)/Math.max(a.dur-a.h1,1e-8);
  }
  if(p.state==='charge' && clip.windup) return clip.windup[0]+(clip.windup[1]-clip.windup[0])*clamp((p.t||0)/1.5,0,1);
  if(p.state==='charge' && p.clv !== undefined) {
    const level=Math.min(2,Math.floor(p.clv));
    return end * clamp(.16 + level*.27 + Math.min(.18,Math.max(0,p.t-level*.5)*.36),0,1);
  }
  return end * clamp(p.t / (GS_STATE_SECONDS[p.state] || end),0,1);
}

export function chargeVisualState(p){
 const active=p.weapon==='gs'&&p.state==='charge';
 const ratio=active?clamp((p.t||0)/1.5,0,1):0;
 return {active,ratio,stage:active?Math.min(3,Math.floor(ratio*3+1e-5)):-1};
}

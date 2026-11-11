const lerp = (a,b,t)=>a+(b-a)*t;
const angle = (a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
// Samples are keyed by simulation ticks, never packet arrival times.
export class TickBuffer {
  constructor(maxExtrapolateTicks=6) { this.samples=[]; this.maxExtrapolateTicks=maxExtrapolateTicks; }
  push(tick, value) {
    if (!Number.isFinite(tick) || (this.samples.length && tick<=this.samples.at(-1).tick)) return false;
    this.samples.push({tick,value:structuredClone(value)});
    if(this.samples.length>120) this.samples.shift();
    return true;
  }
  sample(tick) {
    const a=this.samples;
    if(!a.length) return null;
    if(tick<=a[0].tick) return structuredClone(a[0].value);
    for(let i=1;i<a.length;i++) if(tick<=a[i].tick) {
      const old=a[i-1], next=a[i], k=(tick-old.tick)/(next.tick-old.tick);
      const out=structuredClone(old.value);
      for(const field of ['x','y','z','spin','t']) if(Number.isFinite(old.value[field]) && Number.isFinite(next.value[field])) out[field]=lerp(old.value[field],next.value[field],k);
      if(Number.isFinite(out.yaw)) out.yaw=angle(old.value.yaw,next.value.yaw,k);
      return out;
    }
    const last=a.at(-1), prev=a.at(-2), out=structuredClone(last.value);
    if(prev) {
      const limit=this.maxExtrapolateTicks;
      const age=Math.max(0,Math.min(limit,tick-last.tick));
      // Integral of a linearly decelerating velocity: continuous at the boundary,
      // reaches zero velocity within 100ms and never snaps back to last sample.
      const distance=limit ? age-age*age/(2*limit) : 0;
      for(const field of ['x','y','z']) if(Number.isFinite(out[field]) && Number.isFinite(prev.value[field])) out[field]+=(last.value[field]-prev.value[field])/(last.tick-prev.tick)*distance;
    }
    return out;
  }
}
// HP is presentation-only; snap the initial value, exponentially converge after it.
export class HpDisplay {
  constructor(hp) { this.value=hp; }
  update(target,dt) { this.value+=(target-this.value)*(1-Math.exp(-dt/.1)); return this.value; }
}

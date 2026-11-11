// Host-tick playback, with bounded slew rather than seek after startup.
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export class PlaybackClock {
  constructor() {
    this.offset = null; this.playTick = null; this.last = null;
    this.jitter = []; this.delayMs = 1000*8/60; this.rate = 1;
  }
  observe(tick, nowMs) {
    if (!Number.isFinite(tick) || !Number.isFinite(nowMs)) return;
    if (this.last && tick <= this.last.tick) return;
    const offset = tick - nowMs*60/1000;
    if (this.offset === null) this.offset = offset;
    else this.offset += clamp(offset-this.offset,-.25,.25)*.1;
    if (this.last) {
      this.jitter.push(Math.abs((nowMs-this.last.nowMs)-(tick-this.last.tick)*1000/60));
      if (this.jitter.length>120) this.jitter.shift();
      const sorted = [...this.jitter].sort((a,b)=>a-b);
      const p95 = sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)];
      const wanted = clamp(1000*8/60+p95,100,250);
      this.delayMs += (wanted-this.delayMs)*.05;
    }
    this.last = { tick, nowMs };
    if (this.playTick === null) this.playTick = tick-this.delayMs*60/1000;
  }
  advance(dt, nowMs) {
    if (this.playTick === null) return null;
    const target = nowMs*60/1000+this.offset-this.delayMs*60/1000;
    this.rate = clamp(1+(target-this.playTick)*.005,.95,1.05);
    this.playTick += Math.max(0,dt)*60*this.rate;
    return this.playTick;
  }
  get latencyMs() { return this.last ? this.delayMs : null; }
}

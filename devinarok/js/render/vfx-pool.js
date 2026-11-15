export const VFX_PARTICLE_CAPS = Object.freeze({ high: 700, medium: 380, low: 160 });

export function particleLimitForQuality(quality, reducedMotion = false) {
  const cap = VFX_PARTICLE_CAPS[quality] ?? VFX_PARTICLE_CAPS.medium;
  return Math.floor(cap * (reducedMotion ? 0.5 : 1));
}

export class FixedPool {
  constructor(capacity, factory = () => ({})) {
    this.capacity = Math.max(0, Math.trunc(capacity));
    this.limit = this.capacity;
    this.active = [];
    this.free = Array.from({ length: this.capacity }, factory);
  }

  setLimit(limit) {
    this.limit = Math.min(this.capacity, Math.max(0, Math.trunc(limit)));
    while (this.active.length > this.limit) this.free.push(this.active.shift());
  }

  acquire() {
    if (this.limit === 0) return null;
    const item = this.active.length >= this.limit
      ? this.active.shift()
      : this.free.pop();
    this.active.push(item);
    return item;
  }

  release(item) {
    const index = this.active.indexOf(item);
    if (index < 0) return false;
    this.active.splice(index, 1);
    this.free.push(item);
    return true;
  }

  clear() {
    this.free.push(...this.active);
    this.active.length = 0;
  }
}

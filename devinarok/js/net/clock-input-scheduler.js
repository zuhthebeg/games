export class ClockInputScheduler {
  constructor({ tickRate = 30, leadSmoothing = 0.2, maxSteps = 3 } = {}) {
    this.tickRate = tickRate;
    this.leadSmoothing = leadSmoothing;
    this.maxSteps = maxSteps;
    this.lastProducedTick = null;
    this.clockEpoch = null;
    this.leadTicks = 1;
  }

  reset() {
    this.lastProducedTick = null;
    this.clockEpoch = null;
    this.leadTicks = 1;
  }

  steps(clock, nowMs) {
    if (!clock) return 0;
    const estimate = clock.getEstimate(nowMs);
    const targetLead = Math.ceil(Math.max(0, clock.rttMs) * this.tickRate / 2000) + 1;
    this.leadTicks += (targetLead - this.leadTicks) * this.leadSmoothing;
    const targetTick = Math.floor(estimate + this.leadTicks);
    if (this.lastProducedTick === null || this.clockEpoch !== clock.epoch) {
      this.clockEpoch = clock.epoch;
      this.lastProducedTick = targetTick;
      return 0;
    }
    const count = Math.max(0, Math.min(this.maxSteps, targetTick - this.lastProducedTick));
    this.lastProducedTick += count;
    return count;
  }
}

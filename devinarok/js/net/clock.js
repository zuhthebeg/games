const DEFAULT_TICK_RATE = 30;
const EWMA_ALPHA = 0.2;
const INITIAL_PING_INTERVAL_MS = 250;
const STEADY_PING_INTERVAL_MS = 1000;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export class ServerClock {
  constructor({ tickRate = DEFAULT_TICK_RATE, alpha = EWMA_ALPHA } = {}) {
    this.tickRate = tickRate;
    this.alpha = clamp(alpha, 0, 1);
    this.offsetTicks = 0;
    this.rttMs = 0;
    this.jitterMs = 0;
    this.playbackRate = 1;
    this.samples = 0;
    this.pingsSent = 0;
    this.nextPingAt = null;
    this.pendingPings = new Map();
    this.lastEstimate = null;
    this.lastEstimateAt = null;
    this.previousRtt = null;
  }

  makePing(nowMs) {
    if (!Number.isFinite(nowMs)) throw new TypeError('Ping time must be finite');
    if (this.nextPingAt !== null && nowMs < this.nextPingAt) return null;
    const c = nowMs;
    this.pendingPings.set(c, nowMs);
    this.pingsSent += 1;
    this.nextPingAt = nowMs + (
      this.pingsSent < 4 ? INITIAL_PING_INTERVAL_MS : STEADY_PING_INTERVAL_MS
    );
    return { t: 'ping', c };
  }

  observePong({ c, t }, receivedAtMs) {
    if (!Number.isFinite(c) || !Number.isFinite(t) || !Number.isFinite(receivedAtMs)) return false;
    const sentAtMs = this.pendingPings.get(c) ?? c;
    this.pendingPings.delete(c);
    const rtt = Math.max(0, receivedAtMs - sentAtMs);
    const midpoint = sentAtMs + rtt / 2;
    const sampleOffset = t - midpoint * this.tickRate / 1000;
    if (!this.samples) {
      this.offsetTicks = sampleOffset;
      this.rttMs = rtt;
      this.jitterMs = 0;
    } else {
      this.offsetTicks += this.alpha * (sampleOffset - this.offsetTicks);
      this.rttMs += this.alpha * (rtt - this.rttMs);
      const sampleJitter = Math.abs(rtt - this.previousRtt);
      this.jitterMs += this.alpha * (sampleJitter - this.jitterMs);
    }
    this.previousRtt = rtt;
    this.samples += 1;
    this.estimateTick(receivedAtMs);
    return true;
  }

  estimateTick(nowMs) {
    if (!Number.isFinite(nowMs)) throw new TypeError('Clock time must be finite');
    const target = nowMs * this.tickRate / 1000 + this.offsetTicks;
    if (this.lastEstimate === null) {
      this.lastEstimate = target;
      this.lastEstimateAt = nowMs;
      return target;
    }
    const elapsed = Math.max(0, nowMs - this.lastEstimateAt);
    const advanced = this.lastEstimate + elapsed * this.tickRate / 1000 * this.playbackRate;
    const drift = target - advanced;
    this.playbackRate = clamp(1 + drift * 0.02, 0.95, 1.05);
    this.lastEstimate = Math.max(this.lastEstimate, advanced + drift * 0.1);
    this.lastEstimateAt = Math.max(this.lastEstimateAt, nowMs);
    return this.lastEstimate;
  }

  getEstimate(nowMs) {
    return this.estimateTick(nowMs);
  }
}

export function createClock(options) {
  return new ServerClock(options);
}

function normalizeInput(input) {
  const seq = Number(input.seq);
  if (!Number.isSafeInteger(seq) || seq < 0) throw new TypeError('Input seq must be a nonnegative integer');
  const normalized = {
    seq,
    moveX: Number(input.moveX ?? input.mx ?? 0),
    moveZ: Number(input.moveZ ?? input.mz ?? 0),
    aim: Number(input.aim ?? 0),
    buttons: Number(input.buttons ?? input.b ?? 0),
  };
  const viewTick = input.viewTick ?? input.vt;
  if (Number.isSafeInteger(viewTick)) normalized.viewTick = viewTick;
  return normalized;
}

export class InputQueue {
  constructor({ lastAppliedSeq = 0, maxPending = 90 } = {}) {
    this.lastAppliedSeq = lastAppliedSeq;
    this.maxPending = Math.max(1, Math.trunc(maxPending));
    this.pending = new Map();
    this.skipped = 0;
    this.fullResyncRequired = false;
  }

  enqueue(rawInput) {
    const input = normalizeInput(rawInput);
    if (input.seq <= this.lastAppliedSeq || this.pending.has(input.seq)) return false;
    this.pending.set(input.seq, input);
    while (this.pending.size > this.maxPending) {
      const oldestSeq = Math.min(...this.pending.keys());
      this.pending.delete(oldestSeq);
      this.lastAppliedSeq = Math.max(this.lastAppliedSeq, oldestSeq);
      this.skipped += 1;
      this.fullResyncRequired = true;
    }
    return true;
  }

  consumeForTick() {
    const limit = this.pending.size > 2 ? 2 : 1;
    const inputs = [];
    while (inputs.length < limit) {
      const nextSeq = this.lastAppliedSeq + 1;
      const next = this.pending.get(nextSeq);
      if (!next) break;
      this.pending.delete(nextSeq);
      this.lastAppliedSeq = nextSeq;
      inputs.push({ ...next });
    }
    return {
      inputs,
      ack: this.lastAppliedSeq,
      skipped: this.skipped,
      fullResync: this.fullResyncRequired,
    };
  }

  takeFullResyncRequest() {
    const requested = this.fullResyncRequired;
    this.fullResyncRequired = false;
    return requested;
  }

  get pendingCount() {
    return this.pending.size;
  }
}

export function createInputQueue(options) {
  return new InputQueue(options);
}

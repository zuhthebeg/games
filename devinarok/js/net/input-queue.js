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
  constructor({ lastAppliedSeq = 0, maxPending = 6, repeatTicks = 4 } = {}) {
    this.lastAppliedSeq = lastAppliedSeq;
    this.maxPending = Math.max(1, Math.trunc(maxPending));
    this.repeatTicks = Math.max(0, Math.trunc(repeatTicks));
    this.pending = new Map();
    this.lastInput = { seq: lastAppliedSeq, moveX: 0, moveZ: 0, aim: 0, buttons: 0 };
    this.gapTicks = 0;
    this.skipped = 0;
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
    }
    return true;
  }

  consume() {
    const nextSeq = this.lastAppliedSeq + 1;
    const next = this.pending.get(nextSeq);
    if (next) {
      this.pending.delete(nextSeq);
      this.lastAppliedSeq = nextSeq;
      this.lastInput = next;
      this.gapTicks = 0;
      return { input: { ...next }, ack: this.lastAppliedSeq, repeated: false, idle: false, skipped: this.skipped };
    }

    this.gapTicks += 1;
    const repeating = this.gapTicks <= this.repeatTicks;
    const input = repeating
      ? { ...this.lastInput, seq: this.lastAppliedSeq, buttons: 0 }
      : { seq: this.lastAppliedSeq, moveX: 0, moveZ: 0, aim: this.lastInput.aim, buttons: 0 };
    return {
      input,
      ack: this.lastAppliedSeq,
      repeated: repeating,
      idle: !repeating,
      skipped: this.skipped,
    };
  }

  get pendingCount() {
    return this.pending.size;
  }
}

export function createInputQueue(options) {
  return new InputQueue(options);
}

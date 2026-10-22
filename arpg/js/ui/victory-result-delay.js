// UI clock only. Settlement and authoritative terminal state are owned by callers.
export function victoryResultDelay() {
  let pending = null, identity = null;
  return {
    get pending() { return pending !== null; },
    cancel() { pending = null; identity = null; },
    schedule(receipt, show, now) {
      if (identity === receipt) return;
      pending = null; identity = receipt;
      if (receipt.terminal !== 'clear') { show(); return; }
      pending = { due: now + 5000, show };
    },
    update(now) {
      if (!pending || now < pending.due) return;
      const show = pending.show; pending = null; show();
    },
  };
}

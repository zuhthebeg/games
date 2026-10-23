// UI clock only. Settlement and authoritative terminal state are owned by callers.
export function victoryResultDelay({ onClear = () => {}, onCancel = () => {} } = {}) {
  let pending = null, identity = null;
  return {
    get pending() { return pending !== null; },
    cancel() { if (pending) onCancel(); pending = null; identity = null; },
    schedule(receipt, show, now) {
      if (identity === receipt) return;
      pending = null; identity = receipt;
      if (receipt.terminal !== 'clear') { onCancel(); show(); return; }
      onClear();
      pending = { due: now + 3000, show };
    },
    update(now) {
      if (!pending || now < pending.due) return;
      const show = pending.show; pending = null; onCancel(); show();
    },
  };
}

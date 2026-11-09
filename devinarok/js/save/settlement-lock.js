export function acquireSettlement(state, pause) {
  if (state.settled) return false;
  state.settled = true;
  pause();
  return true;
}

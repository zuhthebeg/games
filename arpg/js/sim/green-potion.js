// One run-local transaction shared by the host and display-only guest prediction.
// Capability is derived from the frozen departure save, never an input packet.
const KEYS = ['speed', 'attackSpeedBonus', 'dodgeCdMult', 'iframeBonusMs', 'effectiveAgi'];
export function useGreenPotion(p) {
  if (p.dead || p.terminal || p.greenActive || !(p.greenPotions > 0) || !p.greenMods) return false;
  p.greenBase = Object.fromEntries(KEYS.map(k => [k, p[k]]));
  p.greenPotions--;
  p.greenActive = true;
  Object.assign(p, p.greenMods);
  p.effectiveAgi = p.greenBase.effectiveAgi + 20;
  return true;
}
export function clearGreenPotion(p) {
  if (!p.greenActive) return;
  Object.assign(p, p.greenBase);
  p.greenActive = false;
  delete p.greenBase;
}

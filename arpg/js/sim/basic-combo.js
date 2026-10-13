// Shared basic-only data resolution and clock; no hits, RNG or dodge rules here.
import { ABILITIES, WEAPONS } from '../content/combat.js';
import { ticks } from './core.js';
export function resetCombo(p) {
  if (p.combo) p.combo = { step: 0, windowLeft: 0, weapon: p.weapon, form: p.weaponForm ?? null };
}
export function tickCombo(p) {
  const def = ABILITIES[WEAPONS[p.weapon].basic];
  if (!def.combo) { delete p.combo; return; }
  if (!p.combo) p.combo = { step: 0, windowLeft: 0, weapon: p.weapon, form: p.weaponForm ?? null };
  if (p.combo.weapon !== p.weapon || p.combo.form !== (p.weaponForm ?? null) || p.staggerLeft > 0) resetCombo(p);
  // Completion sets an 18-tick window. The exact 600ms boundary is inclusive.
  if (!p.act && p.combo.step) {
    if (p.combo.windowLeft === 0) resetCombo(p);
    else p.combo.windowLeft--;
  }
}
export function nextComboStep(p) {
  return ABILITIES[WEAPONS[p.weapon].basic].combo ? (p.combo?.step || 0) % 3 + 1 : 0;
}
export function comboDef(id, step = 0, form) {
  const base = ABILITIES[id], entry = base.combo?.[step - 1];
  if (!entry) return base;
  const data = { ...entry, ...(entry.forms?.[form] || {}) };
  return { ...base, ...(data.windupMs !== undefined ? { windupMs: data.windupMs } : {}),
    ...(data.shape ? { shape: data.shape } : {}),
    ...(data.projectile ? { projectile: { ...base.projectile, ...data.projectile } } : {}),
    damage: base.damage * (data.damageMult ?? 1), poise: base.poise * (data.poiseMult ?? 1),
    knockback: base.knockback * (data.knockbackMult ?? 1), comboTrail: data.trail };
}
export function beginCombo(p, id, counter = false) {
  if (id !== WEAPONS[p.weapon].basic || counter) { resetCombo(p); return 0; }
  const step = nextComboStep(p);
  if (step) p.combo = { step, windowLeft: 0, weapon: p.weapon, form: p.weaponForm ?? null };
  return step;
}
export function finishCombo(p, act, interrupted = false) {
  if (!act.step) return;
  if (interrupted || act.counter || act.step === 3) resetCombo(p);
  else if (p.combo?.step === act.step) p.combo.windowLeft = ticks(act.def.comboWindowMs);
}

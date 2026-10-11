// skills-v2 §1: automatic potions and emergency return are generated as ordinary
// input edges, so the host sim, shared potion cooldown and guest prediction stay unchanged.
export const AUTO_USE_LEVELS = Object.freeze([30, 50, 70]);
export const AUTO_RETURN_HP_PCT = 20;
export const DEFAULT_AUTO_USE = Object.freeze({ potion: true, hp: 50, mp: 50, recall: true });

export function validAutoUse(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => Object.hasOwn(DEFAULT_AUTO_USE, key))
    && (value.potion === undefined || typeof value.potion === 'boolean')
    && (value.recall === undefined || typeof value.recall === 'boolean')
    && (value.hp === undefined || AUTO_USE_LEVELS.includes(value.hp))
    && (value.mp === undefined || AUTO_USE_LEVELS.includes(value.mp));
}

export const autoUseSettings = (save) => ({ ...DEFAULT_AUTO_USE, ...save?.autoUse });

const below = (value, max, pct) => max > 0 && value * 100 < max * pct;

// Mutates and returns `inp`. Manual consumable/dodge input in the same tick wins.
export function applyAutoUse(inp, p, settings) {
  if (!inp || !p || !settings || p.dead || p.terminal || p.channel > 0) return inp;
  if (inp.potionEdge || inp.manaEdge || inp.scrollEdge || inp.dodgeEdge) return inp;
  if (settings.potion && p.potionCd === 0) {
    if (p.potions > 0 && below(p.hp, p.maxHp, settings.hp)) inp.potionEdge = true;
    else if (p.manaPotions > 0 && below(p.mp, p.maxMp, settings.mp)) inp.manaEdge = true;
  }
  if (!inp.potionEdge && settings.recall && p.potions === 0 && p.scrolls > 0 && p.scrollRetry === 0
    && !p.act && p.hp * 100 <= p.maxHp * AUTO_RETURN_HP_PCT) inp.scrollEdge = true;
  return inp;
}

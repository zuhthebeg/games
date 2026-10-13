import { ITEMS, RECIPES } from './items.js';

// cocy 10-14: a recipe is revealed once any of its materials has ever been obtained.
// Persisted as save.seenMaterials so spending the material later does not hide it again.
const isMaterial = (id) => ITEMS[id]?.kind === 'material';

export function seenMaterials(save) {
  const seen = new Set(save.seenMaterials || []);
  for (const [id, count] of Object.entries(save.stacks || {})) if (count > 0 && isMaterial(id)) seen.add(id);
  return seen;
}

export function noteMaterials(save) {
  const seen = seenMaterials(save);
  const before = save.seenMaterials || [];
  if (seen.size === before.length) return save;
  return { ...save, seenMaterials: [...seen].sort() };
}

export function recipeRevealed(save, id, seen = seenMaterials(save)) {
  return Object.keys(RECIPES[id]).some((key) => key !== 'gold' && seen.has(key));
}

export const validSeenMaterials = (value) => Array.isArray(value)
  && new Set(value).size === value.length && value.every((id) => typeof id === 'string' && isMaterial(id));

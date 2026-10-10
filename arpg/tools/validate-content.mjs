// Minimal §11.4 gate: references, palette/danger separation and telegraph durations.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ABILITIES, MONSTERS, STAGES } from '../js/content/combat.js';
import {
  DANGER_COLORS, MONSTER_VARIANTS, MONSTER_MODELS, MONSTER_PALETTES, MONSTER_NAMES,
} from '../js/content/monsters.js';
import { NEW_MONSTER_DROPS } from '../js/content/loot.js';
import { ITEMS, RECIPES } from '../js/meta/items.js';

export function validateContent({
  abilities = ABILITIES, monsters = MONSTERS, stages = STAGES,
  variants = MONSTER_VARIANTS, models = MONSTER_MODELS,
  palettes = MONSTER_PALETTES, names = MONSTER_NAMES,
  drops = NEW_MONSTER_DROPS, items = ITEMS, recipes = RECIPES,
} = {}) {
  const errors = [];
  const reference = (catalog, id, label) => {
    if (!Object.hasOwn(catalog, id)) errors.push(`${label}: missing reference ${id}`);
  };
  for (const [id, monster] of Object.entries(monsters)) {
    reference(variants, id, `monster ${id} variant`);
    for (const abilityId of monster.abilities) {
      reference(abilities, abilityId, `monster ${id} ability`);
      const ability = abilities[abilityId];
      if (!ability) continue;
      const minimum = monster.elite || monster.boss ? 800 : 400;
      const duration = ability.windupMs + (ability.lockMs || 0);
      if (!Number.isFinite(duration) || duration < minimum) {
        errors.push(`${id}/${abilityId}: telegraph ${duration}ms < ${minimum}ms`);
      }
      for (const phase of ['windup', 'lock', 'active', 'recovery']) {
        const time = ability[`${phase}Ms`];
        if (!Number.isFinite(time) || time < 0 || (phase === 'active' && time === 0)) {
          errors.push(`${id}/${abilityId}: invalid ${phase} duration`);
        }
      }
      if (ability.poison && !['durationMs', 'intervalMs', 'damage'].every((key) =>
        Number.isFinite(ability.poison[key]) && ability.poison[key] > 0)) {
        errors.push(`${id}/${abilityId}: invalid poison`);
      }
      if (ability.repeatHitMs !== undefined && !(ability.repeatHitMs > 0)) {
        errors.push(`${id}/${abilityId}: invalid repeat interval`);
      }
    }
  }
  for (const [id, variant] of Object.entries(variants)) {
    reference(monsters, variant.baseArchetypeId, `${id} archetype`);
    if (!models.includes(variant.baseModelId)) errors.push(`${id}: missing model ${variant.baseModelId}`);
    reference(palettes, variant.paletteId, `${id} palette`);
    reference(names, variant.nameKey, `${id} name`);
  }
  for (const [id, colors] of Object.entries(palettes)) {
    if (!Array.isArray(colors) || !colors.length) {
      errors.push(`${id}: empty palette`);
      continue;
    }
    for (const color of colors) {
      if (!Number.isInteger(color) || color < 0 || color > 0xffffff) {
        errors.push(`${id}: invalid palette color`);
        continue;
      }
      for (const [meaning, danger] of Object.entries(DANGER_COLORS)) {
        // [제안] Reject exact matches and RGB distances <=32; geometry/hatching remain mandatory.
        const distance = Math.hypot(...[16, 8, 0].map((shift) =>
          ((color >> shift) & 255) - ((danger >> shift) & 255)));
        if (distance <= 32) errors.push(`${id}: palette collides with ${meaning} danger color`);
      }
    }
  }
  for (const [id, stage] of Object.entries(stages)) {
    for (const spawn of stage.spawns) reference(monsters, spawn.monster, `${id} spawn`);
  }
  for (const [id, table] of Object.entries(drops)) {
    reference(monsters, id, 'drop source');
    for (const entry of [...table.stacks, ...table.items]) reference(items, entry.id, `${id} drop`);
  }
  for (const [id, cost] of Object.entries(recipes)) {
    reference(items, id, 'recipe output');
    for (const ingredient of Object.keys(cost)) {
      if (ingredient !== 'gold') reference(items, ingredient, `${id} ingredient`);
    }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = validateContent();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`ARPG content valid: ${Object.keys(MONSTERS).length} monsters, ${Object.keys(STAGES).length} stages`);
  }
}

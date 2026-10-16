import { playerLineage } from '../content/player-lineages.js';
import { createSave, validateSave, SaveStore, SAVE_KEY } from './save.js';
import { createSlotStorage } from './character-slots.js';

// Fresh profiles only: callers cannot supply a weapon, existing save or destination.
export function createSkeletonSave({ lineage, name, answers, createdAt }) {
  if (typeof lineage !== 'string') throw new Error('Skeleton lineage is required');
  const role = playerLineage(lineage);
  if (role.id === 'human') throw new Error('Skeleton lineage is required');
  if (typeof name !== 'string') throw new Error('Invalid character name');
  if (!Array.isArray(answers) || answers.length !== 5
    || !Array.from(answers).every(answer => Number.isInteger(answer) && answer >= 0 && answer <= 3)) {
    throw new Error('Invalid quiz answers');
  }
  const save = { ...createSave({ name, answers, weapon: role.family, createdAt }), lineage: role.id };
  if (role.id === 'skeleton_knight') {
    save.equipped.body = null;
    save.items = save.items.filter(item => item.uid !== 'starter:armor');
  }
  if (!validateSave(save)) throw new Error('Invalid fresh skeleton save');
  return save;
}

export function persistSkeletonCharacter(storage, options) {
  const save = createSkeletonSave(options);
  const adapter = createSlotStorage(storage, save.lineage);
  // Inspect raw primary, never load: occupied corrupt bytes must not be quarantined.
  // Synchronous empty-only guard, not a cross-tab compare-and-swap transaction.
  if (adapter.getItem(SAVE_KEY) !== null) throw new Error('Character slot is occupied');
  new SaveStore(adapter).save(save);
  return save;
}

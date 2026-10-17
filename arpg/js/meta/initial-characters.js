import { validateSave, repairTwohandShield } from './save.js';
import { SLOT_SAVE_KEYS } from './character-slots.js';
import { persistSkeletonCharacter } from './character-creation.js';

// Read raw bytes without migration/quarantine/reset or any human-store fallback.
export function readKnight(storage) {
  const raw = storage.getItem(SLOT_SAVE_KEYS.skeleton_knight);
  if (raw === null) return null;
  let save;
  try { save = JSON.parse(raw); } catch { /* Reject below, preserving original bytes. */ }
  save=repairTwohandShield(save);
  if (!validateSave(save) || save.lineage !== 'skeleton_knight') throw new Error('해골 저장이 손상되었습니다. 원본을 보존하고 진입을 차단합니다.');
  return save;
}
export function createKnight(storage, options) {
  return persistSkeletonCharacter(storage, { ...options, lineage: 'skeleton_knight' });
}

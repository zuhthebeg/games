import { validateSave, repairTwohandShield, migrateStatScale, migrateGreaterStones, RETIRED_SCROLLS } from './save.js';
import { SLOT_SAVE_KEYS } from './character-slots.js';
import { persistSkeletonCharacter } from './character-creation.js';

// Read raw bytes without quarantine/reset or any human-store fallback.
// Only existing, deterministic save migrations are allowed; selection backs up repairs.
export function readKnight(storage) {
  const raw = storage.getItem(SLOT_SAVE_KEYS.skeleton_knight);
  if (raw === null) return null;
  let save;
  const blocked = reason => new Error(`해골 저장이 손상되었거나 호환되지 않습니다: ${reason}. 원본을 보존하고 진입을 차단합니다.`);
  try { save = JSON.parse(raw); } catch { throw blocked('JSON 형식 오류'); }
  if (save?.lineage !== 'skeleton_knight') throw blocked('해골 기사 계보가 아님');
  // Lossless retirement, not an invented stone exchange. Only formerly valid locations/counts.
  const locations = [['stacks', save.stacks], ['lootKept', save.lastReceipt?.lootKept?.stacks],
    ['lootLost', save.lastReceipt?.lootLost?.stacks]];
  const archived = [];
  for (const id of Object.keys(RETIRED_SCROLLS)) {
    if (save.stash?.stacks && Object.hasOwn(save.stash.stacks, id)) throw blocked(`${id} · 잘못된 창고 위치`);
    for (const [source, stacks] of locations) {
      if (!stacks || !Object.hasOwn(stacks, id)) continue;
      if (!Number.isSafeInteger(stacks[id]) || stacks[id] < 0) throw blocked(`${id} · 잘못된 수량`);
      archived.push({ source, id, count: stacks[id] });
    }
  }
  if (archived.length) {
    if (save.retiredScrolls !== undefined) throw blocked('폐지 주문서 보관 기록 충돌');
    save = structuredClone(save);
    for (const { source, id } of archived) {
      const stacks = source === 'stacks' ? save.stacks : save.lastReceipt[source].stacks;
      delete stacks[id];
    }
    save.retiredScrolls = archived;
  }
  if (save.version === 3) save = { ...save, version: 4, stash: { stacks: {} }, learned: [], skills: {} };
  if (save.version === 4) save = migrateStatScale(save);
  save = migrateGreaterStones(save);
  save = repairTwohandShield(save);
  if (!validateSave(save)) throw blocked('캐릭터 능력치·장비·소지품 저장 규칙 검증 실패');
  return save;
}
export function createKnight(storage, options) {
  return persistSkeletonCharacter(storage, { ...options, lineage: 'skeleton_knight' });
}

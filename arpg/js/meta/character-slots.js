import { SAVE_KEY } from './save.js';

// Storage destinations only, not selectable/playable classes or a character schema.
export const SLOT_SAVE_KEYS = Object.freeze({
  human: SAVE_KEY,
  skeleton_mage: 'arpg.save.v1.slots.skeleton_mage',
  skeleton_knight: 'arpg.save.v1.slots.skeleton_knight',
  skeleton_archer: 'arpg.save.v1.slots.skeleton_archer',
});

// Unused foundation: new SaveStore(createSlotStorage(storage, slot), now).
// Construction does no IO. No active slot, fallback, schema changes or new reset API.
export function createSlotStorage(storage, slot) {
  if (typeof slot !== 'string' || !Object.hasOwn(SLOT_SAVE_KEYS, slot)) {
    throw new Error('Unknown character slot');
  }
  const destination = SLOT_SAVE_KEYS[slot];
  const corruptPrefix = `${SAVE_KEY}.corrupt.`;
  const mapKey = key => {
    if (key === SAVE_KEY) return destination;
    // SaveStore.load writes this exact diagnostic before removing corrupt data.
    // Do not proxy arbitrary arpg/settings keys, invented backups or other slots.
    if (typeof key === 'string' && key.startsWith(corruptPrefix)) {
      const timestamp = key.slice(corruptPrefix.length);
      if (/^(0|[1-9][0-9]*)$/.test(timestamp) && Number.isSafeInteger(Number(timestamp))) {
        return `${destination}.corrupt.${timestamp}`;
      }
    }
    throw new Error('Unsupported save storage key');
  };
  // Only the subset actually used by SaveStore, with the native receiver intact.
  // Let storage errors propagate: never retry against human or another namespace.
  return Object.freeze({
    getItem(key) { return storage.getItem(mapKey(key)); },
    setItem(key, value) { storage.setItem(mapKey(key), value); },
    removeItem(key) { storage.removeItem(mapKey(key)); },
    // Backups of this slot only, named in SaveStore's own key form.
    keys() {
      const mine = `${destination}.corrupt.`, out = [];
      for (let i = 0; i < (storage.length ?? 0); i++) {
        const key = storage.key(i);
        if (typeof key === 'string' && key.startsWith(mine)) {
          try { out.push(`${corruptPrefix}${key.slice(mine.length)}`); mapKey(out.at(-1)); } catch { out.pop(); }
        }
      }
      return out;
    },
  });
}

import { SaveStore } from './save.js';
import { createSlotStorage, SLOT_SAVE_KEYS } from './character-slots.js';
import { knightEquipmentAllowed } from './knight-equipment.js';
import { ITEMS } from './items.js';
import { readKnight, createKnight } from './initial-characters.js';

// Selection is synchronous. Each round captures an owner, never a mutable global store.
export class CharacterStores {
  constructor(storage) {
    this.storage = storage;
    this.human = new SaveStore(createSlotStorage(storage, 'human'));
    this.knight = new SaveStore(createSlotStorage(storage, 'skeleton_knight'));
    this.active = null;
  }
  select(slot, save) {
    this.active = { slot, store: slot === 'human' ? this.human : this.knight,
      raw: this.storage.getItem(SLOT_SAVE_KEYS[slot]) };
    this.equipmentNotice=null;
    try { const before=JSON.parse(this.active.raw);
      if(before?.equipped?.offhand && save && !save.equipped.offhand && ITEMS[save.items.find(i=>i.uid===save.equipped.weapon)?.id]?.handedness===2)
        this.equipmentNotice='양손무기 분류 적용: 방패는 해제되어 가방에 보관됩니다. 캐릭터와 장비는 모두 유지됩니다.';
    } catch { /* Save readers own validation. */ }
    return save;
  }
  selectHuman() { return this.select('human', this.human.load()); }
  selectKnight() {
    const save = readKnight(this.storage); // Reject corrupt/foreign slots, without quarantine/fallback.
    this.select('skeleton_knight', save);
    // Retain inventory and every already-unlocked armor slot on reload.
    if (save) {
      let changed = false;
      for (const slot of ['head', 'body', 'hands', 'feet']) {
        const item = save.items.find(item => item.uid === save.equipped[slot]);
        if (item && !knightEquipmentAllowed(save, ITEMS[item.id])) { save.equipped[slot] = null; changed = true; }
      }
      if (changed) this.persist(save);
    }
    return save;
  }
  createKnight(options) {
    if (this.active?.slot !== 'skeleton_knight') throw new Error('캐릭터 선택이 변경되었습니다.');
    const save = createKnight(this.storage, options);
    return this.select('skeleton_knight', save);
  }
  assertOwner(owner = this.active) {
    if (!owner || owner !== this.active || this.storage.getItem(SLOT_SAVE_KEYS[owner.slot]) !== owner.raw) {
      throw new Error('저장 슬롯이 변경되었습니다. 캐릭터를 다시 선택하세요.');
    }
  }
  persist(save, owner = this.active) {
    if ((save.lineage || 'human') !== owner?.slot) throw new Error('선택한 캐릭터와 저장 계보가 다릅니다.');
    this.assertOwner(owner);
    owner.store.save(save);
    owner.raw = this.storage.getItem(SLOT_SAVE_KEYS[owner.slot]);
  }
  reset() {
    this.assertOwner();
    this.active.store.reset(); this.active.raw = null;
  }
}

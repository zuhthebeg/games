import { SaveStore } from './save.js';
import { createSlotStorage, SLOT_SAVE_KEYS } from './character-slots.js';
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
    return save;
  }
  selectHuman() { return this.select('human', this.human.load()); }
  selectKnight() {
    const save = readKnight(this.storage); // Reject corrupt/foreign slots, without quarantine/fallback.
    this.select('skeleton_knight', save);
    // Previously created trial profiles included a tunic. Keep it in inventory,
    // but do not grant an unapproved armor unlock on entering the normal campaign.
    if (save && ['head', 'body', 'hands', 'feet'].some(slot => save.equipped[slot] !== null)) {
      for (const slot of ['head', 'body', 'hands', 'feet']) save.equipped[slot] = null;
      this.persist(save);
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

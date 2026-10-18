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
      if(before?.equipped?.offhand && save && !save.equipped.offhand && ITEMS[save.items.find(i=>i.uid===save.equipped.weapon)?.id]?.handedness===2) {
        this.equipmentNotice='양손무기 분류 적용: 방패는 해제되어 가방에 보관됩니다. 캐릭터와 장비는 모두 유지됩니다.';
        if(['potion','mana_potion','return_scroll'].some(id=>(before.stacks?.[id]||0)>(save.stacks[id]||0)))
          this.equipmentNotice+=' 초과 보급품은 창고에 보관했습니다.';
      }
    } catch { /* Save readers own validation. */ }
    return save;
  }
  selectHuman() { return this.select('human', this.human.load()); }
  selectKnight({ persistRepairs = true } = {}) {
    const save = readKnight(this.storage); // Reject corrupt/foreign slots, without quarantine/fallback.
    const previous = this.active, previousNotice = this.equipmentNotice;
    this.select('skeleton_knight', save);
    try {
      // Retain inventory and every already-unlocked armor slot on reload.
      if (save) {
        for (const slot of ['head', 'body', 'hands', 'feet']) {
          const item = save.items.find(item => item.uid === save.equipped[slot]);
          if (item && !knightEquipmentAllowed(save, ITEMS[item.id])) save.equipped[slot] = null;
        }
        if (persistRepairs && JSON.stringify(JSON.parse(this.active.raw)) !== JSON.stringify(save)) {
          this.assertOwner();
          // Back up the exact occupied bytes BEFORE a validated compatibility repair.
          const prefix = `${SLOT_SAVE_KEYS.skeleton_knight}.recovery.${Date.now()}`;
          let backup = prefix, suffix = 0;
          while (this.storage.getItem(backup) !== null) backup = `${prefix}.${++suffix}`;
          this.storage.setItem(backup, this.active.raw);
          this.persist(save);
          const retired = save.retiredScrolls?.filter(entry => entry.source === 'stacks').reduce((sum, entry) => sum + BigInt(entry.count), 0n);
          this.equipmentNotice = [this.equipmentNotice,
            retired !== undefined ? `폐지된 주문서 ${retired}개와 전투 기록은 사용·교환하지 않고 보관 기록에 남겼습니다.` : '',
            '이전 해골 저장 호환 복구 완료 · 원본은 별도 백업에 보존했습니다. 이름·진행·소유 장비는 유지됩니다.'].filter(Boolean).join(' ');
        }
      }
    } catch (error) {
      this.active = previous; this.equipmentNotice = previousNotice;
      throw error;
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

import { ITEMS, equippedItem, permitsShield } from '../meta/items.js';
import { playerForm } from '../content/player-lineages.js';
// The only appearance authority: actual equipped UIDs resolved against this save.
// Unlock level, inventory contents and rarity never stand in for equipped parts.
export function skeletonAppearance(save) {
  const evolved = playerForm(save) === 'death_knight';
  const slots = Object.fromEntries(['weapon','hands','feet','body','head','offhand'].map(slot => {
    const item = Array.isArray(save.items) && save.equipped ? equippedItem(save, slot) : null;
    return [slot, item ? { uid:item.uid, id:item.id } : null];
  }));
  const weapon = ITEMS[slots.weapon?.id], offhand=ITEMS[slots.offhand?.id];
  const form=weapon?.family==='bow'?'bow':weapon?.family==='focus'?(weapon.form==='wand'?'wand':'staff'):weapon?.form==='blunt'?'blunt':'sword';
  const shield=permitsShield(weapon)&&offhand?.form==='shield' ? offhand.shieldType || offhand.baseId || offhand.id : null;
  const layers = evolved ? [] : ['base', ...['hands','feet','body','head'].filter(s => slots[s]),
    ...(weapon ? [form] : []),...(shield ? [shield] : [])];
  const id = evolved ? 'player-death-knight' : 'player-skeleton-equipment';
  return { id, kit:'skeleton', form:evolved ? 'death_knight' : 'skeleton_knight', slots, layers,
    key:JSON.stringify([id,layers,slots]), enhance:(Array.isArray(save.items) && save.equipped ? equippedItem(save,'weapon')?.enhance : 0) || 0 };
}

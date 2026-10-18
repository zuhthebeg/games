// Opt-in boundary. Local profiles remain client saves, not server-authenticated accounts.
import {validateSave} from '../meta/save.js';
import {buildRoundMods, unlockedThreat} from '../meta/run.js';
import {ITEMS, equippedItem, carriedWeight, capacity} from '../meta/items.js';
import {availableStages} from '../content/world-map.js';
import {STAGES} from '../content/combat.js';
export function validParty(config, profiles) {
  if (!config || !STAGES[config.stageId] || !Number.isInteger(config.threat) || config.threat < 1 || config.threat > 3
    || config.invasion !== undefined && typeof config.invasion !== 'boolean') return false;
  const list = Object.values(profiles);
  if (!config.invasion) return list.every(p => p && (!p.lineage || p.lineage === 'human') && (!p.role || p.role === 'hunter') && !p.invasionConsent);
  return list.every(p => {
    const save=p?.rewardSave;
    return typeof save?.activeInvasion === 'string' && p?.invasionConsent === true && !Object.hasOwn(p,'team') && validateSave(save)
      && (save.lineage || 'human') === p.lineage
      && (p.lineage === 'human' ? p.role === 'hunter' : p.lineage === 'skeleton_knight' && p.role === 'invader')
      && ITEMS[equippedItem(save,'weapon')?.id]?.family === p.weapon
      && availableStages(save).includes(config.stageId) && unlockedThreat(save,config.stageId) >= config.threat;
  }) && list.some(p=>p.role==='hunter') && list.some(p=>p.role==='invader');
}
export function invasionProfile(profile) {
  const save=structuredClone(profile.rewardSave);
  return {...profile, rewardSave:save, level:save.level, name:save.name,
    mods:buildRoundMods(save),load:carriedWeight(save)/capacity(save)};
}

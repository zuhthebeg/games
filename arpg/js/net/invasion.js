// Character-derived party roles. Local profiles remain client saves, not server-authenticated accounts.
import {validateSave} from '../meta/save.js';
import {buildRoundMods, unlockedThreat} from '../meta/run.js';
import {ITEMS, equippedItem, carriedWeight, capacity} from '../meta/items.js';
import {availableStages} from '../content/world-map.js';
import {STAGES} from '../content/combat.js';
export const validBoneParts = parts => Array.isArray(parts) && parts.length === 5
  && ['weapon','head','body','hands','feet'].every(slot => parts.filter(id=>ITEMS[id]?.boneSet && ITEMS[id].slot === slot).length === 1);
export function validParty(config, profiles) {
  if (config?.stageId === 'SANCTUARY') {
    if (config.invasion || config.threat !== 1
      || config.invasion !== undefined && typeof config.invasion !== 'boolean') return false;
    const list = Object.values(profiles || {});
    return list.length >= 2 && list.length <= 4 && list.every(p => p
      && p.lineage === 'human' && p.role === 'hunter' && !Object.hasOwn(p, 'team')
      && (!p.rewardSave || validLobbyProfile(p)));
  }
  if (!config || !STAGES[config.stageId] || !Number.isInteger(config.threat) || config.threat < 1 || config.threat > 3
    || config.invasion !== undefined && typeof config.invasion !== 'boolean') return false;
  const list = Object.values(profiles);
  if (list.length < 2 || list.length > 4) return false;
  if (!config.invasion) return list.every(p => p && (!p.rewardSave || validLobbyProfile(p) && availableStages(p.rewardSave).includes(config.stageId) && unlockedThreat(p.rewardSave, config.stageId) >= config.threat) && !Object.hasOwn(p, 'team') && (!p.lineage || p.lineage === 'human') && (!p.role || p.role === 'hunter') && (!p.mods?.boneRevival || validBoneParts(p.boneParts)));
  return list.every(p => {
    const save=p?.rewardSave;
    return typeof save?.activeInvasion === 'string' && !Object.hasOwn(p,'team') && validateSave(save)
      && (save.lineage || 'human') === p.lineage
      && (p.lineage === 'human' ? p.role === 'hunter' : p.lineage === 'skeleton_knight' && p.role === 'invader')
      && ITEMS[equippedItem(save,'weapon')?.id]?.family === p.weapon
      && availableStages(save).includes(config.stageId) && unlockedThreat(save,config.stageId) >= config.threat;
  }) && list.some(p=>p.role==='hunter') && list.some(p=>p.role==='invader');
}
export function invasionProfile(profile) {
  const save=structuredClone(profile.rewardSave);
  return {...profile, rewardSave:save, level:save.level, name:save.name,
    weapon:ITEMS[equippedItem(save,'weapon')?.id]?.family || 'blade',mods:buildRoundMods(save),load:carriedWeight(save)/capacity(save)};
}

// Only a validated local character save supplies lineage; team is never guest authority.
export function validLobbyProfile(p) {
  const save = p?.rewardSave;
  return !!save && !Object.hasOwn(p || {}, 'team') && validateSave(save)
    && (save.lineage || 'human') === p.lineage
    && (p.lineage === 'human' ? p.role === 'hunter' : p.lineage === 'skeleton_knight' && p.role === 'invader');
}
export function partyConfig(config, profiles) {
  return { ...config, invasion: Object.values(profiles).some(p => p.lineage === 'skeleton_knight') };
}

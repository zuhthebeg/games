import { fixtureSave } from './multi-round.js';
import { statBudget, allocateStats } from '../../js/meta/stats.js';
import { validateSave } from '../../js/meta/save.js';
// Valid late-game save; ordinary T3 epic +5 gear from the existing fixture, not host writes.
export function throneLateSave(name, weapon='blade') {
  let s=fixtureSave(name, weapon);
  s.level=22;s.statPoints+=statBudget(22)-statBudget(12);
  s=allocateStats(s,{str:30,agi:24,wis:18,con:8});
  s.cleared.S20=true;s.stageThreat.S20=1;
  s.stacks.potion=20;s.stacks.mana_potion=10;
  if(!validateSave(s))throw Error('invalid late throne fixture');
  return s;
}

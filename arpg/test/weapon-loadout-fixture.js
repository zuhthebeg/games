import {createSave} from '../js/meta/save.js';
import {BOOKS} from '../js/meta/skills.js';
import {statBudget,cap} from '../js/meta/stats.js';
// Valid pre-feature save: learned skills and raw counts are persisted then loaded by SaveStore.
export function trained(){
 const s=createSave({name:'Loadout',weapon:'blade',answers:[0,0,0,0,0],createdAt:1});
 s.gold=10000;s.learned=Object.keys(BOOKS);s.loadout=['lunge',null,'whirl'];
 s.skillMastery={lunge:1500,ground_slam:932,whirl:501};
 for(const [uid,id] of [['sword','training_sword'],['blunt','chief_maul'],['bow','short_bow'],['wand','apprentice_wand'],['staff','altar_staff']])s.items.push({uid,id,enhance:0,affixes:[],rolledAt:0});
 s.level=30;s.statPoints=statBudget(s.level)-Object.values(s.stats).reduce((n,v)=>n+v-10,0);
 const add=Math.min(60-s.stats.str,s.statPoints,cap(s.level)-s.stats.str);s.stats.str+=add;s.statPoints-=add;
 return s;
}

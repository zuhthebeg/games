// Calibration trace: real 30Hz host casts, no enemies/consumables, requests only when the previous act ends and its cooldown is ready.
// High WIS rows at early levels are effective-stat stress cases, not allocation unlocks.
import assert from 'node:assert/strict';
import {createSave} from '../js/meta/save.js';
import {deriveMods, effectiveStats, eff, statBudget, cap} from '../js/meta/stats.js';
import {buildRoundMods} from '../js/meta/run.js';
import {instance} from '../js/meta/items.js';
import {createWorld, addPlayer, step, emptyInput} from '../js/sim/world.js';
import {ABILITIES} from '../js/content/combat.js';
const round=n=>Number(n.toFixed(3));
function profile(level,wis,staff=false) {
 const s=createSave({name:'마나 실측',weapon:'blade',answers:[0,0,0,0,0],createdAt:1});
 s.level=level;for(const k of Object.keys(s.stats))s.stats[k]=10;s.stats.wis=wis;
 s.statPoints=statBudget(level)-(wis-10);
 if(staff) {s.items.push(instance('wand','apprentice_wand'));s.equipped.weapon='wand';}
 return s;
}
function cadence(save,id) {
 const mods=buildRoundMods(save),w=createWorld({seed:7}),p=addPlayer(w,{pid:'p',weapon:deriveMods(save).family,mods:{...mods,skills:[id]}});
 let casts=0,regenerated=0,firstManaBlocked=null,min=p.mp;
 for(let i=0;i<1800;i++) {
  const ready=!p.act&&(p.cds[id]||0)<=1,available=Math.min(p.maxMp,p.mp+p.mpRegen/30);
  regenerated+=available-p.mp;
  const accepted=step(w,{p:{...emptyInput(),skillEdge:ready}}).filter(e=>e.type==='act'&&e.ability===id).length;
  casts+=accepted;min=Math.min(min,p.mp);
  if(firstManaBlocked===null&&ready&&available<ABILITIES[id].manaCost&&!accepted)firstManaBlocked=round((i+1)/30);
 }
 const spent=casts*ABILITIES[id].manaCost;
 assert.ok(Math.abs(p.mp-(p.maxMp+regenerated-spent))<1e-6);
 return {spell:id,casts,spent,regenerated:round(regenerated),remaining:round(p.mp),minimum:round(min),firstManaBlocked};
}
const matrix=[];
for(const level of [1,10,20,30])for(const wis of [10,30,60,100]) {
 const s=profile(level,wis),m=deriveMods(s);
 matrix.push({level,wis,maxMp:round(m.maxMp),regen:round(m.mpRegen),allocatable:wis<=cap(level)&&s.statPoints>=0,
  oldPoolSameInt:round(100+8*eff(wis)),oldRegen:round(5*(.2+.8*wis/100)),cadence:cadence(s,'ember_bolt')});
}
const staff=[];
for(const level of [1,30]) {
 const s=profile(level,10),plain=deriveMods(s),withStaff=profile(level,10,true),m=deriveMods(withStaff);
 staff.push({level,effective:effectiveStats(withStaff),before:{mp:round(plain.maxMp),regen:round(plain.mpRegen)},after:{mp:round(m.maxMp),regen:round(m.mpRegen)},
  cadence:['ember_bolt','flame_ring','healing_light'].map(id=>cadence(withStaff,id))});
}
console.log(JSON.stringify({matrix,staff},null,2));

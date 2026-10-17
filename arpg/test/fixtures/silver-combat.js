import {createWorld,addPlayer,spawnMonster,step,emptyInput} from '../../js/sim/world.js';
import {ITEMS,instance} from '../../js/meta/items.js';
import {createSave} from '../../js/meta/save.js';
import {deriveMods} from '../../js/meta/stats.js';
import {trained} from './trained.js';
export function combatRun(id,ability,target='ghoul',seed=9,{boss=false,counter=false}={}){
 const def=ITEMS[id];let save=trained(createSave({name:'피해 검증',weapon:def.family,answers:[0,0,0,0,0],createdAt:1}),30);save.stats.str=100;save.statPoints-=55;
 const it=instance('test-weapon',id,0,[]);save.items.push(it);save.equipped.weapon=it.uid;
 const mods={...deriveMods(save),skills:[ability],maxMp:10000,mpRegen:0,critChance:0,hpRegen:0};
 const w=createWorld({seed});const p=addPlayer(w,{pid:'p',weapon:def.family,x:500,y:400,mods});p.hp=1;
 const t=spawnMonster(w,target,570,400,{hpMult:1000});t.spawnLeft=0;t.thinkLeft=100000;t.frozenUntil=100000;if(boss)t.boss=true;
 const events=[];for(let tick=0;tick<150;tick++)events.push(...step(w,tick===0?{p:{...emptyInput(),aimX:1,[ability==='basic'?'attack':'skillEdge']:true}}:{}));
 return{events:events.filter(e=>['hit','heal','turnUndead','kill'].includes(e.type)),rng:w.rng,p,t,w,mods};
}
export const ORDINARY_CASES=[['revenant_blade','basic'],['revenant_blade','lunge'],['revenant_blade','heavy_cleave'],['revenant_blade','whirl'],['ossuary_maul','basic'],['ossuary_maul','ground_slam'],['ossuary_maul','armor_break'],['bone_bow','basic'],['bone_bow','triple_arrow'],['bone_bow','evasion_shot'],['bone_bow','volley'],['bone_bow','pierce_shot'],['bone_bow','blast_arrow'],['soulfire_wand','basic'],['soulfire_wand','ember_bolt'],['gravekeeper_staff','basic'],['gravekeeper_staff','frost_lance'],['gravekeeper_staff','healing_light'],['gravekeeper_staff','turn_undead'],['gravekeeper_staff','flame_ring']];
export function historicalDamage(){const out=[];for(const [id,a]of ORDINARY_CASES)for(const target of ['ghoul','goblin_grunt'])for(let seed=1;seed<=20;seed++){const r=combatRun(id,a,target,seed);out.push({id,a,target,seed,events:r.events,rng:r.rng,hp:r.t.hp,playerHp:r.p.hp});}return out;}

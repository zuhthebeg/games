import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {BOSS_TUNING,isBossType} from '../js/content/boss-tuning.js';
import {createWorld,spawnMonster,addPlayer,step} from '../js/sim/world.js';import {MONSTERS} from '../js/content/combat.js';import {rollDrops,ITEMS} from '../js/meta/items.js';
const before=JSON.parse(readFileSync(new URL('./fixtures/boss-before-20261020.json',import.meta.url),'utf8')),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
test('exactly authored bosses and large guardians get one current-size 0.7 multiplier and stronger kit',()=>{
 assert.deepEqual(Object.keys(BOSS_TUNING).sort(),['gargoyle','goblin_chief','necropolis_lord','rune_guardian','throne_dragon']);
 for(const b of before.bosses){const world=createWorld({seed:30743}),m=spawnMonster(world,b.id,500,400,{stageId:b.id==='throne_dragon'?'TD1':'S15'}),t=BOSS_TUNING[b.id];assert.ok(isBossType(b.id));assert.ok(Math.abs(m.r-b.r*.7)<1e-10,b.id);assert.equal(m.hp,Math.round(b.hp*1.6),b.id);assert.equal(m.poise,b.poise*1.3);assert.equal(m.dmgMult,b.dmgMult*1.3);assert.equal(m.speedMult,1.15);assert.equal(m.cdMult,.8);assert.equal(m.thinkMult,.8);assert.equal(m.sizeScale,b.sizeScale);assert.equal(t.size,.7);}
 for(const id of ['scarecrow','training_dragon','wolf','skeleton_warrior'])assert.equal(isBossType(id),false);
});
const shieldLoot=JSON.parse(readFileSync(new URL('./fixtures/new-shields-loot-hashes.json',import.meta.url),'utf8')).normal;
test('every nonboss normal/elite seeded loot stream and 300-tick world stays byte identical',()=>{
 for(const [id,old] of Object.entries(before.normal)){const rows=[];for(let seed=1;seed<=50;seed++)for(const elite of [false,true])for(const threat of [1,2,3])rows.push((MONSTERS[id].invulnerable||id.startsWith('undead_lab_'))?null:rollDrops(id,seed,{elite,threat,huntTier:2}));assert.equal(hash(rows),shieldLoot[id],id+' loot');const w=createWorld({seed:1});addPlayer(w,{pid:'p',x:400,y:400});spawnMonster(w,id,550,400,{stageId:'S15'});for(let i=0;i<300;i++)step(w,{p:{}});assert.equal(hash(w),old.world,id+' world');}
});
test('all boss equipment is rare or epic for every tier/threat and legacy exclusive side-roll',()=>{
 for(const id of Object.keys(BOSS_TUNING))for(const huntTier of [1,2,3,4])for(const threat of [1,2,3])for(let seed=1;seed<=300;seed++){const loot=rollDrops(id,seed,{huntTier,threat});assert.ok(loot.items.length>=1,id);for(const item of loot.items)assert.ok(['rare','epic'].includes(ITEMS[item.id].rarity),id+'/'+item.id);}
});
test('smaller bosses still exchange natural melee hits without a range dead zone',()=>{
 for(const type of Object.keys(BOSS_TUNING)){const w=createWorld({seed:3,arena:{w:1680,h:1000}}),p=addPlayer(w,{pid:'p',x:600,y:500,mods:{maxHp:100000,dmgMult:{blade:.01,bow:.01,focus:.01}}}),m=spawnMonster(w,type,800,500);let ours=0,theirs=0;
 for(let i=0;i<1800;i++){const dx=m.x-p.x,dy=m.y-p.y,d=Math.hypot(dx,dy)||1;const events=step(w,{p:{mx:d>55?dx/d:0,my:d>55?dy/d:0,ax:dx/d,ay:dy/d,attack:true}});ours+=events.filter(e=>e.type==='hit'&&e.dst===m.id).length;theirs+=events.filter(e=>e.type==='hit'&&e.dst===p.id).length;}
 assert.ok(ours>0,type+' receives melee');assert.ok(theirs>0,type+' reaches player');
 }
});
test('sparse rare slot pools fall back to existing rare gear rather than throwing or lowering grade',async()=>{
 const {SLOT_BIASES}=await import('../js/meta/economy.js'),oldBias=SLOT_BIASES.throne_dragon,removed=Object.entries(ITEMS).filter(([,d])=>d.slot==='offhand'&&['rare','epic'].includes(d.rarity));
 try{for(const [id]of removed)delete ITEMS[id];SLOT_BIASES.throne_dragon={offhand:Number.MAX_SAFE_INTEGER};for(let seed=1;seed<=100;seed++){const loot=rollDrops('throne_dragon',seed,{huntTier:3});assert.ok(loot.items.length);for(const i of loot.items)assert.ok(['rare','epic'].includes(ITEMS[i.id].rarity));}}
 finally{for(const [id,d]of removed)ITEMS[id]=d;if(oldBias)SLOT_BIASES.throne_dragon=oldBias;else delete SLOT_BIASES.throne_dragon;}
});

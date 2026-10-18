import test from 'node:test';
import assert from 'node:assert/strict';
import {createSave,validateSave,SaveStore,SAVE_KEY} from '../js/meta/save.js';
import {ITEMS,RECIPES,instance,capacity,equip} from '../js/meta/items.js';
import {deriveMods,equippedSets,setBonuses} from '../js/meta/stats.js';
import {buildRoundMods,currentLoad,createTracker} from '../js/meta/run.js';
import {trained} from './fixtures/trained.js';
import {createWorld,addPlayer,spawnMonster,startStage,step,emptyInput} from '../js/sim/world.js';
import {encodeSnapshot,decodeSnapshot} from '../js/net/protocol.js';
import {predictPlayerTick} from '../js/net/player-prediction.js';
const pairs=[['hunter','hunter_bow','leather_vest',{capacity:5,speed_pct:3}],['ossuary','ossuary_maul','ossuary_plate',{maxHp:16,ac:4}],['soulfire','soulfire_wand','shroud_robe',{mpRegen:.25}],['soulfire','gravekeeper_staff','shroud_robe',{mpRegen:.25}],['dragon','dragonfang_blade','dragon_scale_armor',{maxHp:20,atk_pct:5}]];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const fresh=()=>trained(createSave({name:'New sets',answers:[0,0,0,0,0],createdAt:1}),30);
function fixture(weapon,body){const s=fresh();s.stats.str=100;s.statPoints-=55;for(const [uid,id]of [['set-weapon',weapon],['set-body',body]])s.items.push(instance(uid,id,1,[]));s.equipped.weapon='set-weapon';return s;}
for(const [id,weapon,body,bonus]of pairs)test(`${id}/${weapon}: actual equip, remove, wrong slots, crosssets, and old saves`,()=>{
 let s=fixture(weapon,body);assert.ok(validateSave(s));assert.equal(equippedSets(s).find(x=>x.id===id)?.count,1);assert.deepEqual(setBonuses(s),{});
 s=equip(s,'set-body');assert.ok(validateSave(s));assert.deepEqual(setBonuses(s),bonus);const raw=JSON.stringify(s),active=deriveMods(s);assert.equal(equippedSets(s).find(x=>x.id===id).count,2);
 const without=structuredClone(s);without.equipped.weapon=null;const savedId=ITEMS[body].setId;let base;try{delete ITEMS[body].setId;base=deriveMods(s);}finally{ITEMS[body].setId=savedId;}assert.deepEqual(setBonuses(without),{});
 near(active.maxHp,base.maxHp+(bonus.maxHp||0));near(active.ac,base.ac+(bonus.ac||0));near(active.mpRegen,base.mpRegen+(bonus.mpRegen||0));near(active.capacity,base.capacity+(bonus.capacity||0));near(active.speedMult,base.speedMult*(1+(bonus.speed_pct||0)/100));near(active.dmgMult[active.family],base.dmgMult[base.family]*(1+(bonus.atk_pct||0)/100));
 assert.equal(capacity(s),active.capacity);assert.equal(currentLoad(s,createTracker(1)).capacity,active.capacity);assert.deepEqual(deriveMods(s),active);assert.equal(JSON.stringify(s),raw);
 const memory=new Map([[SAVE_KEY,raw]]),store=new SaveStore({getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)});assert.deepEqual(deriveMods(store.load()),active);assert.equal(memory.get(SAVE_KEY),raw);
 const removed=structuredClone(s);removed.equipped.body=null;assert.deepEqual(setBonuses(removed),{});assert.equal(equippedSets(removed).find(x=>x.id===id).count,1);
 const wrong=structuredClone(s);wrong.equipped.head='set-weapon';wrong.equipped.body=null;assert.equal(equippedSets(wrong).find(x=>x.id===id).count,1);assert.deepEqual(setBonuses(wrong),{});
 const cross=structuredClone(s);cross.items.push(instance('cross','warden_plate',1,[]));cross.equipped.body='cross';assert.deepEqual(setBonuses(cross),{});
});
test('all four rarities inherit exact group identity, no duplicate alternate weapon or dragon recipe',()=>{for(const[id,w,b]of pairs)for(const base of [w,b])for(const rarity of ['common','fine','rare','epic']){const def=Object.values(ITEMS).find(d=>d.baseId===base&&d.rarity===rarity);assert.equal(def.setId,id);assert.ok(def.setName);if(id==='dragon'){assert.equal(def.dropOnly,'throne_dragon');assert.ok(!Object.keys(RECIPES).some(k=>ITEMS[k]?.baseId===base));}}const s=fixture('soulfire_wand','shroud_robe');s.items.push(instance('alternate','gravekeeper_staff',2,[]));assert.equal(equippedSets(s).find(x=>x.id==='soulfire').count,1);assert.deepEqual(setBonuses(s),{});});
test('real world consumes movement, HP/AC, regeneration and attack; snapshots/prediction preserve them',()=>{
 for(const[id,weapon,body]of pairs){const s=equip(fixture(weapon,body),'set-body'),mods=buildRoundMods(s),w=createWorld({seed:9}),p=addPlayer(w,{pid:'p',weapon:mods.family,x:500,y:400,mods});near(p.maxHp,mods.maxHp);near(p.ac,mods.ac);near(p.mpRegen,mods.mpRegen);assert.deepEqual(p.dmgMult,mods.dmgMult);p.mp=0;startStage(w,'S2');w.entities=w.entities.filter(e=>e.kind==='player');w.round.pending=[];w.round.goal='timer';w.round.timerTicks=1e6;
 const snap=decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(w,{p:0}))),'p'),guest=snap.entities.find(e=>e.pid==='p');for(const key of ['maxHp','mpRegen','speed'])near(guest[key],p[key]);
 const input={...emptyInput(),mx:1};const predicted=predictPlayerTick(guest,input,{arena:w.arena});step(w,{p:input});near(p.x,predicted.x);near(p.mp,predicted.mp);near(p.mp,mods.mpRegen/30);assert.ok(p.x>500);
 if(id==='dragon'){const t=spawnMonster(w,'ghoul',p.x+55,400,{hpMult:1000});t.spawnLeft=0;t.thinkLeft=100000;t.frozenUntil=100000;const events=[];for(let i=0;i<35;i++){t.x=p.x+55;t.kx=t.ky=0;events.push(...step(w,i===0?{p:{...emptyInput(),aimX:1,attack:true}}:{}));}assert.ok(events.some(e=>e.type==='hit'&&e.src===p.id&&e.dst===t.id));}
 }
});

test('dragon weapon bonus actually raises host hits and soul MP regen accumulates over 60 seconds',()=>{
 const hit=(save)=>{const mods=buildRoundMods(save),w=createWorld({seed:9}),p=addPlayer(w,{pid:'p',weapon:mods.family,x:500,y:400,mods}),t=spawnMonster(w,'ghoul',555,400,{hpMult:1000});t.spawnLeft=0;t.thinkLeft=t.frozenUntil=100000;let damage,events=[];for(let i=0;i<35;i++){t.x=555;t.kx=t.ky=0;events.push(...step(w,i===0?{p:{...emptyInput(),aimX:1,attack:true}}:{}));if(p.act)damage=p.act.def.damage;}const event=events.find(e=>e.type==='hit'&&e.dst===t.id);assert.ok(event);assert.equal(event.dmg,Math.round(damage*mods.dmgMult.blade));return event.dmg;};
 const base=fixture('dragonfang_blade','dragon_scale_armor');assert.ok(hit(equip(base,'set-body'))>hit(base));
 for(const weapon of ['soulfire_wand','gravekeeper_staff']){const seed=fixture(weapon,'shroud_robe'),active=equip(seed,'set-body'),rates=[];for(const save of [seed,active]){const w=createWorld(),mods=buildRoundMods(save),p=addPlayer(w,{pid:'p',weapon:mods.family,mods});p.mp=0;for(let i=0;i<1800;i++)step(w,{p:emptyInput()});near(p.mp,Math.min(p.maxMp,60*mods.mpRegen));rates.push(p.mp);}near(rates[1]-rates[0],15);}
});
test('all rarity pairs activate once and set resources combine with existing affixes once',()=>{
 for(const[id,weapon,body,bonus]of pairs)for(const rarity of ['common','fine','rare','epic']){const variant=base=>Object.entries(ITEMS).find(([,d])=>d.baseId===base&&d.rarity===rarity)[0],s=equip(fixture(variant(weapon),variant(body)),'set-body');assert.deepEqual(setBonuses(s),bonus);assert.ok(validateSave(s));}
 for(const[weapon,body,key,value,field,expected]of [['dragonfang_blade','dragon_scale_armor','atk_pct',10,'dmgMult',1.15/1.1],['hunter_bow','leather_vest','speed_pct',10,'speedMult',1.03],['soulfire_wand','shroud_robe','mana_pct',25,'mpRegen',.25]]){const seed=fixture(weapon,body);seed.items.find(i=>i.uid==='set-weapon').affixes=[{k:key,v:value}];const active=equip(seed,'set-body'),a=deriveMods(active),b=deriveMods(seed);if(field==='mpRegen')near(a[field]-b[field],expected);else if(field==='dmgMult')near(a[field].blade/b[field].blade,expected);else near(a[field]/b[field],expected);}
});

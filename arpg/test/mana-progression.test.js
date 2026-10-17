import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, SaveStore, SAVE_KEY, validateSave } from '../js/meta/save.js';
import { deriveMods, eff, statBudget } from '../js/meta/stats.js';
import { buildRoundMods } from '../js/meta/run.js';
import { instance, equip } from '../js/meta/items.js';
import { createWorld, addPlayer, step, emptyInput } from '../js/sim/world.js';
import { predictPlayerTick } from '../js/net/player-prediction.js';
import { ABILITIES, PLAYER_BASE } from '../js/content/combat.js';
import { applyAutoUse, DEFAULT_AUTO_USE } from '../js/meta/auto-use.js';
import { HubUI } from '../js/ui/hub.js';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
const saveAt = (level=1,wis=10,int=10) => {
 const s=createSave({name:'마나',weapon:'blade',answers:[0,0,0,0,0],createdAt:1});
 s.level=level;s.stats.wis=wis;s.stats.int=int;
 s.statPoints=statBudget(level)-Object.values(s.stats).reduce((n,v)=>n+v-10,0);return s;
};

test('hunting mana is level baseline + effective WIS, not INT; lower than old equal-investment resources',()=>{
 for(const level of [1,10,20,30]) for(const wis of [10,30,60,100]) {
  const s=saveAt(level,wis),before=structuredClone(s),m=buildRoundMods(s);
  near(m.maxMp,40+2*(level-1)+.8*(wis-10));near(m.mpRegen,.15+.01*(level-1)+.02*(wis-10));
  if(level<30) {const next=deriveMods(saveAt(level+1,wis));assert.ok(next.maxMp>m.maxMp);assert.ok(next.mpRegen>m.mpRegen);}
  if(wis<100) {const next=deriveMods(saveAt(level,wis+1));assert.ok(next.maxMp>m.maxMp);assert.ok(next.mpRegen>m.mpRegen);}
  assert.ok(m.maxMp < 100+8*eff(wis));assert.ok(m.mpRegen < 5*(.2+.8*wis/100));
  s.stats.int=100;const highInt=deriveMods(s);near(highInt.maxMp,m.maxMp);near(highInt.mpRegen,m.mpRegen);
  assert.ok(highInt.dmgMult.focus>m.dmgMult.focus);s.stats.int=before.stats.int;assert.deepEqual(s,before);
 }
 // Gear beyond the allocation cap remains useful; a below-base WIS never penalizes the baseline.
 near(deriveMods(saveAt(30,106)).maxMp-deriveMods(saveAt(30,100)).maxMp,4.8);
 near(deriveMods(saveAt(1,0)).mpRegen,.15);near(deriveMods(saveAt(1,0)).maxMp,40);
});

test('staff innate WIS +6 grants +4.8 MP and +0.12 MP/s once, affix regeneration once; raw save is untouched',()=>{
 let s=saveAt();s.items.push(instance('wand','apprentice_wand'));const raw=structuredClone(s.stats),plain=deriveMods(s);
 for(let i=0;i<3;i++) {
  s=equip(s,'wand');const staff=deriveMods(s);near(staff.maxMp,plain.maxMp+4.8);near(staff.mpRegen,plain.mpRegen+.12);
  assert.equal(staff.effectiveInt,plain.effectiveInt+6);assert.ok(staff.dmgMult.focus>plain.dmgMult.focus);
  s=equip(s,'starter:weapon');near(deriveMods(s).maxMp,plain.maxMp);near(deriveMods(s).mpRegen,plain.mpRegen);
 }
 s=equip(s,'wand');s.items.find(i=>i.uid==='wand').affixes=[{k:'wis_flat',v:4},{k:'int_flat',v:8},{k:'mana_pct',v:25}];
 near(deriveMods(s).maxMp,plain.maxMp+8);near(deriveMods(s).mpRegen,(plain.mpRegen+.2)*1.25);assert.deepEqual(s.stats,raw);
});

test('host and guest regenerate the derived hunting rate over 60 seconds and clamp at the same pool',()=>{
 for(const [level,wis] of [[1,10],[30,100]]) {
  const w=createWorld(),p=addPlayer(w,{pid:'p',mods:buildRoundMods(saveAt(level,wis))});let guest=structuredClone(p);p.mp=guest.mp=0;
  for(let i=0;i<1800;i++) {step(w,{p:emptyInput()});guest=predictPlayerTick(guest,emptyInput(),{arena:w.arena});}
  near(p.mp,Math.min(p.maxMp,60*p.mpRegen));near(guest.mp,p.mp);
  p.mp=guest.mp=p.maxMp-.05;for(let i=0;i<30;i++) {step(w,{p:emptyInput()});guest=predictPlayerTick(guest,emptyInput(),{arena:w.arena});}
  near(p.mp,p.maxMp);near(guest.mp,p.mp);
 }
});

test('real 60s on-cooldown fire casting exhausts low WIS and buys more casts with level/WIS, keeping MP costs/CDs',()=>{
 const run=(level,wis)=>{
  const w=createWorld(),p=addPlayer(w,{pid:'p',weapon:'focus',mods:{...buildRoundMods(saveAt(level,wis)),skills:['ember_bolt']}});
  let casts=0,firstDry=null,regen=0;
  for(let i=0;i<1800;i++) {
   regen+=Math.min(p.mpRegen/30,p.maxMp-p.mp);
   if(firstDry===null&&!p.act&&!p.cds.ember_bolt&&p.mp+p.mpRegen/30<ABILITIES.ember_bolt.manaCost) firstDry=i/30;
   casts+=step(w,{p:{...emptyInput(),skillEdge:!p.act&&(p.cds.ember_bolt||0)<=1}}).filter(e=>e.type==='act'&&e.ability==='ember_bolt').length;
  }
  near(p.mp,p.maxMp+regen-casts*ABILITIES.ember_bolt.manaCost);return {casts,firstDry,remaining:p.mp};
 };
 const low=run(1,10),wise=run(1,30),leveled=run(30,10),high=run(30,100);
 assert.equal(low.casts,3);assert.ok(low.firstDry<10);assert.ok(wise.casts>low.casts);assert.ok(leveled.casts>low.casts);assert.ok(high.casts>wise.casts);assert.equal(high.firstDry,null);
 assert.equal(ABILITIES.ember_bolt.manaCost,14);assert.equal(ABILITIES.ember_bolt.cooldownMs,2600);
});

test('existing 30-MP mana potions and strict automatic threshold still use the smaller derived pool',()=>{
 assert.equal(PLAYER_BASE.manaPotion,30);
 const w=createWorld(),p=addPlayer(w,{pid:'p',mods:{...buildRoundMods(saveAt()),mpRegen:0,manaPotions:2}});
 p.mp=20;assert.equal(!!applyAutoUse(emptyInput(),p,DEFAULT_AUTO_USE).manaEdge,false);
 p.mp=19;const input=applyAutoUse(emptyInput(),p,DEFAULT_AUTO_USE);assert.equal(input.manaEdge,true);step(w,{p:input});
 assert.equal(p.mp,40);assert.equal(p.manaPotions,1);assert.ok(p.potionCd>0);
 p.mp=0;step(w,{p:applyAutoUse(emptyInput(),p,DEFAULT_AUTO_USE)});assert.equal(p.mp,0);assert.equal(p.manaPotions,1);
});

test('loading an existing save recalculates mana without mutating stats, budget, equipment, learned skills or stored bytes',()=>{
 const s=saveAt(),storage=new Map([[SAVE_KEY,JSON.stringify(s)]]),raw=storage.get(SAVE_KEY);
 assert.ok(validateSave(s));const store=new SaveStore({getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)});
 const loaded=store.load();assert.deepEqual(loaded,s);near(buildRoundMods(loaded).maxMp,40);assert.equal(storage.get(SAVE_KEY),raw);
});

test('allocation UI distinguishes INT spellpower from WIS mana resources and previews their derived changes',()=>{
 const h=Object.assign(Object.create(HubUI.prototype),{save:saveAt(),receipt:null});
 h.show=html=>{h.html=html;};h.showAllocation(true);assert.match(h.html,/지능: 마법 위력/);assert.match(h.html,/지혜: 최대 MP · 마나 재생/);
 h.draft.wis=1;h.showAllocation(true,false);assert.match(h.html,/MP <b>40.8<\/b>/);assert.match(h.html,/MP\/s <b>0.17<\/b>/);
});

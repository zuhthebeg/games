import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ABILITIES, MONSTERS, canUseSkill, skillDamageShare} from '../js/content/combat.js';
import {createWorld, addPlayer, spawnMonster, startStage, step, emptyInput} from '../js/sim/world.js';
import {ticks, shapeHitsCircle} from '../js/sim/core.js';
import {encodeSnapshot, decodeSnapshot} from '../js/net/protocol.js';
import {predictPlayerTick} from '../js/net/player-prediction.js';
import {createSave, validateSave, SaveStore} from '../js/meta/save.js';
import {ITEMS, instance, craft, equip, strRequirement, rollDrops} from '../js/meta/items.js';
import {BOOKS, bookRequirement, learnSkill, setSlot, loadoutOf} from '../js/meta/skills.js';
import {buildRoundMods} from '../js/meta/run.js';
import {shopStock} from '../js/meta/shop.js';
import {loadoutHtml, skillCardHtml, weaponWarnHtml, skillUse} from '../js/ui/skill-view.js';
import {equipmentVisual} from '../js/render/paperdoll-state.js';
import {trained} from './fixtures/trained.js';
const input={...emptyInput(),skillEdge:true,aimX:1};
function scene(id='ground_slam',form='blunt',weapon='blade') {
  const w=createWorld();const p=addPlayer(w,{pid:'a',weapon,x:400,y:400,mods:{skills:[id,null,null],weaponForm:form,mpRegen:0,maxMp:200}});
  startStage(w,'S2');w.round.pending=[];w.round.goal='timer';w.round.timerTicks=1e6;
  return {w,p};
}
function target(w,x=470,y=400,type='scarecrow') {const m=spawnMonster(w,type,x,y);m.spawnLeft=0;m.thinkLeft=1e6;return m;}
function cast(w,p,id=p.skills[0]) {
  const slot=p.skills.indexOf(id); assert.ok(slot>=0);
  const events=[...step(w,{a:{...emptyInput(),[['skillEdge','skill2Edge','skill3Edge'][slot]]:true,aimX:1}})];
  assert.equal(p.act.id,id);
  while(p.act)events.push(...step(w));return events;
}
test('B1 form gate shares one K1 decision across sim/UI; legacy sword skills remain 100% on blunt',()=>{
  assert.equal(ITEMS.chief_maul.form,'blunt');
  for(const id of ['ground_slam','armor_break']) {
    assert.equal(skillDamageShare(id,'blade','blunt'),1);
    for(const weapon of ['blade','bow','focus'])for(const form of [undefined,'wand','staff','blunt']) {
      const ok=weapon==='blade'&&form==='blunt';assert.equal(canUseSkill(id,weapon,form),ok);
      const {w,p}=scene(id,form ?? null,weapon);assert.equal(p.skills[0],ok?id:{blade:'lunge',bow:'volley',focus:'ember_bolt'}[weapon]);
      // A forged/stale slot is rejected again at input time, not just during departure.
      p.skills[1]=id;step(w,{a:{...emptyInput(),skill2Edge:true}});assert.equal(p.act?.id??null,ok?id:null);
    }
  }
  for(const id of ['lunge','whirl','heavy_cleave'])assert.equal(skillUse(id,'blade','blunt'),1);
});
test('B1 exact timings, MP/CD and ground-slam front-offset circle / armor-break cone boundaries',()=>{
  assert.deepEqual(ABILITIES.ground_slam.shape,{type:'circle',radius:128,offset:40});
  for(const [id,expected]of Object.entries({ground_slam:[460,90,400,7000,24,64,110,120],armor_break:[300,70,300,8000,20,58,50,160]})) {
    const d=ABILITIES[id];assert.deepEqual([d.windupMs,d.activeMs,d.recoveryMs,d.cooldownMs,d.manaCost,d.damage,d.poise,d.knockback],expected);
    const {w,p}=scene(id);const events=cast(w,p);assert.equal(p.mp,200-d.manaCost);assert.equal(p.cds[id],ticks(d.cooldownMs));
    assert.equal(events.filter(e=>e.type==='act'&&e.ability===id).length,1);
  }
  const shape=ABILITIES.ground_slam.shape;
  for(const [x,y,hit]of [[568,400,true],[568.01,400,false],[312,400,true],[311.99,400,false],[440,528,true],[440,528.01,false]])
    assert.equal(shapeHitsCircle(shape,400,400,0,x,y,0),hit,`${x},${y}`);
  const cone=ABILITIES.armor_break.shape;assert.equal(shapeHitsCircle(cone,400,400,0,509,400,0),true);
  assert.equal(shapeHitsCircle(cone,400,400,0,511,400,0),false);assert.equal(shapeHitsCircle(cone,400,400,0,400,450,0),false);
  const {w,p}=scene();const inside=target(w,565,400),outside=target(w,591,400),rear=target(w,310,400);
  const hits=cast(w,p).filter(e=>e.type==='hit');assert.equal(hits.filter(e=>e.dst===inside.id).length,1);
  assert.equal(hits.some(e=>e.dst===outside.id),false);assert.equal(hits.filter(e=>e.dst===rear.id).length,1);
});
test('B1 blunt slash alone gains 1.4 poise; damage and reach unchanged, stacked with STR/counter separately',()=>{
  const run=(form,counter=false)=>{const{w,p}=scene('lunge',form ?? null);p.poiseMult=1.2;const m=target(w,470,400,'iron_boar');m.poise=m.maxPoise=1000;const events=[];
    if(counter)p.pendingCounter={attackerId:m.id,dodgeTick:0,expiresTick:1000};
    step(w,{a:{...emptyInput(),attack:!counter,aimX:1}});
    while(!events.some(e=>e.type==='hit'))events.push(...step(w));return {hit:events.find(e=>e.type==='hit'),poise:m.poise};};
  const sword=run(undefined),blunt=run('blunt');assert.equal(blunt.hit.dmg,sword.hit.dmg);
  assert.ok(Math.abs(sword.poise-blunt.poise-14*1.2*.4)<1e-9);assert.equal(ABILITIES.slash.shape.range,92);
  const swordCounter=run(null,true),bluntCounter=run('blunt',true);assert.equal(bluntCounter.hit.dmg,swordCounter.hit.dmg);assert.equal(bluntCounter.hit.counter,true);
  assert.ok(Math.abs(swordCounter.poise-bluntCounter.poise-14*1.2*.4*3)<1e-9);
});
test('B1 armor-break hit applies one host sunder slot, 5 seconds, refresh without stacks, snapshot and exact expiry',()=>{
  const{w,p}=scene('armor_break');const m=target(w);step(w,{a:input});let first;
  while(!first){const appliedTick=w.tick;first=step(w).find(e=>e.type==='hit');if(first)assert.equal(m.sunder.expiresTick-appliedTick,ticks(5000));}
  while(p.act)step(w);assert.equal(first.dmg,58);
  const expiry=m.sunder.expiresTick;assert.equal(Object.keys(m.sunder).length,1);
  const snap=decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(w))),'a');assert.deepEqual(snap.entities.find(e=>e.id===m.id).sunder,m.sunder);
  assert.equal(snap.entities[0].weaponForm,'blunt');
  p.cds.armor_break=0;const again=cast(w,p).find(e=>e.type==='hit');assert.equal(again.dmg,67);
  assert.ok(m.sunder.expiresTick>expiry);assert.equal(Object.keys(m.sunder).length,1);
  const refreshed=m.sunder.expiresTick;while(w.tick<refreshed)step(w);assert.ok(m.sunder);
  step(w);assert.equal(m.sunder,undefined);
  p.cds.armor_break=0;assert.equal(cast(w,p).find(e=>e.type==='hit').dmg,58);
});
test('B1 sunder multiplier affects every existing damage delivery/source after exposure and before rounding',()=>{
  for(const [id,weapon,distance] of [['whirl','blade',70],['arrow','bow',180],['ember_bolt','focus',180],['frost_lance','focus',180],['goblin_slash','blade',60]]) {
    const run=sunder=>{const{w,p}=scene(id==='goblin_slash'?'lunge':id,'blunt',weapon);const m=target(w,400+distance,400,'iron_boar');m.poise=m.maxPoise=10000;m.hp=m.maxHp=10000;
      if(sunder)m.sunder={expiresTick:1000};let events=[];
      if(id==='goblin_slash') {const source=target(w,400,400,'goblin_grunt');source.team=p.team;
        source.act={id,def:ABILITIES[id],phase:'active',left:1,elapsed:0,total:1,phaseTicks:{windup:1,lock:1,active:1,recovery:1},facing:0,ox:400,oy:400,hit:[]};events.push(...step(w));}
      else {events.push(...step(w,{a:{...emptyInput(),aimX:1,...(id==='arrow'?{attack:true}:{skillEdge:true})}}));for(let i=0;i<60&&!events.some(e=>e.type==='hit'&&e.dst===m.id);i++)events.push(...step(w));}
      return events.find(e=>e.type==='hit'&&e.dst===m.id)?.dmg;};
    const normal=run(false),broken=run(true);assert.ok(normal>0,id);assert.equal(broken,Math.round(normal*1.15),id);
  }
});
test('B1 prediction uses form gate, remains display-only, and does not create sunder/hit authority',()=>{
  const {w,p}=scene('armor_break');target(w);const view=decodeSnapshot(encodeSnapshot(w),'a');const before=JSON.stringify(view);
  const pred=predictPlayerTick(view.entities[0],input,{arena:w.arena,others:view.entities.slice(1)});
  assert.equal(pred.act.id,'armor_break');assert.equal(JSON.stringify(view),before);assert.equal(view.entities[1].sunder,undefined);
  const forged={...view.entities[0],weaponForm:undefined,skills:['armor_break',null,null]};
  assert.equal(predictPlayerTick(forged,input,{arena:w.arena}).act,null);
  step(w,{a:input});assert.equal(p.act.phase,pred.act.phase);assert.equal(p.act.left,pred.act.left);assert.equal(p.mp,pred.mp);
});
test('B1 exact book STR gates and prices; free loadout remembers blocked slots / save roundtrip',()=>{
  let s=trained({...createSave({name:'둔기',answers:[0,0,0,0,0],weapon:'blade',createdAt:1}),gold:10000},30);
  for(const [id,value,price] of [['ground_slam',30,180],['armor_break',45,250]]) {
    assert.deepEqual(BOOKS[id].req,{stat:'str',value});assert.equal(BOOKS[id].price,price);
    s.stats.str=value-1;assert.equal(bookRequirement(s,id).ok,false);assert.throws(()=>learnSkill(s,id),/능력치/);
    s.stats.str=value;const next=learnSkill(s,id);assert.equal(next.gold,s.gold-price);s=setSlot(next,'blade',id==='ground_slam'?0:1,id);
    assert.match(skillCardHtml(id,{...s,learned:[]}),new RegExp(`요구 힘 ${value}`));
    assert.match(skillCardHtml(id,s),/use-blocked[\s\S]+✕/);
  }
  assert.deepEqual(loadoutOf(s).slice(0,2),['ground_slam','armor_break']);assert.match(loadoutHtml(s),/blocked[\s\S]+✕/);
  assert.match(weaponWarnHtml('ground_slam',s),/둔기 100%/);
  s.stats.str=60;s.statPoints-=15;const item=instance('maul','chief_maul',1,[]);s.items.push(item);s=equip(s,item.uid);
  assert.doesNotMatch(loadoutHtml(s),/blocked/);assert.equal(buildRoundMods(s).weaponForm,'blunt');
  assert.ok(validateSave(s));const storage=new Map(),store=new SaveStore({getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)});
  store.save(s);assert.deepEqual(store.load(),s);
});
test('B1 craft-only T2/T3 mauls, strength formula, material consumption, maul art and stock exclusion',()=>{
  const s=trained(createSave({name:'제작',answers:[0,0,0,0,0],weapon:'blade',createdAt:1}),30);s.gold=10000;
  s.stacks={...s.stacks,rune_shard:100,scrap:100,fang:100,frost_shard:100};
  for(const [id,tier,power,weight]of [['rune_maul',2,1.35,15],['warden_maul',3,1.6,19]]) {
    const d=ITEMS[id];assert.equal(d.form,'blunt');assert.equal(d.family,'blade');assert.equal(d.craftOnly,true);
    assert.equal(d.huntTier,tier);assert.equal(d.power,power);assert.equal(d.weight,weight);assert.equal(d.requiredStr,strRequirement(d));
    // Existing cocy no-level-gates policy stays in force; tier 2/3 still maps to Lv5/10 hunting bands.
    assert.equal(d.requiredLevel,1);
    const made=craft(s,id);assert.equal(made.items.at(-1).id,id);assert.ok(made.items.at(-1).uid.startsWith('craft:'));
    made.equipped.weapon=made.items.at(-1).uid;assert.equal(equipmentVisual(made).weapon,'alternate');
    assert.ok(validateSave(made));
  }
  const stockHash=createHash('sha256');
  for(let seed=0;seed<500;seed++)for(let refresh=0;refresh<5;refresh++){const stock=shopStock(seed,refresh);assert.ok(stock.every(item=>!ITEMS[item.id].craftOnly));stockHash.update(JSON.stringify(stock)+'\n');}
  assert.equal(stockHash.digest('hex'),'2009394b4f8a018dfa096f0f1664cea945621404c6287e0603828e9cab474759');
});
test('B1 old drop outputs remain byte-identical over 19,800 monster/tier/threat/seed cases',()=>{
  const hash=createHash('sha256');let count=0;
  // U5 places U1/M2a; keep every main baseline case and its pinned digest.
  const u1=['skeleton_minion','skeleton_warrior','skeleton_rogue','skeleton_mage','ghoul','ghost','bat'];
  for(const id of u1){assert.ok(Object.hasOwn(MONSTERS,id));assert.ok(rollDrops(id,0,{huntTier:4}).stacks);}
  for(const monster of Object.keys(MONSTERS).filter(m=>m!=='training_dragon'&&!u1.includes(m)))for(const tier of [1,2,3])for(const threat of [1,2,3])for(let seed=0;seed<200;seed++) {
    const ctx={huntTier:tier,threat,elite:seed%2===0,rarelessRounds:seed%7,stageId:'S'+tier*5};
    const loot=rollDrops(monster,seed,ctx);if(monster==='throne_dragon'){delete loot.stacks.dragon_scale;loot.items=loot.items.filter(i=>!ITEMS[i.id].dropOnly);}assert.ok(loot.items.every(i=>!ITEMS[i.id].craftOnly));hash.update(JSON.stringify(loot)+'\n');count++;
  }
  assert.equal(count,19800);assert.equal(hash.digest('hex'),'595e5125719e728997b57f0625cf12ace806a740c8c2b40f850d56a039995626');
});

import {legacyPlacementStages,legacyPlacementLoot,withoutPlacement} from './m2b-placement-trace.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ABILITIES, WEAPONS, MONSTERS, STAGES } from '../js/content/combat.js';
import { createWorld, addPlayer, spawnMonster, step, emptyInput, startStage } from '../js/sim/world.js';
import { comboDef } from '../js/sim/basic-combo.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
import { predictPlayerTick } from '../js/net/player-prediction.js';
import { LocalPrediction } from '../js/net/prediction.js';
import { FEEL, impactTier } from '../js/render/feel.js';
import { FORMS, comboWorldTraces } from './av1-world-trace.mjs';
import { dpsTable, withoutCombos } from './av1-dps.mjs';
const input=o=>({...emptyInput(),...o});
function fixture(weapon='blade',form='sword',type='scarecrow') {
  const w=createWorld({seed:11}),p=addPlayer(w,{pid:'p',weapon,x:400,y:400,mods:{weaponForm:form}});
  const m=spawnMonster(w,type,465,400);Object.assign(m,{spawnLeft:0,thinkLeft:1e6,hp:1e6,maxHp:1e6,kx:0,ky:0});
  return {w,p,m};
}
function act(f,extra={}) {
  const events=[...step(f.w,{p:input({attack:true,aimX:1,...extra})})];
  for(let i=0;f.p.act&&i<100;i++)events.push(...step(f.w));
  return events;
}
for(const [weapon,form] of FORMS)test(`AV1 ${form}: repeat+auto chain 1/2/3/1, existing basic id, window measured from completion`,()=>{
  for(const auto of [false,true]) {
    const f=fixture(weapon,form),events=[];
    for(let i=0;i<240;i++)events.push(...step(f.w,{p:input({attack:!auto,autoAttack:auto,aimX:1})}));
    const casts=events.filter(e=>e.type==='act'&&e.id===f.p.id);
    assert.deepEqual(casts.slice(0,7).map(e=>e.step),[1,2,3,1,2,3,1]);
    assert.ok(casts.every(e=>e.ability===WEAPONS[weapon].basic));
    const window=fixture(weapon,form);act(window);assert.equal(window.p.combo.windowLeft,18);
    for(let t=0;t<17;t++)step(window.w);
    assert.equal(act(window)[0].step,2,'600ms inclusive');
    const expired=fixture(weapon,form);act(expired);for(let t=0;t<18;t++)step(expired.w);
    assert.equal(act(expired)[0].step,1,'beyond600ms restarts');
  }
});
test('AV1 reset: actual dodge, successful skill, direct hurt, weapon/form swap and explicit stagger',()=>{
  for(const reason of ['dodge','skill','hurt','weapon','form','stagger']) {
    const f=fixture();act(f);assert.equal(f.p.combo.step,1);
    if(reason==='dodge')step(f.w,{p:input({dodgeEdge:true,mx:-1})});
    if(reason==='skill')step(f.w,{p:input({skillEdge:true,aimX:1})});
    if(reason==='weapon'){f.p.weapon='bow';step(f.w);}
    if(reason==='form'){f.p.weaponForm='blunt';step(f.w);}
    if(reason==='stagger'){f.p.staggerLeft=2;step(f.w);}
    if(reason==='hurt') {
      f.w.projectiles.push({id:f.w.nextId++,ownerId:f.m.id,ownerKind:'monster',ownerType:f.m.type,team:1,
        abilityId:'sling_stone',x:f.p.x,y:f.p.y,vx:0,vy:0,r:8,travelled:0,range:500,pierce:0,hit:[],dmgMult:1,poiseMult:1});
      assert.ok(step(f.w).some(e=>e.type==='hit'&&e.dst===f.p.id));
    }
    assert.equal(f.p.combo.step,0,reason);
  }
  const f=fixture();act(f);f.p.mp=0;step(f.w,{p:input({skillEdge:true})});assert.equal(f.p.combo.step,1,'failed skill is not a cast');
});
test('AV1 counter at every prospective stage uses original power/shape/timing, precedes held auto/repeat and resets',()=>{
  for(const [weapon,form] of FORMS)for(const prior of [0,1,2]) {
    const f=fixture(weapon,form);for(let i=0;i<prior;i++)act(f);
    f.p.pendingCounter={attackerId:f.m.id,dodgeTick:0,expiresTick:99999};
    const ev=step(f.w,{p:input({attack:true,autoAttack:true,aimX:1})});
    assert.equal(ev.filter(e=>e.type==='act').length,1);assert.ok(ev.some(e=>e.type==='counter'));
    assert.equal(f.p.act.counter,true);assert.equal(f.p.act.def,ABILITIES[WEAPONS[weapon].basic]);assert.equal(f.p.combo.step,0);
    while(f.p.act)step(f.w);assert.equal(f.p.combo.step,0);
    assert.equal(act(f)[0].step,1);
  }
});
test('AV1 third-step plain basics never wear heavy boss poise; crit exception and blunt 1.4 × 1.6 remain',()=>{
  for(const type of ['throne_dragon','goblin_chief','gargoyle','rune_guardian'])for(const [weapon,form] of FORMS) {
    const f=fixture(weapon,form,type);const before=f.m.poise;
    const ev=[];for(let i=0;i<3;i++) {f.m.x=465;f.m.y=400;ev.push(...act(f));}
    assert.ok(ev.some(e=>e.type==='hit'&&e.step===3),`${type}/${form}`);assert.equal(f.m.poise,before);
  }
  const f=fixture('blade','blunt','goblin_grunt');f.m.poise=f.m.maxPoise=1000;
  act(f);act(f);f.m.x=465;f.m.kx=0;let paid=false;
  for(let t=0;t<30;t++) {
    const before=f.m.poise,ev=step(f.w,{p:input({attack:t===0,aimX:1})});
    if(ev.some(e=>e.type==='hit'&&e.step===3)) {
      assert.ok(Math.abs((before-f.m.poise)-(14*1.6*1.4-5))<1e-8);paid=true;break;
    }
  }
  assert.ok(paid);
  const crit=fixture('blade','sword','goblin_chief');crit.p.critChance=1;let critHit=false;
  for(let t=0;t<20;t++) if(step(crit.w,{p:input({attack:t===0,aimX:1})}).some(e=>e.type==='hit'&&e.crit)) {
    assert.ok(crit.m.poise<crit.m.maxPoise);critHit=true;break;
  }
  assert.ok(critHit);
});
test('AV1 third projectile retains its own resolved damage/pierce/radius/blast after source advances or swaps form',()=>{
  for(const [form,pierce,radius,blast] of [['wand',1,12,false],['staff',0,9,true]]) {
    const f=fixture('focus',form);f.m.x=850;act(f);act(f);
    const events=[];let shot;
    for(let t=0;t<10;t++) {events.push(...step(f.w,{p:input({attack:t===0,aimX:1})}));shot=f.w.projectiles.find(p=>p.step===3);if(shot)break;}
    assert.ok(shot);assert.equal(shot.pierce,pierce);assert.equal(shot.r,radius);assert.equal(!!shot.def.projectile.explode,blast);
    f.p.weaponForm=form==='staff'?'wand':'staff';
    for(let t=0;t<35;t++)events.push(...step(f.w));
    assert.ok(events.some(e=>e.type==='hit'&&e.step===3&&e.dmg===9));
    assert.equal(events.some(e=>e.type==='explode'&&e.step===3&&e.radius===46),blast);
  }
});
for(const [weapon,form] of FORMS)test(`AV1 ${form}: host == prediction step/clock/definition every tick, snapshots do not mutate`,()=>{
  const f=fixture(weapon,form);
  for(let t=0;t<450;t++) {
    const view=decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot({...f.w,round:{state:'running',pending:[]}}, {p:t}))), 'p');
    const inp=input({attack:t%100<80,autoAttack:t%100>=80,aimX:1,dodgeEdge:t%131===0,skillEdge:t%177===0});
    const serialized=JSON.stringify(view);
    const predicted=predictPlayerTick(view.entities[0],inp,{arena:f.w.arena,others:view.entities.slice(1),tick:f.w.tick});
    assert.equal(JSON.stringify(view),serialized,'prediction never mutates accepted snapshot');step(f.w,{p:inp});
    assert.deepEqual(predicted.combo,f.p.combo,`combo ${t}`);assert.equal(predicted.act?.step,f.p.act?.step,`act step ${t}`);
    assert.equal(predicted.act?.left,f.p.act?.left,`clock ${t}`);if(f.p.act)assert.deepEqual(predicted.act.def,f.p.act.def);
  }
});
test('AV1 reconciliation corrects wrong predicted combo and never exposes predicted damage/HP',()=>{
  const f=fixture();startStage(f.w,'S1');step(f.w,{p:input({attack:true})});
  const view=decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(f.w,{p:1}))), 'p'),predict=new LocalPrediction('p');
  predict.reconcile(view);predict.state.combo.step=3;predict.state.act.step=3;
  predict.reconcile(view);assert.equal(predict.state.combo.step,1);assert.equal(predict.view(view).entities[0].act.step,1);
  assert.equal(predict.view(view).entities[0].hp,view.entities[0].hp);
});
test('AV1 finishers use heavy FEEL without overriding critical/counter tiers',()=>{
  assert.equal(impactTier({type:'hit',step:3,dmg:9}),FEEL.impact.heavy);
  assert.equal(impactTier({type:'hit',step:3,counter:true}),FEEL.impact.counter);
});
test('AV1 5 forms × repeat/auto 30-second real-hit DPS stays within ±5%',()=>{
  const table=dpsTable();assert.equal(table.length,10);for(const r of table)assert.ok(Math.abs(r.deltaPct)<=5,JSON.stringify(r));
});
test('AV1 combo-disabled full serialized worlds/events match captured abcd094 legacy roster (exact four M2b/SUC placements reversed) for all27stages, 3seeds, 5forms',()=>{
  const before=JSON.parse(readFileSync(new URL('./fixtures/av1-abcd094-world-traces.json',import.meta.url)));
  assert.deepEqual(withoutPlacement(()=>withoutCombos(comboWorldTraces)),before);
});
test('AV1 legacy content preserves all27stages/original monsters/nonbasic power from abcd094 after exactly four approved M2b/SUC roster slots are reversed',async()=>{
  let s=execFileSync('git',['show','abcd094:arpg/js/content/combat.js'],{encoding:'utf8'});
  s=s.replace(/from '([^']+)'/g,(_,p)=>'from '+JSON.stringify(new URL(p,new URL('../js/content/combat.js',import.meta.url)).href));
  const old=await import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
  assert.deepEqual(Object.fromEntries(Object.entries(MONSTERS).filter(([id])=>!['demon','goleling','slime','succubus'].includes(id))),old.MONSTERS);assert.deepEqual(legacyPlacementStages(STAGES),old.STAGES);assert.deepEqual(WEAPONS,old.WEAPONS);
  const current=structuredClone(ABILITIES);for(const id of ['slash','arrow','focus_pulse']){delete current[id].combo;delete current[id].comboWindowMs;}
  assert.deepEqual(current,old.ABILITIES);
  for(const path of ['arpg/js/content/balance.js','arpg/js/content/loot.js','arpg/js/content/world-map.js','arpg/js/meta/items.js','arpg/js/sim/dodge-lag.js','arpg/js/sim/movement.js','arpg/js/net/session.js']) {
    assert.equal(path==='arpg/js/content/loot.js'?legacyPlacementLoot(readFileSync(new URL('../../'+path,import.meta.url),'utf8')):readFileSync(new URL('../../'+path,import.meta.url),'utf8'),execFileSync('git',['show',`abcd094:${path}`],{encoding:'utf8'}),path);
  }
});

test('AV1 enabled all27stage legacy-roster full-world fixture is deterministic and explicitly different from abcd094',()=>{
  const baseline=JSON.parse(readFileSync(new URL('./fixtures/av1-abcd094-world-traces.json',import.meta.url)));
  const enabled=JSON.parse(readFileSync(new URL('./fixtures/av1-enabled-world-traces.json',import.meta.url)));
  const actual=withoutPlacement(comboWorldTraces);assert.deepEqual(actual,enabled);assert.deepEqual(withoutPlacement(comboWorldTraces),actual);
  assert.equal(Object.keys(actual.traces).length,81);
  assert.equal(Object.keys(actual.traces).filter(k=>actual.traces[k].sha256!==baseline.traces[k].sha256).length,81);
});

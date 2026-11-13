import test from 'node:test';
import assert from 'node:assert/strict';
import { HubUI } from '../js/ui/hub.js';
import { ABILITIES } from '../js/content/combat.js';
import { createSave } from '../js/meta/save.js';
import { masteryLevels, setMasteryLevel } from '../js/meta/skill-mastery.js';
import { createWorld, addPlayer, startStage, spawnMonster, step, emptyInput } from '../js/sim/world.js';

const baseRow = '<p>사거리 560 px · 1발 · 관통 0회 · 폭발 반경 78 px</p>';
const zoneRow = '<p>고정 지점 사거리 560 px · 반경 117 px · 낙하 대기 0.4초</p>';
function saveFor(level) { return setMasteryLevel(createSave({name:'detail',weapon:'focus',answers:[0,0,0,0,0],createdAt:1}), 'ember_bolt',level); }
function detail(save) {
 const hub=Object.assign(Object.create(HubUI.prototype),{save,mountSheet(html){this.html=html;}});
 hub.openSkill('ember_bolt');return hub.html;
}
function cast(save, aimX=280) {
 const w=createWorld({seed:4}),p=addPlayer(w,{pid:'p',weapon:'focus',x:300,y:400,skillMasteryLevels:masteryLevels(save),mods:{mpRegen:0}});
 startStage(w,'S2');w.entities=[p];Object.assign(w.round,{pending:[],goal:'timer',timerTicks:10000});p.critChance=0;p.dmgMult.focus=1;
 const distances=[13,100,118.001],targets=distances.map(d=>{const g=spawnMonster(w,'goblin_grunt',580+d,400);Object.assign(g,{spawnLeft:0,r:1,hp:10000,maxHp:10000,frozenUntil:10000,speed:0});return g;});
 const events=[],projectiles=[],zones=[];let act;
 for(let i=0;i<40;i++) {
  targets.forEach((g,j)=>{g.x=580+distances[j];g.y=400;g.kx=g.ky=0;});
  events.push(...step(w,{p:{...emptyInput(),aimX,skillEdge:i===0}}));
  if(p.act&&!act)act=structuredClone(p.act);
  if(!projectiles.length&&w.projectiles.length)projectiles.push(...structuredClone(w.projectiles));
  if(!zones.length&&w.zones?.length)zones.push(...structuredClone(w.zones));
 }
 return {p,act,events,projectiles,zones,targets};
}
for(const level of [1,19,20,30]) test('EB1 detail matches actual cast delivery/radius/delay/range at mastery '+level,()=>{
 const save=saveFor(level),before=structuredClone(save),abilities=structuredClone(ABILITIES);
 const {p,act,events,projectiles,zones,targets}=cast(save),evolved=level>=20;
 assert.equal(p.maxMp-p.mp,14);assert.equal(act.def.cooldownMs,2600);assert.equal(act.def.damage,60);
 assert.equal(projectiles.length,evolved?0:1);assert.equal(zones.length,evolved?1:0);
 const explosion=events.find(e=>e.type==='explode');assert.ok(explosion);assert.equal(explosion.radius,evolved?117:78);
 assert.equal(events.find(e=>e.type==='hit'&&!e.periodic).dmg,60);
 if(evolved){
  assert.equal(zones[0].activeTick-zones[0].startTick,12);assert.equal(zones[0].x,580);
  assert.equal(targets[1].hp,9964);assert.equal(targets[2].hp,10000);
  const far=cast(save,1000);assert.equal(far.zones[0].x-300,560,'actual target lock clamps range');
 }else{assert.equal(projectiles[0].range,560);assert.equal(targets[1].hp,10000);}
 const html=detail(save);assert.ok(html.includes(evolved?zoneRow:baseRow),'common row matches actual delivery');
 if(evolved)assert.ok(!html.includes(baseRow));
 for(const row of ['<dt>피해</dt><dd>60</dd>','<dt>소모 MP</dt><dd>14 MP</dd>','<dt>재사용</dt><dd>2.6초</dd>'])assert.ok(html.includes(row));
 assert.deepEqual(save,before);assert.deepEqual(ABILITIES,abilities);
});
for(const xp of [499,500])test('EB1 XP '+xp+' uses actual mastery boundary',()=>{
 const save=saveFor(1);save.skillMastery.ember_bolt=xp;const before=structuredClone(save),result=cast(save);
 assert.equal(result.zones.length,xp===500?1:0);assert.ok(detail(save).includes(xp===500?zoneRow:baseRow));assert.deepEqual(save,before);
});
test('EB1 missing mastery map/entry keeps base row',()=>{
 for(const map of [false,true]){const s=saveFor(20);if(map)delete s.skillMastery;else delete s.skillMastery.ember_bolt;const before=structuredClone(s);assert.ok(detail(s).includes(baseRow));assert.deepEqual(s,before);}
});
test('EB1 default ember stays available without learned books; unlearned book/unknown rejected',()=>{
 const s=createSave({name:'unlearned',weapon:'blade',answers:[0,0,0,0,0],createdAt:1});s.learned=[];s.lineage='skeleton_knight';const before=structuredClone(s);
 assert.ok(detail(s).includes(baseRow));const h=Object.assign(Object.create(HubUI.prototype),{save:s});assert.throws(()=>h.openSkill('meteor'),/아직 배우지 않은/);assert.throws(()=>h.openSkill('missing_skill'),/아직 배우지 않은/);assert.deepEqual(s,before);
});

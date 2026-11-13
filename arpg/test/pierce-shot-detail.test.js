import test from 'node:test';
import assert from 'node:assert/strict';
import { HubUI } from '../js/ui/hub.js';
import { ABILITIES } from '../js/content/combat.js';
import { createSave } from '../js/meta/save.js';
import { masteryLevels, setMasteryLevel } from '../js/meta/skill-mastery.js';
import { createWorld, addPlayer, startStage, spawnMonster, step, emptyInput } from '../js/sim/world.js';

function saveFor(level) {
  return setMasteryLevel({ ...createSave({ name: 'detail', answers: [0,0,0,0,0], createdAt: 1 }), learned: ['pierce_shot'] }, 'pierce_shot', level);
}
function detail(save) {
  const hub = Object.assign(Object.create(HubUI.prototype), { save, mountSheet(html) { this.html = html; } });
  hub.openSkill('pierce_shot');
  return hub.html;
}
for (const level of [1,19,20,30]) test('PS1 detail matches actual projectile and hit count at mastery ' + level, () => {
  const save = saveFor(level), before = structuredClone(save), def = structuredClone(ABILITIES.pierce_shot);
  const w = createWorld({seed:4});
  const p = addPlayer(w, {pid:'p', weapon:'bow', x:100, y:400, skillMasteryLevels:masteryLevels(save), mods:{mpRegen:0,skills:['pierce_shot']}});
  startStage(w,'S2');w.entities=[p];w.round.pending=[];w.round.goal='timer';w.round.timerTicks=10000;
  const targets = Array.from({length:7},(_,i)=>{const g=spawnMonster(w,'goblin_grunt',180+i*70,400);Object.assign(g,{spawnLeft:0,hp:10000,maxHp:10000,frozenUntil:10000,r:1});return g;});
  const hits=[], projectiles=[];let cast;
  for(let tick=0;tick<36;tick++){
    const events=step(w,{p:{...emptyInput(),aimX:1,skillEdge:tick===0}});
    hits.push(...events.filter(e=>e.type==='hit'));
    if(p.act && !cast) cast=structuredClone(p.act);
    if(!projectiles.length && w.projectiles.length) projectiles.push(...structuredClone(w.projectiles));
  }
  const expected=level<20?4:5;
  assert.equal(projectiles.length,1);assert.equal(projectiles[0].pierce,expected);assert.equal(projectiles[0].range,720);
  assert.equal(hits.length,expected+1);assert.deepEqual(hits.map(e=>e.dmg),Array(expected+1).fill(48));
  assert.equal(targets[6].hp,10000);assert.equal(p.mp,p.maxMp-18);
  assert.equal(cast.def.cooldownMs,5000);
  const html=detail(save);
  // Real simulation assertions above must pass before this UI oracle is evaluated.
  assert.ok(html.includes('<p>사거리 720 px · 1발 · 관통 '+projectiles[0].pierce+'회</p>'));
  for (const row of ['<dt>피해</dt><dd>48</dd>', '<dt>소모 MP</dt><dd>18 MP</dd>', '<dt>재사용</dt><dd>5초</dd>']) assert.ok(html.includes(row));
  assert.deepEqual(save,before);assert.deepEqual(ABILITIES.pierce_shot,def);
});
test('PS1 missing mastery map or entry retains base pierce4 without mutation',()=>{
  for(const missingMap of [false,true]){
    const save=saveFor(20);if(missingMap)delete save.skillMastery;else delete save.skillMastery.pierce_shot;
    const before=structuredClone(save);assert.ok(detail(save).includes('<p>사거리 720 px · 1발 · 관통 4회</p>'));assert.deepEqual(save,before);
  }
});
test('PS1 unlearned and unknown details remain rejected without mutation',()=>{
  const save=saveFor(20);save.learned=[];const before=structuredClone(save);
  assert.throws(()=>detail(save),/아직 배우지 않은/);
  const hub=Object.assign(Object.create(HubUI.prototype),{save});assert.throws(()=>hub.openSkill('missing_skill'),/아직 배우지 않은/);assert.deepEqual(save,before);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Container } from '../vendor/pixi-8.22.0.min.mjs';
import { ArenaRenderer } from '../js/render/renderer.js';
import { VisualProvider } from '../js/render/visual-provider.js';
import { FEEL, kickEnvelope } from '../js/render/feel.js';
import { createWorld, addPlayer, spawnMonster, startStage, step } from '../js/sim/world.js';
import { MONSTERS, STAGES } from '../js/content/combat.js';
import { MONSTER_VARIANTS } from '../js/content/monsters.js';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function fixture(width, reduced = false) {
  const world = createWorld({seed:15});
  addPlayer(world, {pid:'local', weapon:'blade', x:400, y:400});
  const renderer = new ArenaRenderer({stage:new Container(), screen:{width,height:844}}, new VisualProvider({atlases:false}));
  renderer.reduced = reduced;
  return {world,renderer};
}
const bosses = Object.keys(MONSTERS).filter(type => MONSTERS[type].boss || type === 'goblin_chief' || MONSTER_VARIANTS[type]?.speciesTags.includes('boss'));

test('all authored bosses alone are visual 2x, including S15 chief; frozen world is unchanged over repeated renders', () => {
  assert.deepEqual(bosses.sort(), ['goblin_chief','necropolis_lord','throne_dragon']);
  assert.ok(STAGES.S15.spawns.some(s => s.monster === 'goblin_chief'));
  for (const width of [1280,390]) for (const reduced of [false,true]) {
    const {world,renderer} = fixture(width,reduced);
    for (const type of Object.keys(MONSTERS)) spawnMonster(world,type,600,400,{stageId:'S15'});
    // Instance-authored bosses count, random elites/heavy poise do not.
    const marked = spawnMonster(world,'wolf',650,400,{stageId:'S15'}); marked.boss = true;
    const elite = spawnMonster(world,'wolf',700,400,{stageId:'S15'}); elite.eliteVariant = true; elite.heavyPoise = true;
    const player = world.entities[0]; player.boss = true;
    renderer.snapshot(world);
    const before = JSON.stringify(world); freeze(world);
    for (let frame=0;frame<90;frame++) renderer.render(world,1,1/60);
    for (const entity of world.entities) {
      const view = renderer.views.get(entity.id), expected = entity.kind === 'monster' && (entity.boss || bosses.includes(entity.type)) ? 2 : 1;
      assert.equal(view.visual.container.scale.x,expected,`${width}/${reduced}/${entity.kind}/${entity.type}`);
      assert.equal(view.visual.container.scale.y,expected);
      assert.equal(view.visual.container.x,entity.x); assert.equal(view.visual.container.y,entity.y);
      assert.equal(view.shadow.scale.x,1); assert.equal(view.portal.scale.x,1+(21-(entity.spawnLeft||0))*.02);
      assert.equal(view.shadow.x,entity.x); assert.equal(view.shadow.y,entity.y);
    }
    assert.equal(JSON.stringify(world),before);
  }
});

test('S15 actual spawn keeps its authored radius/size and kick squash composes with 2x through hit stop and reduced motion', () => {
  const {world,renderer} = fixture(390);
  startStage(world,'S15'); step(world,{local:{}});
  const chief = world.entities.find(e=>e.type==='goblin_chief'); assert.ok(chief);
  renderer.snapshot(world); const view = renderer.views.get(chief.id);
  view.kickAge = FEEL.kick.life / 3; view.stopLeft = 1;
  const before = JSON.stringify(world), kick = kickEnvelope(view.kickAge); freeze(world);
  for (let frame=0;frame<3;frame++) {
    renderer.render(world,1,1/60);
    assert.equal(view.visual.container.scale.x,2*(1+kick*FEEL.kick.squash));
    assert.equal(view.visual.container.scale.y,2*(1-kick*FEEL.kick.squash));
  }
  renderer.reduced=true; renderer.render(world,1,1/60);
  assert.equal(view.visual.container.scale.x,2); assert.equal(view.visual.container.scale.y,2);
  assert.equal(JSON.stringify(world),before);
});

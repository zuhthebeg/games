import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Graphics,Container} from '../vendor/pixi-8.22.0.min.mjs';
import {MasterySkillVfx} from '../js/render/mastery-vfx.js';
import {SKILL_VFX} from '../js/render/skill-vfx.js';
import {ABILITIES} from '../js/content/combat.js';
import {ArenaRenderer} from '../js/render/renderer.js';
import {equipmentVisual} from '../js/render/paperdoll-state.js';
import {createSave} from '../js/meta/save.js';
const palette=[0xcde8ee,0x53b9ff,0x9cdaff,0xbe84ff,0xffd36f];
const fresh=()=>new MasterySkillVfx(Graphics,new Container());
const colors=node=>node.context.instructions.map(i=>i.data.style?.color);
test('draw-only accent copies use exact existing palette 6..10; 0..5/missing retain identity and shared profiles',()=>{
 const v=fresh(),before=JSON.stringify(SKILL_VFX),css=readFileSync(new URL('../css/game.css',import.meta.url),'utf8');
 for(const color of palette)assert.ok(css.includes('#'+color.toString(16)));
 for(const id of ['ember_bolt','frost_lance','healing_light'])for(let enhance=0;enhance<=10;enhance++){
  const profile=v.withLevel(30,id,false,()=>v.profile(id),enhance);
  assert.equal(profile.color,SKILL_VFX[id].color);assert.equal(profile.accent,enhance<6?SKILL_VFX[id].accent:palette[enhance-6]);
 }
 assert.equal(v.enhancement({kind:'player',pid:'x'}),0);assert.equal(v.enhancement({kind:'player',equipmentVisual:{enhance:9}}),9);assert.equal(v.enhancement({kind:'monster',equipmentVisual:{enhance:10}}),0);
 assert.equal(JSON.stringify(SKILL_VFX),before);assert.ok(Object.values(SKILL_VFX).every(Object.isFrozen));
});
test('two frozen players retain fire/ice cores and different weapon accents; projectile colour frozen until expiry/reset',()=>{
 const v=fresh();v.requestSkill=()=>null;
 const entities=[{id:1,pid:'a',kind:'player',equipmentVisual:{enhance:6},skillMasteryLevels:{ember_bolt:10}},{id:2,pid:'b',kind:'player',equipmentVisual:{enhance:9},skillMasteryLevels:{frost_lance:30}}];
 for(const e of entities){Object.freeze(e.equipmentVisual);Object.freeze(e);}
 const projectiles=entities.map((e,i)=>({id:10+i,ownerId:e.id,abilityId:i?'frost_lance':'ember_bolt',x:100,y:100,r:10,vx:100,vy:0}));
 const w={tick:1,entities,projectiles};const before=JSON.stringify(w);v.update(w,1,.03,false);
 assert.equal(JSON.stringify(w),before);assert.ok(colors(v.projectiles[0].node).includes(palette[0]));assert.ok(colors(v.projectiles[0].node).includes(SKILL_VFX.ember_bolt.color));assert.ok(colors(v.projectiles[1].node).includes(palette[3]));assert.ok(colors(v.projectiles[1].node).includes(SKILL_VFX.frost_lance.color));
 v.update({...w,entities:[{...entities[0],equipmentVisual:{enhance:10}},entities[1]]},1,.03,false);assert.equal(v.projectiles[0].castEnhance,6);assert.ok(v.projectiles[0].tail.filter(n=>n.visible).every(n=>n.tint===palette[0]));
 v.reset();v.update({...w,entities:[{...entities[0],equipmentVisual:{enhance:10}},entities[1]]},1,.03,false);assert.equal(v.projectiles[0].castEnhance,10);
});
test('solo reset copies next-departure equipmentSave source, not remote or running gear synchronisation',()=>{
 const s=createSave({name:'palette',weapon:'focus',answers:[0,0,0,0,0],createdAt:1});s.items.find(x=>x.uid===s.equipped.weapon).enhance=10;
 const v=fresh();v.setEquipment('local',equipmentVisual(s));assert.equal(v.enhancement({kind:'player',pid:'local'}),10);assert.equal(v.enhancement({kind:'player',pid:'remote',equipmentVisual:{enhance:6}}),6);
 v.reset();assert.equal(v.enhancement({kind:'player',pid:'local'}),0);
 const code=readFileSync(new URL('../js/render/renderer.js',import.meta.url),'utf8');assert.match(code,/setEquipment\(world\.entities\[0\]\.pid, equipmentVisual\(equipmentSave\)\)/);
});

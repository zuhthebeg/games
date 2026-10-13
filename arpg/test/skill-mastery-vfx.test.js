import test from 'node:test';
import assert from 'node:assert/strict';
import { Graphics, Container } from '../vendor/pixi-8.22.0.min.mjs';
import { SkillVfx, SKILL_VFX, VFX_CAPS, VFX_ATLASES } from '../js/render/skill-vfx.js';
import { MasterySkillVfx, masteryVisual } from '../js/render/mastery-vfx.js';
import { ABILITIES } from '../js/content/combat.js';
import { ArenaRenderer } from '../js/render/renderer.js';
const fixture=(opts={})=>new MasterySkillVfx(Graphics,new Container(),opts);
const empty={tick:0,entities:[],projectiles:[]};
const geometry=node=>({bounds:node.getLocalBounds(),instructions:node.context.instructions.map(({action,data})=>({action,path:data.path.instructions,style:{color:data.style.color,alpha:data.style.alpha,width:data.style.width,alignment:data.style.alignment}}))});
for(const [id,p] of Object.entries(SKILL_VFX)) test(`${id}: Lv1/2 and forced classic preserve exact classic vector instructions; enhanced pools bounded`,()=>{
 const v=fixture(),base=new SkillVfx(Graphics,new Container(),{effekseer:false});
 const radius=p.radius??p.projectileRadius??32;
 base.effect(p,'active',0,0,0,radius,p.shape,false);
 for(const level of [1,2]) {
  v.reset(); v.withLevel(level,id,false,()=>v.effect(p,'active',0,0,0,radius,p.shape,false));
  assert.deepEqual(geometry(v.effects[0].node),geometry(base.effects[0].node)); assert.equal(v.fxLoads.size,0);
 }
 v.setEffekseer(false);v.reset();v.withLevel(5,id,false,()=>v.effect(p,'active',0,0,0,radius,p.shape,false));assert.deepEqual(geometry(v.effects[0].node),geometry(base.effects[0].node));
 v.setEffekseer(true);v.reset();
 // Keep this pure test offline; only ember may request its existing atlas.
 v.requestSkill=()=>null;
 for(let i=0;i<100;i++)v.withLevel(5,id,false,()=>v.effect(p,'active',0,0,0,radius,p.shape,false));
 assert.equal(v.effects.length,VFX_CAPS.effects);assert.equal(v.particles.length,VFX_CAPS.particles);assert.ok(v.particles.filter(s=>s.left>0).length<=VFX_CAPS.particles);
 v.update(empty,1,0,false);assert.equal(v.effects[0].node.scale.x,1);
 v.update(empty,1,2,false);assert.ok(v.effects.every(s=>!s.node.visible));
});
test('Lv3/Lv5 have procedural glow, 1.15 internal ornament size, longer tail, reduced-motion classic; only existing ember atlas enabled',()=>{
 assert.equal(masteryVisual(1).path,'classic');assert.equal(masteryVisual(2).path,'classic');assert.equal(masteryVisual(3).path,'classic-enhanced');assert.equal(masteryVisual(5).scale,1.15);assert.equal(masteryVisual(3).tail,1.3);
 assert.equal(masteryVisual(5,false,true).path,'classic');assert.equal(masteryVisual(5,false,false,true).path,'classic');assert.deepEqual(Object.keys(VFX_ATLASES),['ember_bolt']);
 const v=fixture();assert.equal(v.visual(3,'ember_bolt',false).path,'atlas-overlay');assert.equal(v.visual(3,'heavy_cleave',false).path,'classic-enhanced');
});
test('render-only frozen world and two casters: remote level does not inherit local level; no cumulative transform growth',()=>{
 const v=fixture();v.requestSkill=()=>null;v.setMastery('a',{frost_lance:1});v.setMastery('b',{frost_lance:5});
 const entities=[{id:1,pid:'a',kind:'player'},{id:2,pid:'b',kind:'player'}];
 const projectiles=entities.map((e,i)=>({id:10+i,ownerId:e.id,abilityId:'frost_lance',x:100,y:100,r:10,vx:100,vy:0}));
 const w={tick:1,entities,projectiles};const freeze=o=>{Object.values(o).forEach(x=>{if(x&&typeof x==='object')freeze(x);});Object.freeze(o);};freeze(w);const before=JSON.stringify(w);
 for(let i=0;i<20;i++)v.update(w,1,.016,false);assert.equal(JSON.stringify(w),before);assert.equal(v.projectiles[0].mastery.level,1);assert.equal(v.projectiles[1].mastery.level,5);assert.equal(v.projectiles[1].node.scale.x,1);
});
test('mastery camera kick is local Lv5 only and never applied in reduced motion',()=>{
 const kick=(pid,level,reduced)=>{
  const renderer={skillVfx:fixture(),areaImpact:{tiers:()=>new Map()},telegraphs:[],reduced,trauma:0,number(){},burst(){},impact(){},effect(){}};
  renderer.skillVfx.requestSkill=()=>null;renderer.skillVfx.setMastery(pid,{frost_lance:level});
  const w={entities:[{id:1,pid:'local',kind:'player'},{id:2,pid:'remote',kind:'player'},{id:3,kind:'monster'}],telegraphs:[],projectiles:[]};
  ArenaRenderer.prototype.events.call(renderer,w,[{type:'hit',src:pid==='local'?1:2,dst:3,ability:'frost_lance',dmg:1,x:100,y:100}]);return renderer.trauma;
 };
 assert.equal(kick('local',5,false),.035);assert.equal(kick('remote',5,false),0);assert.equal(kick('local',3,false),0);assert.equal(kick('local',5,true),0);
});

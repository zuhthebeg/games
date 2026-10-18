import test from 'node:test';
import assert from 'node:assert/strict';
import { Graphics, Container } from '../vendor/pixi-8.22.0.min.mjs';
import { MasterySkillVfx, masteryVisual } from '../js/render/mastery-vfx.js';
import { SKILL_VFX, VFX_CAPS } from '../js/render/skill-vfx.js';
import { SPELL_ZONE_VFX } from '../js/render/spell-zones.js';
import { MASTERY_SKILLS } from '../js/meta/skill-mastery.js';
import { ABILITIES } from '../js/content/combat.js';
const freeze=o=>{for(const v of Object.values(o))if(v&&typeof v==='object')freeze(v);return Object.freeze(o);};
test('real 1..30 map to stages1..7; legacy stage3/4/5 core parameters retained; late stages bounded',()=>{
 for(let level=1;level<=30;level++){const v=masteryVisual(level);assert.equal(v.level,level);assert.equal(v.stage,1+Math.floor(level/5));assert.equal(v.path,level>=10?'classic-enhanced':'classic');assert.ok(v.scale<=1.15);assert.ok(v.extraParticles<=12);assert.equal(masteryVisual(level,false,true).extraParticles,0);assert.equal(masteryVisual(level,false,false,true).extraParticles,0);}
 for(const level of [10,15]){assert.equal(masteryVisual(level).scale,1);assert.equal(masteryVisual(level).brightness,1.25);assert.equal(masteryVisual(level).extraParticles,4);}
 assert.equal(masteryVisual(20).scale,1.15);assert.equal(masteryVisual(20).brightness,1.5);assert.equal(masteryVisual(20).extraParticles,8);
});
test('all known skills / 30 levels finite with frozen active+hit+projectile snapshots; pools fixed',()=>{
 const v=new MasterySkillVfx(Graphics,new Container());v.requestSkill=()=>null;
 assert.deepEqual([...Object.keys(SKILL_VFX),...Object.keys(SPELL_ZONE_VFX)].sort(),[...MASTERY_SKILLS].sort());
 for(const id of MASTERY_SKILLS)for(let level=1;level<=30;level++){
  v.reset();v.setMastery('a',{[id]:level});const def=ABILITIES[id];const e={id:1,pid:'a',kind:'player',x:100,y:100,r:18,act:{id,def,phase:'active',elapsed:16,total:20,facing:0}};
  const w=freeze({tick:50,entities:[e,{id:2,pid:'b',kind:'player',x:160,y:100,r:18,skillMasteryLevels:{[id]:30}}],projectiles:def.projectile?[{id:10,ownerId:1,abilityId:id,x:100,y:100,r:def.projectile.radius,vx:100,vy:0}]:[]});const before=JSON.stringify(w);
  v.snapshot(w);v.update(w,1,.016,false);v.event({type:'hit',src:1,dst:3,ability:id,x:120,y:100},w,false);
  assert.equal(JSON.stringify(w),before);for(const slot of [...v.effects,...v.actors,...v.particles,...v.projectiles]){for(const n of [slot.node.x,slot.node.y,slot.node.scale.x,slot.node.scale.y,slot.node.alpha])assert.ok(Number.isFinite(n),id+'/'+level);const b=slot.node.getLocalBounds();for(const n of [b.minX,b.minY,b.maxX,b.maxY])assert.ok(Number.isFinite(n),id+'/'+level);}
  assert.equal(v.level(w.entities[1],id),30);assert.equal(v.effects.length,VFX_CAPS.effects);assert.equal(v.actors.length,VFX_CAPS.actors);assert.equal(v.particles.length,VFX_CAPS.particles);assert.equal(v.projectiles.length,VFX_CAPS.projectiles);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Graphics, Container } from '../../../vendor/pixi-8.22.0.min.mjs';
import { SkillVfx, SKILL_VFX, VFX_ATLASES, effekseerEnabled } from '../../../js/render/skill-vfx.js';
import { ABILITIES } from '../../../js/content/combat.js';
const base=execFileSync('git',['show','74a6237:arpg/js/render/skill-vfx.js'],{encoding:'utf8'});
const fixed=base.replace(/from '([^']+)'/g,(_,path)=>`from '${new URL(path,new URL('../../../js/render/skill-vfx.js',import.meta.url)).href}'`);
const {SkillVfx:Baseline}=await import('data:text/javascript;base64,'+Buffer.from(fixed).toString('base64'));
const summarize=vfx=>[...vfx.effects,...vfx.particles,...vfx.actors,...vfx.projectiles].map(s=>({id:s.id,left:s.left,kind:s.kind,visible:s.node.visible,alpha:s.node.alpha,x:s.node.x,y:s.node.y,rotation:s.node.rotation,scale:[s.node.scale.x,s.node.scale.y],instructions:s.node.context.instructions.map(i=>({action:i.action,path:i.data.path?.instructions,color:i.data.style?.color,alpha:i.data.style?.alpha,width:i.data.style?.width}))}));
for(const [ability,folder] of Object.entries(VFX_ATLASES)) {
  test(`FX2 ${ability}: atlas budget, no hotlink, clip/rect integrity`,()=>{
    const root=new URL(`../../../assets/vfx/${folder}/`,import.meta.url);
    const meta=JSON.parse(readFileSync(new URL('atlas.json',root)));
    assert.equal(meta.image,'atlas.webp');
    assert.ok(statSync(new URL(meta.image,root)).size+statSync(new URL('atlas.json',root)).size<=250000);
    assert.ok(meta.clips.impact);assert.ok(meta.clips.projectile||meta.clips.active);
    for(const clip of Object.values(meta.clips)) {
      assert.ok(clip.frames.length>0);assert.ok(clip.support>0);
      for(const key of clip.frames) {
        const f=meta.frames[key].frame;
        assert.ok(f.x>=0&&f.y>=0&&f.w>0&&f.h>0&&f.x+f.w<=meta.size[0]&&f.y+f.h<=meta.size[1]);
      }
    }
  });
}
test('FX2 classic commands equivalent to 74a6237 for every skill and phase/event',()=>{
  for(const [id,p] of Object.entries(SKILL_VFX)) {
    const before=new Baseline(Graphics,new Container(),{effekseer:false});
    const after=new SkillVfx(Graphics,new Container(),{effekseer:false});
    const world={tick:50,entities:[],projectiles:[]};
    for(const phase of ['windup','lock','active','recovery']) {
      world.entities=[{id:1,kind:'player',x:250,y:250,r:18,act:{id,def:ABILITIES[id],phase,total:18,elapsed:5,facing:.6}}];
      if(p.projectileRadius)world.projectiles=[{id:100,abilityId:id,x:300,y:260,r:p.projectileRadius,vx:300,vy:50}];
      for(const vfx of [before,after]) {
        for(const type of ['hit','explode','healCast','heal'])vfx.event({type,ability:id,x:300,y:260,radius:p.radius||p.projectileRadius||20},world,false);
        vfx.update(world,1,1/30,false);
      }
      assert.deepEqual(summarize(after),summarize(before),`${id} ${phase}`);
      world.tick++;
    }
    assert.equal(after.fxLoads.size,0);
  }
});
test('FX2 lazy load, reduced/classic zero fetch, one attempt per skill, isolated failed fallback',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return {ok:false,status:503};};
  try {
    const classic=new SkillVfx(Graphics,new Container(),{effekseer:false});
    assert.equal(classic.requestSkill('ember_bolt'),null);
    const vfx=new SkillVfx(Graphics,new Container(),{effekseer:true});
    assert.equal(calls,0);assert.equal(vfx.fxLoad,null);
    assert.equal(vfx.requestSkill('ember_bolt',true),null);assert.equal(calls,0);
    const first=vfx.requestSkill('ember_bolt');assert.equal(vfx.requestSkill('ember_bolt'),first);
    assert.equal(await first,false);assert.equal(calls,1);assert.equal(vfx.fxAssets.size,0);
    vfx.event({type:'explode',ability:'ember_bolt',x:200,y:200,radius:78},{},false);
    assert.ok(vfx.effects.some(s=>s.left>0&&s.node.visible));
    assert.equal(calls,1);assert.match(vfx.fxErrors.get('ember_bolt'),/503/);
    assert.equal(vfx.layer.children.length,classic.layer.children.length);
  }finally{globalThis.fetch=original;}
});

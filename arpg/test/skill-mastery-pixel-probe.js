import { Application, Graphics, Container, RenderTexture } from '../vendor/pixi-8.22.0.min.mjs';
import { MasterySkillVfx } from '../js/render/mastery-vfx.js';
import { SKILL_VFX } from '../js/render/skill-vfx.js';
import { MASTERY_SKILLS } from '../js/meta/skill-mastery.js';
import { ABILITIES } from '../js/content/combat.js';
import { ArenaRenderer } from '../js/render/renderer.js';

// Numbers only: Pixi RenderTexture extraction, never screenshots/encoded images.
export async function masteryPixels() {
 const app=new Application();await app.init({width:512,height:512,preference:'webgl',backgroundAlpha:0,autoStart:false});
 const target=RenderTexture.create({width:512,height:512}),rows=[];
 const read=()=>{app.renderer.render({container:app.stage,target,clear:true});return app.renderer.extract.pixels({target}).pixels;};
 const hash=async mask=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',mask))].map(x=>x.toString(16).padStart(2,'0')).join('');
 for(const id of MASTERY_SKILLS) for(const level of [1,10,20]) {
  const layer=new Container();app.stage.addChild(layer);const v=new MasterySkillVfx(Graphics,layer);
  const a=ABILITIES[id],p=SKILL_VFX[id];v.setMastery('a',{[id]:level});
  if(id==='ember_bolt' && level>=10) {if(!await v.requestSkill(id))throw Error(v.fxError);}
  const e={id:1,pid:'a',kind:'player',r:18,x:256,y:256,facing:0,act:{id,def:a,phase:'active',elapsed:16,total:20,facing:0}};
  let world={tick:50,entities:[e],projectiles:[]},radius=a.shape?.range ?? a.shape?.radius ?? a.projectile?.radius ?? (18+a.dash.bodyPad);
  let type=a.shape?.type ?? (a.dash?'dash-body':'projectile'),cx=256+(a.shape?.offset||0);
  const generic=[];
  if(!p) {
   const node=new Graphics();node.blendMode='add';layer.addChild(node);
   const renderer={effects:[{node,left:0}],skillVfx:v,reduced:false};
   const visual=v.visual(level,id,false);
   ArenaRenderer.prototype.effect.call(renderer,256,256,0,0xe88e50,.3,'blunt',a.shape,0,visual);
   v.enhance(node,visual);generic.push(node);
  } else if(a.projectile && !a.projectile.explode) {
   e.act=null; const projectile={id:10,ownerId:1,abilityId:id,x:216,y:256,r:radius,vx:300,vy:0};world.projectiles=[projectile];
   for(let i=0;i<6;i++){projectile.x=216+i*8;v.snapshot(world);v.update(world,1,.03,false);}
  } else if(a.dash) v.update(world,1,.06,false);
  else {
   world.entities=[{...e,act:null}];
   if(a.projectile?.explode) {radius=a.projectile.explode.radius;type='explosion-circle';cx=256;}
   v.withLevel(level,id,false,()=>v.effect(p,'active',256,256,0,radius,a.shape,false));
   v.update(world,1,.06,false);
  }
  const full=read();let fullLit=0;for(let i=3;i<full.length;i+=4)if(full[i]>=64)fullLit++;
  // Isolate the footprint/core for geometry; sparks/tails are ornamental, not a hit guide.
  for(const s of v.particles)s.node.visible=false;
  for(const s of v.projectiles)for(const n of s.tail)n.visible=false;
  for(const s of v.actors)for(const n of s.motes)n.visible=false;
  const core=read(),mask=new Uint8Array(512*512);let coreLit=0,outside=0,maxR=0,edgePixels=0,maxAngle=0,maxLitR=0;const spills=[];
  for(let y=0;y<512;y++)for(let x=0;x<512;x++) {
   const alpha=core[(y*512+x)*4+3];if(alpha>=64){mask[y*512+x]=1;coreLit++;maxLitR=Math.max(maxLitR,Math.hypot(x+.5-cx,y+.5-256));}
   if(alpha<12)continue;
   const dx=x+.5-cx,dy=y+.5-256,r=Math.hypot(dx,dy);maxR=Math.max(maxR,r);
   const angle=Math.abs(Math.atan2(dy,dx))*180/Math.PI;
   const half=(a.shape?.arc||0)*Math.PI/360;
   if(r>radius+2.1 || (a.shape?.type==='cone' && (dx < -2.1 || Math.abs(dy)*Math.cos(half)-dx*Math.sin(half)>2.1))){outside++;if(spills.length<8)spills.push({dx,dy,r:+r.toFixed(2),alpha,angle:+angle.toFixed(2)});}
   if(r>=radius-3 && r<=radius+2.1)edgePixels++;
   if(a.shape?.type==='cone'&&r>radius*.5)maxAngle=Math.max(maxAngle,angle);
  }
  rows.push({id,level,type,radius,maxRadius:+maxR.toFixed(2),maxAngle:+maxAngle.toFixed(2),maxLitRadius:+maxLitR.toFixed(2),edgePixels,outside,spills,coreLit,fullLit,mask:await hash(mask),path:v.visual(level,id,false).path,atlasActive:v.effects.some(s=>s.bakedActive)});
  v.reset();layer.destroy({children:true});
 }
 target.destroy(true);app.destroy(true,{children:true});return rows;
}

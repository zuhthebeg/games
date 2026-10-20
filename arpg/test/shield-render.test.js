import test from 'node:test';import assert from 'node:assert/strict';
import {physicalShieldPose,withPhysicalShield} from '../js/render/physical-shield.js';
const pawn={kind:'player',weapon:'blade',offhand:'shield',facing:0};
test('icon-matched shield projects eight directions, correct hand/depth and bounded guard/bash extension',()=>{
 const poses=[];for(let i=0;i<8;i++){
  const e={...pawn,facing:i*Math.PI/4},p=physicalShieldPose(e);
  assert.equal(p.shape,'kite');assert.equal(p.behind,Math.sin(e.facing)<-.2);assert.ok(p.thickness>0);poses.push(p);
  const g=physicalShieldPose({...e,shieldGuard:{left:1,facing:e.facing}});
  assert.ok(Math.hypot(g.x-p.x,g.y-p.y)>0);assert.ok(Math.hypot(g.x-g.handX,g.y-g.handY)<=6);
  assert.equal(g.blocking,true);assert.equal(physicalShieldPose({...e,act:{id:'shield_bash',phase:'active'}}).bashing,true);
 }assert.ok(poses[2].width>poses[0].width);assert.equal(physicalShieldPose({...pawn,handedness:2}),null);
});
test('shield draws wooden planks and reverse grip, preserves live fallback debug and destroys owned graphics once',()=>{
 const shapes=[];class C{constructor(){this.children=[];}addChild(...xs){for(const x of xs){x.removeFromParent?.();this.children.push(x);x.parent=this;}return xs[0];}removeFromParent(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}destroy(o){this.destroyed=(this.destroyed||0)+1;if(o?.children)for(const x of this.children)x.destroy(o);}}
 class G extends C{constructor(){super();this.position={set(){}};shapes.push(this);this.calls=[];}clear(){return this;}poly(...a){this.calls.push(['poly',...a]);return this;}ellipse(...a){this.calls.push(['ellipse',...a]);return this;}circle(){return this;}fill(){return this;}stroke(){return this;}moveTo(){return this;}lineTo(){return this;}roundRect(){this.calls.push(['grip']);return this;}}
 let phase='procedural',destroyed=0;const container=new C();const v=withPhysicalShield({container,get debug(){return{mode:phase};},update(){},destroy(){destroyed++;container.removeFromParent();}},G,C);
 v.update(pawn,{age:0},.01);assert.ok(shapes.flatMap(s=>s.calls).some(c=>c[0]==='poly'));
 v.update({...pawn,facing:-Math.PI/2},{age:0},.01);assert.ok(shapes.flatMap(s=>s.calls).some(c=>c[0]==='grip'));
 phase='atlas';assert.equal(v.debug.mode,'atlas');v.destroy();v.destroy();assert.equal(destroyed,1);assert.ok(shapes.every(s=>s.destroyed===1));
});
test('shield is on the actual left hand: south-facing pawn left is screen-right, north-facing left is screen-left',()=>{assert.ok(physicalShieldPose({...pawn,facing:Math.PI/2}).x>0);assert.ok(physicalShieldPose({...pawn,facing:-Math.PI/2}).x<0);});

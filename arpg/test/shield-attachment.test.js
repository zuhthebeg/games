import test from 'node:test';
import assert from 'node:assert/strict';
import {physicalShieldPose,drawPhysicalShield,withPhysicalShield} from '../js/render/physical-shield.js';
const pawn={kind:'player',weapon:'blade',offhand:'shield',facing:0};
test('equipped shield grip follows the drawn offhand frame instead of an independent orbit',()=>{
 for(const facing of Array.from({length:64},(_,i)=>i*Math.PI/32))for(const act of [null,{id:'slash',phase:'active'},{id:'shield_bash',phase:'active'}]){
  const hand={x:17+Math.sin(facing)*4,y:-34+Math.cos(facing)*7};
  const p=physicalShieldPose({...pawn,facing,act},.2,hand);
  assert.equal(p.handX,hand.x);assert.equal(p.handY,hand.y);
  assert.ok(Math.hypot(p.x-hand.x,p.y-hand.y)<=6,'shield stays on forearm even during bash');
 }
});
test('equipped art uses the actual wooden pointed icon silhouette, no nested ellipse vortex',()=>{
 const calls=[];const g=new Proxy({}, {get:(_,k)=>(...args)=>{calls.push([k,...args]);return g;}});
 drawPhysicalShield(g,physicalShieldPose(pawn));
 assert.ok(calls.some(c=>c[0]==='poly'),'pointed wooden silhouette');
 assert.ok(calls.some(c=>c[0]==='fill'&&c[1]===0x986d3b),'wood face matches item artwork');
 assert.ok(calls.filter(c=>c[0]==='ellipse').length<=3,'single boss, not concentric overlapping shield faces');
});
test('shield layering wraps asynchronously replaced character rather than indexing into its children',()=>{
 class G{constructor(){this.children=[];this.position={set(){}};this.scale={set(){}};}addChild(...nodes){this.children.push(...nodes);return nodes[0];}removeFromParent(){}destroy(){}clear(){return this;}ellipse(){return this;}poly(){return this;}circle(){return this;}fill(){return this;}stroke(){return this;}moveTo(){return this;}lineTo(){return this;}roundRect(){return this;}}
 const body=new G();const v=withPhysicalShield({container:body,offhandPose:()=>({x:8,y:-25}),update(){},destroy(){}},G,G);
 assert.notEqual(v.container,body);assert.equal(v.container.children[1],body);
 v.update({...pawn,facing:-Math.PI/2},{age:0},0);assert.equal(v.debug.physicalShield.behind,true);
 v.update({...pawn,facing:Math.PI/2},{age:0},0);assert.equal(v.debug.physicalShield.behind,false);
});

test('every authored blade/wand/skeleton animation frame has an in-body hand socket and attached shield bounds',async()=>{
 const {SHIELD_HAND_ANCHORS}=await import('../js/render/shield-hand-anchors.js');
 const {readFileSync}=await import('node:fs');let checked=0;
 for(const [kit,path]of Object.entries({blade:'paperdoll/blade',focus:'paperdoll/focus',skeleton:'player-skeleton-equipment'})){
  const m=JSON.parse(readFileSync(new URL(`../assets/sprites/${path}/manifest.json`,import.meta.url)));
  for(const [clip,names]of Object.entries(m.animations)){
   assert.equal(SHIELD_HAND_ANCHORS[kit][clip].length,names.length,`${kit} ${clip} coverage`);
   for(let i=0;i<names.length;i++){
    const [x,y]=SHIELD_HAND_ANCHORS[kit][clip][i],t=m.layout.frames[names[i]].trim;
    const bx=t[0]-m.anchor.x*128,by=t[1]-m.anchor.y*128;
    assert.ok(x>=bx-3&&x<=bx+t[2]+3&&y>=by-3&&y<=by+t[3]+3,`${kit} ${names[i]} hand on body`);
    if(clip.startsWith('death'))continue;
    const facing=['E','SE','S','SW','W','NW','N','NE'].indexOf(clip.split('_')[1])*Math.PI/4;
    for(const blocking of [false,true]){
     const p=physicalShieldPose({...pawn,facing,shieldGuard:blocking?{left:1}:null},0,{x,y,facing});
     assert.ok(p.x+p.width>=bx&&p.x-p.width<=bx+t[2]&&p.y+p.height>=by&&p.y-p.height<=by+t[3],`${kit} ${names[i]} shield/body bbox contact`);
     assert.ok(Math.hypot(p.x-x,p.y-y)<=6);checked++;
    }
   }
  }
 }
 assert.ok(checked>2000);
});

test('frame socket output is reusable without per-update pose allocation and snaps with drawn facings',()=>{
 const out={};for(let i=0;i<360;i++)assert.equal(physicalShieldPose({...pawn,facing:i*Math.PI/180},0,null,out),out);
 const a=physicalShieldPose({...pawn,facing:.01}),b=physicalShieldPose({...pawn,facing:.3});assert.equal(a.x,b.x);assert.equal(a.y,b.y);assert.equal(a.width,b.width);
});

test('all existing shield rarity variants use the same reviewed wood/gold item artwork',async()=>{
 const{ITEMS}=await import('../js/meta/items.js');const{itemArtKey,itemArtPath}=await import('../js/ui/item-art.js');
 const shields=Object.entries(ITEMS).filter(([,d])=>d.form==='shield');assert.equal(shields.length,4);
 for(const[id,d]of shields){assert.equal(itemArtKey(id,d),'shield');assert.equal(itemArtPath('shield'),'assets/items/shield-armor-v2.webp');}
});

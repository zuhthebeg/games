// Actual shipped Pixi parser, CPU metadata only; no renderer/runtime registration.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { atlasFrame } from '../../../js/render/atlas-state.js';
import { TextureSource, Texture, Spritesheet } from '../../../vendor/pixi-8.22.0.min.mjs';
const kit = process.argv[2];
const descriptor=JSON.parse(fs.readFileSync(path.join(kit,'kit-descriptor.json'),'utf8'));
const merged={}, owner={};
const report={status:'PASS',mode:'actual shipped Pixi8.22.0 Spritesheet.parse CPU, not native canvas/GPU',groups:{},frames:0,sheets:[],logicalOriginal:[256,256],physicalOriginal:[128,128],metaScale:'.5',actualTextureSourceResolution:.5,inverseLogicalExpansion:2};
for(const name of descriptor.sheets){
 const data=JSON.parse(fs.readFileSync(path.join(kit,name),'utf8'));
 const source=new TextureSource({width:data.meta.size.w,height:data.meta.size.h});
 const texture=new Texture({source});
 const sheet=new Spritesheet(texture,data);
 await sheet.parse();
 assert.equal(sheet.resolution,.5);assert.equal(source.resolution,.5);
 for(const [key,frame] of Object.entries(data.frames)){
  const t=sheet.textures[key];assert.equal(t.orig.width,256);assert.equal(t.orig.height,256);
  assert.equal(t.frame.width,frame.frame.w*2);assert.equal(t.frame.height,frame.frame.h*2);
  assert.equal(t.trim.x,frame.spriteSourceSize.x*2);assert.equal(t.trim.y,frame.spriteSourceSize.y*2);
  assert.equal(t.defaultAnchor.x,descriptor.anchor.x);assert.equal(t.defaultAnchor.y,descriptor.anchor.y);
  assert(t.trim.x>=0 && t.trim.y>=0 && t.trim.right<=256 && t.trim.bottom<=256);
  report.frames++;
 }
 for(const [key,frames] of Object.entries(sheet.animations)){
  assert(!(key in owner),'Object.assign fragment loss: '+key);owner[key]=name;
  report.groups[key]=frames.length;
 }
 Object.assign(merged,sheet.animations);
 for(const [key,names] of Object.entries(data.animations)) assert.deepEqual(names,[...names].sort());
 report.sheets.push({physical:data.meta.size,actualResolution:source.resolution,logicalTexture:[source.width,source.height],textures:Object.keys(sheet.textures).length});
}
assert.equal(Object.keys(report.groups).length,descriptor.animations.length*8);
for(const state of descriptor.animations) for(const d of ['E','SE','S','SW','W','NW','N','NE']) assert(report.groups[state+'_'+d]>=2);
assert.equal(report.frames,descriptor.animations.includes('magic') ? 584 : 480);
assert.equal(new Set(descriptor.sheets.flatMap(name=>Object.keys(JSON.parse(fs.readFileSync(path.join(kit,name),'utf8')).frames))).size,report.frames);
assert.equal(Object.keys(merged).length,descriptor.animations.length*8);
const ticks=Array.from({length:7},(_,i)=>({age:i/30,frame:atlasFrame('dodge',6,i/30,12,{},descriptor.animation_durations.dodge)}));
assert.deepEqual(ticks.slice(0,6).map(x=>x.frame),[0,1,2,3,4,5]);
assert.equal(ticks[6].frame,5);assert.equal(atlasFrame('dodge',6,1,12,{},.2),5);
for(let repeat=0;repeat<3;repeat++)assert.equal(atlasFrame('dodge',6,0,12,{},.2),0);
assert.equal(descriptor.dodge_contract.source,'Dodge_Forward');assert.equal(descriptor.dodge_contract.endpoint_included,true);
report.dodgePresentation={ticks,endpointReachedBefore200ms:true,resetAgeFrameZero:true,sourceSeconds:.4,presentationSeconds:.2,runtimeBinding:false};
report.ObjectAssignMergeGroups=Object.keys(merged).length;report.groupOwner=owner;
fs.writeFileSync(path.join(path.dirname(process.argv[1]),'pixi-parser-validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));

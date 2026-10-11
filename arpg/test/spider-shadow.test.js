import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const manifest=read('../assets/sprites/manifest.json');
// Final camera envelope independently recorded in offline frames-v2/frames.json.
const target=[0,.7981360554695129,1.9235115051269531],ortho=10.057525634765625,pitch=40*Math.PI/180;
const expected=.5+(target[1]*Math.sin(pitch)+target[2]*Math.cos(pitch))/ortho;
test('spider fixed ground anchor projects the evaluated final camera, not the stale pre-fit camera',()=>{
 const kit=manifest.find(v=>v.id==='poison-spider');
 assert.ok(Math.abs(kit.anchor.y-expected)*128<.001,`ground mismatch ${(expected-kit.anchor.y)*128}px`);
 let count=0;
 for(const sheet of kit.sheets)for(const f of Object.values(read('../assets/sprites/poison-spider/'+sheet).frames)){
  assert.equal(f.sourceSize.w,128);assert.equal(f.sourceSize.h,128);
  assert.deepEqual(f.anchor,kit.anchor);count++;
 }
 assert.equal(count,592);
});
test('spider camera anchor export updates the dependency graph after final fit',()=>{
 const bake=readFileSync(new URL('../tools/art/bake.py',import.meta.url),'utf8');
 const fitted=bake.indexOf("print('FRAMING'");const projected=bake.indexOf('origin = world_to_camera_view');
 assert.ok(bake.slice(fitted,projected).includes('bpy.context.view_layer.update()'),'final camera matrix must be evaluated before anchor export');
});
test('shadow correction preserves original spider pixels and other kit anchors',()=>{
 const hashes=['cfa9c8bd74234efd6971ed003a2c1fa341f4629e7a5d87c68b055be482355324','7dc6d9c202546e73761fe0303c1d1ce2810afc64aae02ca7f8363cb4885e4268','525c54c325226646c7304768a608788cf1caf072f349477c460c029f906c55f4'];
 hashes.forEach((h,i)=>assert.equal(createHash('sha256').update(readFileSync(new URL(`../assets/sprites/poison-spider/atlas-${i}.webp`,import.meta.url))).digest('hex'),h));
 for(const [id,y] of [['wolf',.6296268105506897],['iron-boar',.6255070865154266]])assert.equal(manifest.find(v=>v.id===id).anchor.y,y);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base=new URL('../assets/sprites/paperdoll/',import.meta.url);
const json=path=>JSON.parse(readFileSync(new URL(path,base),'utf8'));
test('delivered B sources cover all 1168 frames / 9344 3D combinations with exact alpha',()=>{
  const gate=json('validation.json');assert.equal(gate.status,'PASS');assert.equal(gate.kits.length,3);
  assert.equal(gate.kits.reduce((s,k)=>s+k.frames,0),1168);assert.equal(gate.kits.reduce((s,k)=>s+k.combinations,0),9344);
  for(const k of gate.kits){assert.equal(k.clips,48);assert.equal(k.cropped,0);assert.equal(k.tPoseFrames,0);assert.equal(k.worstPixels,0);assert.equal(k.mismatchedFrames,0);assert.ok(k.rawWorstPixels<=4);assert.ok(k.layers.every(l=>l.alphaExact));}
});
test('lazy kit manifests select shared lossless-mask/alpha pages and <=3MB total sources',()=>{
  let bytes=0;
  for(const kit of ['blade','bow','focus']) {
    const m=json(`${kit}/manifest.json`),files=new Set();assert.equal(m.kit,kit);assert.equal(m.version,'b1');
    assert.equal(Object.keys(m.animations).length,48);assert.ok(m.layout.size[0]<=2048&&m.layout.size[1]<=4096);
    for(const layer of Object.values(m.layers)) {
      assert.equal(layer.frames.length,m.frames.length);assert.match(layer.image,/\.webp$/);assert.ok(max(layer.size)<=4096);
      const file=readFileSync(new URL(`${kit}/${layer.image}`,base));assert.equal(createHash('sha256').update(file).digest('hex'),layer.sha256);
      files.add(layer.image);
    }
    assert.equal(files.size,7,'base/mask/three hats/two weapon pages only');
    for(const name of readdirSync(new URL(kit+'/',base))) assert.ok(files.has(name)||['manifest.json','validation.json'].includes(name),'obsolete source page shipped');
    bytes+=statSync(new URL(`${kit}/manifest.json`,base)).size;
    for(const file of files)bytes+=statSync(new URL(`${kit}/${file}`,base)).size;
  }
  assert.equal(bytes,json('validation.json').totalSourceBytes);assert.ok(bytes<=3_000_000,`source bytes ${bytes}`);
});
test('every family supplies real head/weapon layers for every complete clip, not palette-only weapons',()=>{
  const clips=['idle','run','attack','dodge','hit','death'].flatMap(a=>['E','SE','S','SW','W','NW','N','NE'].map(d=>`${a}_${d}`));
  for(const kit of ['blade','bow','focus']) {
    const m=json(`${kit}/manifest.json`);
    assert.deepEqual(Object.keys(m.animations).sort(),clips.sort());
    assert.deepEqual(Object.values(m.animations).flat().sort(),[...m.frames].sort());
    assert.equal(new Set(m.frames).size,m.frames.length);
    for(const [head,weapon] of ['none','knight','barbarian','mage'].flatMap(h=>['standard','alternate'].map(w=>[h,w]))) {
      const layer=m.layers[`weapon-${weapon}-${head}`];assert.ok(layer.frames.some(Boolean));
      for(const frame of layer.frames.filter(Boolean)) {
        const [index,x,y]=frame,[sx,sy,w,h]=layer.rects[index];
        assert.ok(sx>=0&&sy>=0&&w>0&&h>0&&sx+w<=layer.size[0]&&sy+h<=layer.size[1]);
        assert.ok(x>=0&&y>=0&&x+w<=128&&y+h<=128);
      }
    }
    for(const head of ['knight','barbarian','mage']) assert.ok(m.layers[`head-${head}`].frames.some(Boolean));
    assert.notEqual(m.layers['weapon-standard-none'].sha256,m.layers['weapon-alternate-none'].sha256);
  }
});
const max=a=>Math.max(...a);

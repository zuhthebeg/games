import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/gs-motion.js',import.meta.url),'utf8');
const meta=JSON.parse(source.split('export const GS_CLIPS = ')[1].split(';')[0]);
test('Paladin retains heavy and adds two guard clips with per-frame target axes',()=>{
 assert.equal(Object.keys(meta).length,18); // R5b 16 + guard/guardHit, not 15 + 2.
 for(const [name,c] of Object.entries(meta)){assert.ok(c.gripSamples.length>=2,name);assert.equal(c.gripSamples[0][0],0);assert.ok(Math.abs(c.gripSamples.at(-1)[0]-c.duration)<1e-6,name);for(const [,axis] of c.gripSamples)assert.ok(Math.abs(Math.hypot(...axis)-1)<1e-5,name);}
 assert.deepEqual(meta.heavy.impact,[37/30,41/30]);assert.equal(meta.guard.duration,29/30);
});
test('Paladin mobile geometry including existing sword stays below 4000 triangles',()=>{
 const b=readFileSync(new URL('../assets/hunter-gs.glb',import.meta.url)),g=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
 let tris=98;for(const m of g.meshes)for(const p of m.primitives)tris+=g.accessors[p.indices].count/3;
 assert.ok(tris<=4000);assert.ok(b.length<=2500000);assert.equal(g.images.length,1);assert.ok(g.animations.some(a=>a.name==='guardHit'));
});

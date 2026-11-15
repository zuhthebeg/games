import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
test('Erika exact approved binary with fourteen original clip clocks',()=>{
 const b=fs.readFileSync(new URL('assets/hunter-erika-bow.glb',root)),g=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
 assert.equal(b.length,23702900);assert.equal(g.animations.length,14);assert.equal(g.images.length,5);
 const bow=fs.readFileSync(new URL('js/bow-motion.js',root),'utf8'),meta=JSON.parse(bow.split('export const BOW_CLIPS = ')[1].split(';')[0]);
 for(const a of g.animations){assert.ok(meta[a.name],a.name);const duration=Math.max(...a.samplers.map(s=>g.accessors[s.input].max[0]));assert.ok(Math.abs(duration-meta[a.name].duration)<1e-6,a.name);}
});
test('Erika changed entry and adapter modules use one exact cache generation',()=>{
 const html=fs.readFileSync(new URL('index.html',root),'utf8');for(const n of ['main','models','game'])assert.ok(html.includes(n+'.js?v=20261115vf'),n);
 const models=fs.readFileSync(new URL('js/models.js',root),'utf8');assert.ok(models.includes('bow-motion.js?v=20261115er'));
 assert.ok(models.includes('hunter-erika-bow.glb?v=20261115er'));
});

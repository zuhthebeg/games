import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const src=fs.readFileSync(new URL('../js/db-motion.js',import.meta.url),'utf8');
const meta=JSON.parse(src.split('export const DB_CLIPS = ')[1].split('\n')[0].replace(/;$/,''));
const ctx={Object,THREE:{Vector3:class{},MathUtils:{clamp:(x,a,b)=>Math.max(a,Math.min(b,x))}}};vm.createContext(ctx);vm.runInContext(src.replace(/^import .*\n/gm,'').replace(/export /g,'')+'\nthis.name=dbClipName;this.time=dbClipTime;',ctx);
test('DB 16 baked clips, X mirror, combo and exact authoritative impact markers',()=>{
 assert.equal(Object.keys(meta).length,16);assert.equal(meta.h2.mirrored,true);
 for(const [combo,sw,name] of [[0,'h','h'],[1,'h2','h2'],[2,'h','h3'],[3,'v','v'],[-1,'spin','spin']]){
  assert.equal(ctx.name({state:'atk',combo,cur:{sw}}),name);const cur={dur:1,h0:.1,h1:.8};
  for(const [t,expected] of [[0,0],[cur.h0,meta[name].impact[0]],[cur.h1,meta[name].impact[1]],[1,meta[name].duration]])assert.ok(Math.abs(ctx.time({state:'atk',cur,t},name,meta[name])-expected)<1e-9);
 }
});
test('DB GLB retains skin and complete clips within mobile geometry budget',()=>{
 const b=fs.readFileSync(new URL('../assets/hunter-db.glb',import.meta.url));const g=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
 const tri=g.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+g.accessors[p.indices].count/3,0);
 assert.ok(tri+64<=4000);assert.ok(b.length<2500000);assert.ok(g.skins.length>0);assert.equal(g.animations.length,16);
 for(const a of g.animations){assert.ok(meta[a.name]);assert.ok(a.channels.length>60);}
});

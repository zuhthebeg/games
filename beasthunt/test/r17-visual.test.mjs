import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {measure as measureDb} from './r17-db-measure.mjs';
import {measure as measureWarrok,measureSync} from './r17-warrok-measure.mjs';
let db,warrok;
const save=(name,r)=>{if(process.env.R17_REPORT_DIR)fs.writeFileSync(process.env.R17_REPORT_DIR+'/'+name+'.json',JSON.stringify(r,null,2));};
test('R17b Warrok exact thirteen clips: whole skin/weapon reference frustum, grip and attack tip clearances',async()=>{
 warrok=await measureWarrok();save('warrok',warrok);const r=warrok.after;
 assert.equal(Object.keys(r.clips).length,13);assert.equal(r.outside,0);assert.equal(r.verticesOutside,0);assert.ok(r.gripMax<=.02);assert.ok(r.triangles<=200);assert.equal(r.bladeLength,2.43*2); // R21 palm-to-tip length; body x1.25 unchanged.
 for(const n of ['swipe','smash','spin','rush','leap','cast'])assert.ok(r.clips[n].tipMin>=(n==='smash'?-.15:-.05),n+' tip '+r.clips[n].tipMin);
 assert.ok(Math.abs(r.modelScale/warrok['reference1.0'].modelScale-1.25)<1e-12);
});
test('R17b single floor owner matches full CPU skin within 3cm, final skin >= -2cm, zero paused accumulation',()=>{
 // Parent explicitly replaced R17 toe-centre>=0/skin>=0 by skin>=-2cm.
 // Bone centres are not soles. This is not a relaxation of the original 245 tests.
 for(const r of Object.values(warrok))for(const [n,c]of Object.entries(r.clips)){
  assert.equal(c.samples,101);assert.ok(c.approxErrorMax<=.03,n+' support error');assert.ok(c.skinMin>=-.02,n+' skin floor');assert.equal(c.repeatDeltaMax,0,n+' paused owner');assert.equal(c.airborneLiftMax,0,n+' airborne preserved');
 }
 assert.ok(warrok.after.clips.leap.airborneCount>0,'leap not clamped to floor');
});
test('R17b measured blade axes preserve palm contact and all sixteen finite exported clips',async()=>{
 db=await measureDb();save('db',db);for(const r of Object.values(db)){
 assert.equal(Object.keys(r.clips).length,16);
 for(const [n,c]of Object.entries(r.clips))for(const s of Object.values(c)){
  assert.ok(s.gripMax<=.02,n+' palm');assert.ok(Number.isFinite(s.elevationMin)&&Number.isFinite(s.elevationMax));assert.ok(s.radialMin>=-1.00000001&&s.radialMin<=1.00000001);
 }}
 for(const side of ['Left','Right']){assert.deepEqual(db.C.sockets[side].p,db.before.sockets[side].p);assert.ok(db.C.clips.spin[side].tipMin>=-.05);}
});
test('R17b REQUIRED C spin both blades outward, elevation no worse than accepted Paladin plus 5 degrees',()=>{
 // Parent retired +/-30 because the accepted Paladin itself peaks at 43 degrees.
 // No universal horizontal clamp or frame-dependent radial steering is allowed.
 for(const side of ['Left','Right']){const s=db.C.clips.spin[side],p=db.paladin.clips.spin[side];assert.equal(s.activeCount,385);assert.ok(s.activeRadialMin>0,side+' radial');assert.ok(s.activeElevationMax<=p.activeElevationMax+5,side+' relative elevation');}
});
test('R17b C idle and four walk clips carry downward/not upright, tips above -5cm',()=>{
 for(const n of ['idle','walkF','walkB','walkL','walkR'])for(const s of Object.values(db.C.clips[n])){assert.ok(s.tipMin>=-.05,n+' tip');assert.ok(s.elevationMax<45,n+' not upright');}
});
test('R17b changed transitive floor/motion modules share the vf entry generation and no duplicate normalize lift',()=>{
 const get=n=>fs.readFileSync(new URL('../'+n,import.meta.url),'utf8');
 assert.ok(get('js/models.js').includes('warrok-motion.js?v=20261115vf'));assert.ok(get('js/warrok-motion.js').includes('warrok-floor.js?v=20261115vf'));
 assert.ok(!get('js/models.js').includes('model.position.y = -box.min.y * k'));
 const floor=get('js/warrok-floor.js');assert.ok(!floor.includes('getVertexPosition('));assert.ok(!floor.includes('.geometry'));assert.ok(floor.includes('Math.max(0,-supportMin)'));
});

test('R17b Warrok production sync all ordered cross-fades, interruption, dt0 and airborne root retain single floor owner',async()=>{
 const r=await measureSync();save('warrok-sync',r);assert.equal(r.pairs,169);assert.equal(r.samples,2197);assert.ok(r.approxErrorMax<=.03,'cross-fade support error '+r.approxErrorMax);assert.ok(r.skinMin>=-.02,'cross-fade skin '+r.skinMin);assert.ok(r.repeatDeltaMax<1e-10,'dt0 lift delta '+r.repeatDeltaMax);assert.equal(r.airborneLift,0);
});

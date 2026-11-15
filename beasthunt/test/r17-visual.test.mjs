import test from 'node:test';
import assert from 'node:assert/strict';
import {measure as measureDb} from './r17-db-measure.mjs';
import {measure as measureWarrok} from './r17-warrok-measure.mjs';
let db,warrok;
test('R17 Warrok exact exported thirteen clips: all skin/weapon vertices in reference frustum and attack tip clearances',async()=>{
 warrok=await measureWarrok();const r=warrok.after;
 assert.equal(Object.keys(r.clips).length,13);assert.equal(r.outside,0);assert.equal(r.verticesOutside,0);assert.ok(r.gripMax<=.02);
 for(const n of ['swipe','smash','spin','rush','leap','cast'])assert.ok(r.clips[n].tipMin>=(n==='smash'?-.15:-.05),n+' tip '+r.clips[n].tipMin);
 for(const [n,c]of Object.entries(r.clips)){assert.ok(c.feetMin>=-1e-8,n+' toe floor');assert.ok(c.skinMin>=-1e-8,n+' skin floor');}
 assert.ok(Math.abs(r.modelScale/warrok.before.modelScale-1.25)<1e-12);
});
test('R17 measured blade axes preserve palm contact and attack-set finite replay',async()=>{
 db=await measureDb();for(const r of Object.values(db))for(const [n,c]of Object.entries(r.clips))for(const s of Object.values(c)){
 assert.ok(s.gripMax<=.02,n+' palm');assert.ok(Number.isFinite(s.elevationMin)&&Number.isFinite(s.elevationMax));assert.ok(s.radialMin>=-1.00000001&&s.radialMin<=1.00000001);
 }
 for(const side of ['Left','Right']){assert.deepEqual(db.after.sockets[side].p,db.before.sockets[side].p);assert.ok(db.after.clips.spin[side].tipMin>=-.05);}
});
test('R17 REQUIRED spin both blades within horizontal +/-30 degrees and outward on every active intermediate sample',async()=>{
 db ||= await measureDb();const failures=[];for(const side of ['Left','Right']){const s=db.after.clips.spin[side];if(s.activeElevationMax>30)failures.push(side+' elevation '+s.activeElevationMax.toFixed(3)+' >30 degrees');if(s.activeRadialMin<=0)failures.push(side+' radial '+s.activeRadialMin.toFixed(4)+' <=0');}
 assert.deepEqual(failures,[],'R17 BLOCKED: measured wrist->Middle1 alone does not meet requested spin target; do not relax this gate');
});

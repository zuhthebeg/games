import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three.module.min.js';
import {gsClipName,gsClipTime} from '../js/gs-phase.js';
import {WTYPES} from '../js/data.js';
const src=fs.readFileSync(new URL('../js/gs-impact.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
const c={THREE};vm.createContext(c);vm.runInContext(src+';this.api={GSImpacts,crossedImpact,chargeTier};',c);
const {GSImpacts,crossedImpact,chargeTier}=c.api;
test('heavy mapping is distinct locally and for remote move-only poses; h0/h1 exact',()=>{
 const a=WTYPES.gs.heavy,p={weapon:'gs',state:'atk',cur:a,t:a.h0};assert.equal(gsClipName(p),'heavy');
 const meta={duration:65/30,impact:[32/30,39/30]};assert.equal(gsClipTime(p,meta),meta.impact[0]);p.t=a.h1;assert.equal(gsClipTime(p,meta),meta.impact[1]);
 assert.equal(gsClipName({...p,cur:WTYPES.gs.light[0],combo:0}),'v');
});
test('impact crosses once, resets for new attacks, never mutates pose',()=>{
 const p={weapon:'gs',state:'atk',cur:WTYPES.gs.heavy,combo:-1,t:.27,frac:1},v={},before=JSON.stringify(p);
 assert.equal(crossedImpact(p,v),false);assert.equal(JSON.stringify(p),before);p.t=.3;assert.equal(crossedImpact(p,v),true);assert.equal(crossedImpact(p,v),false);
 p.t=0;assert.equal(crossedImpact(p,v),false);p.t=.5;assert.equal(crossedImpact(p,v),true);
 assert.equal(crossedImpact({...p,weapon:'db'},{}),false);assert.deepEqual([0,.4,1].map(frac=>chargeTier({frac})),[0,1,2]);
});
test('bounded pooled rings fade at 350ms, cracks at 1500ms; lowfx ring only',()=>{
 for(const low of [false,true]){const fx=new GSImpacts(new THREE.Scene(),low),p={x:0,z:0,yaw:0,frac:1};
 for(let i=0;i<25;i++)fx.spawn(p);assert.equal(fx.pool.length,8);const f=fx.pool[(fx.cursor-1)%8];assert.ok(f.r.visible);assert.equal(!!f.d,!low);
 fx.update(.36);assert.equal(f.r.visible,false);if(f.d)assert.ok(f.d.visible);fx.update(1.2);if(f.d)assert.equal(f.d.visible,false);
 }
});

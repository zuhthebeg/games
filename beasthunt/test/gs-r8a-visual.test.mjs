import test from 'node:test';
import assert from 'node:assert/strict';
import { GS_EDGE, gsEdgeRoll } from '../js/gs-edge.js';
import { chargeVisualState, gsClipTime } from '../js/gs-phase.js';

test('R8a roll metadata covers every blade clip without gameplay state',()=>{
 assert.deepEqual(Object.keys(GS_EDGE).sort(),['h','h2','heavy','other','spin','v']);
 assert.equal(gsEdgeRoll('guard',.5),0);assert.equal(gsEdgeRoll('charge',.5),0);
 for(const [name,meta] of Object.entries(GS_EDGE)){
  for(let i=0;i<=240;i++)assert.ok(Number.isFinite(gsEdgeRoll(name,i/240)));
  if(meta.rollSamples){assert.equal(meta.rollSamples.length,121);assert.equal(gsEdgeRoll(name,-1),meta.rollSamples[0]);assert.equal(gsEdgeRoll(name,2),meta.rollSamples.at(-1));}
 }
});
test('R8a grounded charge windup progresses continuously and never loops at max',()=>{
 const meta={duration:1.8,windup:[.25,.55]};let last=-1;
 for(let i=0;i<=300;i++){const t=i/60,value=gsClipTime({state:'charge',t,clv:Math.min(2,Math.floor(t/.5))},meta);assert.ok(value>=last);assert.ok(value>=.25&&value<=.55);last=value;}
 assert.equal(gsClipTime({state:'charge',t:4},meta),.55);
});
test('R8a charge visual stages are GS-only, bounded, render-read-only',()=>{
 const p={weapon:'gs',state:'charge',t:0};
 for(const [t,stage,ratio]of [[0,0,0],[.5,1,1/3],[1,2,2/3],[1.5,3,1],[9,3,1]]){
  p.t=t;const before=JSON.stringify(p);assert.deepEqual(chargeVisualState(p),{active:true,ratio,stage});assert.equal(JSON.stringify(p),before);
 }
 for(const weapon of ['db','bow'])assert.deepEqual(chargeVisualState({...p,weapon}),{active:false,ratio:0,stage:-1});
 for(const state of ['idle','atk','guard','roll','down'])assert.equal(chargeVisualState({...p,state}).active,false);
});

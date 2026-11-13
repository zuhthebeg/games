import test from 'node:test';
import assert from 'node:assert/strict';
import { gsClipName, gsClipTime, GS_STATE_SECONDS } from '../js/gs-phase.js';
import { WTYPES } from '../js/data.js';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../js/gs-motion.js',import.meta.url),'utf8');
const meta=JSON.parse(source.split('export const GS_CLIPS = ')[1].split(';')[0]);
test('GS each sim h0/h1 maps exactly to distinct baked hit markers without changing sim',()=>{
 for(const a of [...WTYPES.gs.light,WTYPES.gs.heavy,...['h2','spin','other'].map(sw=>({...WTYPES.gs.light[0],sw}))]){
  const p={state:'atk',t:0,cur:a},c=meta[gsClipName(p)];
  assert.equal(gsClipTime(p,c),0);p.t=a.h0;assert.equal(gsClipTime(p,c),c.impact[0]);
  p.t=a.h1;assert.ok(Math.abs(gsClipTime(p,c)-c.impact[1])<1e-10);
  p.t=a.dur;assert.ok(Math.abs(gsClipTime(p,c)-c.duration)<1e-10);
  let last=-1;for(let i=0;i<=100;i++){p.t=a.dur*i/100;const time=gsClipTime(p,c);assert.ok(time>=last-1e-10);last=time;}
 }
});
test('GS statuses fit sim presentation windows; roll and drink have independent clips',()=>{
 for(const [state,dur] of Object.entries(GS_STATE_SECONDS))assert.equal(gsClipTime({state,t:dur},meta[state]),meta[state].duration);
 assert.equal(gsClipName({state:'idle',moving:0}),'idle');assert.equal(gsClipName({state:'idle',moving:1}),'walk');
 assert.equal(gsClipName({state:'atk',cur:{sw:'v'}}),'v');assert.equal(gsClipName({state:'atk',cur:{sw:'bow'}}),'other');
});
test('GS runtime artifact contains one rig, all selected animations and one embedded diffuse',()=>{
 const b=readFileSync(new URL('../assets/hunter-gs.glb',import.meta.url));const g=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
 assert.equal(b.toString('ascii',0,4),'glTF');assert.ok(b.length<=2500000);assert.equal(g.images.length,1);assert.equal(g.images[0].mimeType,"image/jpeg");assert.ok(meta.guard&&meta.guardHit&&meta.heavy);assert.equal(g.skins.length,1);
 assert.deepEqual(g.animations.map(a=>a.name).sort(),Object.keys(meta).sort());
});

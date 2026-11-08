import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudSave, snapshot } from '../js/meta/cloud-save.js';
import { createSave } from '../js/meta/save.js';
const key='arpg.save.v1', side=key+'.cloud-owner.v1';
const save=()=>createSave({name:'OwnerA',answers:[0,0,0,0,0],createdAt:10});
const tick=()=>new Promise(r=>setImmediate(r));
function defer(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function rig(bytes=new Map([['relay_token','A1']])) {
 const puts=[];let remote=[],gate=null;
 const storage={getItem:k=>bytes.get(k)??null,setItem:(k,v)=>bytes.set(k,v)};
 globalThis.window={addEventListener:()=>{}};
 const c=new CloudSave({storage,now:()=>100000,timer:()=>0,cancelTimer:()=>{},fetcher:async(u,o)=>{
  if(u.endsWith('/me')){if(gate)await gate.promise;return {ok:true,json:async()=>({id:'A'})};}
  if(o.method==='PUT'){puts.push(JSON.parse(o.body));return {ok:true,status:200};}
  return {ok:true,json:async()=>({characters:remote})};
 }});
 return {c,puts,bytes,storage,gate:d=>gate=d,remote:s=>remote=[{charId:'human',data:snapshot(s)}]};
}
async function established(){const h=rig();h.remote(save());await h.c.load();const s=h.c.restore('human');return {h,s};}
test('CS2 content proof holds same-timestamp unknown replacement after reload',async()=>{
 const {h,s}=await established();s.name='UnknownOwner';s.gold++;const raw=JSON.stringify(s);h.bytes.set(key,raw);const r=rig(h.bytes);await r.c.load();r.c.changed(s);await tick();await r.c.flush({hidden:true});assert.equal(r.puts.length,0);assert.equal(r.bytes.get(key),raw);
});
test('CS2 failed restore staged proof cannot bind even identical later local content',async()=>{
 const h=rig(),s=save();h.remote(s);await h.c.load();const write=h.storage.setItem;h.storage.setItem=(k,v)=>{if(k===key)throw Error('quota');write(k,v);};assert.throws(()=>h.c.restore('human'));assert.equal(JSON.parse(h.bytes.get(side)).committed,false);h.bytes.set(key,JSON.stringify(s));const r=rig(h.bytes);await r.c.load();r.c.changed(s);await tick();await r.c.flush({hidden:true});assert.equal(r.puts.length,0);
});
test('CS2 persisted byte equality is rechecked after auth even for identical snapshot JSON',async()=>{
 const {h,s}=await established();h.c.changed(s);assert.equal(h.c.pending.size,1);const d=defer();h.gate(d);h.bytes.set('relay_token','A2');const flushing=h.c.flush({hidden:true});await tick();h.bytes.set(key,JSON.stringify(s,null,2));d.resolve();await flushing;assert.equal(h.puts.length,0);assert.equal(h.bytes.get(key),JSON.stringify(s,null,2));
});
test('CS2 final owner-proof commit failure remains staged and unusable on reload',async()=>{
 const h=rig(),s=save();h.remote(s);await h.c.load();const write=h.storage.setItem;h.storage.setItem=(k,v)=>{if(k===side&&JSON.parse(v).committed===true)throw Error('quota');write(k,v);};assert.throws(()=>h.c.restore('human'));assert.equal(JSON.parse(h.bytes.get(side)).committed,false);const r=rig(h.bytes);await r.c.load();r.c.changed(JSON.parse(r.bytes.get(key)));await tick();await r.c.flush({hidden:true});assert.equal(r.puts.length,0);
});
test('CS2 only unchanged proven content remains eligible; normal local progression is held',async()=>{
 const {h,s}=await established();h.c.changed(s);await h.c.flush({hidden:true});assert.equal(h.puts.length,1);s.gold++;h.bytes.set(key,JSON.stringify(s));h.c.changed(s);await tick();await h.c.flush({hidden:true});assert.equal(h.puts.length,1);assert.equal(JSON.parse(h.bytes.get(key)).gold,s.gold);
});

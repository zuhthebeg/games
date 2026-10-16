import test from 'node:test';
import assert from 'node:assert/strict';
import { PaperdollLibrary } from '../js/render/paperdoll-library.js';
const asset=key=>({key,metrics:{outputRGBABytes:4}});
const bounded=p=>Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(Error('queue blocked')),200))]);
test('all consumers abort releases hanging shared queue; stale result disposed, retry safe',async()=>{
 let finish;const disposed=[],calls=[];const c=new PaperdollLibrary({compose:(d,s)=>{calls.push([d.key,s]);return d.key==='old'?new Promise(r=>finish=r):Promise.resolve(asset(d.key));},dispose:a=>disposed.push(a.key)});
 const a=new AbortController(),b=new AbortController();const x=c.acquire({key:'old'},a.signal),y=c.acquire({key:'old'},b.signal);const rejected=Promise.all([assert.rejects(x),assert.rejects(y)]);await new Promise(r=>setTimeout(r,0));a.abort();b.abort();const next=await bounded(c.acquire({key:'human'}));await rejected;assert.equal(calls[0][1].aborted,true);finish(asset('old'));await new Promise(r=>setTimeout(r,0));assert.deepEqual(disposed,['old']);next.release();assert.equal(c.status().references,0);
});
test('one consumer abort never cancels remaining owner; release is idempotent',async()=>{
 let finish,signal;const c=new PaperdollLibrary({compose:(d,s)=>{signal=s;return new Promise(r=>finish=r);},dispose:()=>{}});const a=new AbortController();const x=c.acquire({key:'A'},a.signal),y=c.acquire({key:'A'});const rejected=assert.rejects(x);await new Promise(r=>setTimeout(r,0));a.abort();await bounded(rejected);assert.equal(signal.aborted,false);finish(asset('A'));const l=await y;l.release();l.release();assert.equal(c.status().references,0);
});
test('deadline frees queue even non-cooperative compose; queued cancellation skips compose',async()=>{
 const calls=[];const c=new PaperdollLibrary({timeoutMs:25,compose:d=>{calls.push(d.key);return d.key==='hung'?new Promise(()=>{}):Promise.resolve(asset(d.key));},dispose:()=>{}});const h=c.acquire({key:'hung'});const rejected=assert.rejects(h,/deadline/);const a=new AbortController();const q=c.acquire({key:'skip'},a.signal);const cancelled=assert.rejects(q);a.abort();const l=await bounded(c.acquire({key:'human'}));await Promise.all([rejected,cancelled]);l.release();assert.deepEqual(calls,['hung','human']);assert.equal(c.status().references,0);
});

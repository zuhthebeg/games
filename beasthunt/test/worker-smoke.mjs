// Browser module-worker verification. No coop UI or live relay is exercised.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire('/home/cocy/.openclaw/workspace/');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/beasthunt/test/worker-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Worker test</title>'}));
  await page.goto('http://127.0.0.1:8791/beasthunt/test/worker-fixture');
  const result=await page.evaluate(async()=>{
    const {QUESTS}=await import('/beasthunt/js/data.js');
    // Emulate main-document timer throttling without modifying worker globals.
    const mainInterval=window.setInterval;
    window.setInterval=(fn,ms,...args)=>mainInterval(fn,Math.max(ms,1000),...args);
    const save={weapon:'gs',w:{gs:1,db:1,bow:1},armor:1};
    const w=new Worker('/beasthunt/js/net/worker.js',{type:'module'});
    let snapshots=0,lastTick=0;const ticks=[];
    const done=new Promise((resolve,reject)=>{
      w.onerror=e=>reject(new Error(e.message));
      w.onmessage=({data})=>{
        if(data.type==='state'){snapshots++;lastTick=data.packet.payload.k;ticks.push(lastTick);}
        if(data.type==='snapshot')resolve({snapshots,lastTick,tick:data.snapshot.tick,ticks});
      };
    });
    w.postMessage({type:'init',options:{quest:QUESTS[0],roster:{host:{save},guest:{save}},seed:42,hunt:'h',host:'host'}});
    await new Promise(r=>setTimeout(r,2200));
    w.postMessage({type:'snapshot',request:1});
    const result=await done;w.terminate();window.setInterval=mainInterval;return result;
  });
  assert.ok(result.tick>=110,'worker maintained 60Hz: '+result.tick);
  assert.ok(result.snapshots>=27);assert.ok(result.ticks.every((t,i,a)=>i===0 || t-a[i-1]===4));
  assert.deepEqual(errors,[]);console.log('PASS worker with main timers clamped to 1Hz '+JSON.stringify(result));
}finally{await browser.close();}

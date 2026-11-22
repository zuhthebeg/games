import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Execute the actual entry handlers with only optional primer storage faulted.
function harness(locale, {readFault=false, writeFault=false, primedStored=false, permission='prompt', inapp=false}={}) {
  const html=readFileSync(new URL('../'+(locale?locale+'/':'')+'index.html',import.meta.url),'utf8');
  const code=html.slice(html.indexOf('/* ---- 인앱 브라우저 ----'),html.indexOf('async function resampleTo16k'));
  assert.ok(code.includes('async function startRec(primed)'));
  const elements=new Map(), listeners={};
  const calls={permission:0, media:0, reads:0, writes:0};
  const el=id=>{
    if(!elements.has(id)) {
      const classes=new Set(['hidden']);
      elements.set(id,{textContent:'',innerHTML:'',style:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)}});
    }
    return elements.get(id);
  };
  const storage={getItem(k){if(k==='vm_mic_primed'){calls.reads++;if(readFault)throw new DOMException('blocked','SecurityError');}return k==='vm_mic_primed'&&primedStored?'1':null;},setItem(k){if(k==='vm_mic_primed'){calls.writes++;if(writeFault)throw new DOMException('blocked','SecurityError');}}};
  const ctx=vm.createContext({
    navigator:{userAgent:inapp?'Mozilla/5.0 Threads Android':'Mozilla/5.0 Chrome Android',permissions:{async query(){calls.permission++;if(permission==='reject')throw Error('no API');return {state:permission};}},mediaDevices:{async getUserMedia(){calls.media++;throw Error('synthetic denied');}}},
    localStorage:storage,DOMException,document:{addEventListener:(ev,fn)=>listeners[ev]=fn},
    location:{href:'https://fixture.invalid/voicematch/',reload(){}},dataLayer:[],
    $:el,t:k=>k,show:s=>ctx.screen=s,clearDailyResult(){},dailyAudioDay:null,appendNext:false,dailyDayUTC:()=> '20261122',vmEv(){},console
  });
  vm.runInContext(code,ctx);
  listeners.DOMContentLoaded();
  return {ctx,el,calls,run:s=>vm.runInContext(s,ctx)};
}
for(const locale of ['','ko','en','ja','es','pt','tw','id']){
  const name=locale||'root';
  for(const permission of ['denied','prompt','granted','reject']) test(`${name} primed read SecurityError ${permission} follows permission path`,async()=>{
    const h=harness(locale,{readFault:true,permission});
    await assert.doesNotReject(h.run('startRec(false)'));
    assert.equal(h.calls.reads,1);
    assert.equal(h.calls.permission,1);
    if(permission==='granted'){
      assert.equal(h.calls.media,1);assert.equal(h.ctx.screen,'s-err');
      assert.equal(h.el('mic-sheet').classList.contains('hidden'),true);
    }else{
      assert.equal(h.calls.media,0);assert.equal(h.el('mic-sheet').classList.contains('hidden'),false);
      h.el('mic-go').onclick();
      await new Promise(resolve=>setImmediate(resolve));
      assert.equal(h.calls.media,1);
      assert.equal(h.el('mic-sheet').classList.contains('hidden'),true);
      assert.equal(h.ctx.screen,'s-err');
    }
  });
  test(`${name} stored primer still skips permission query`,async()=>{
    const h=harness(locale,{primedStored:true,permission:'denied'});
    await h.run('startRec(false)');
    assert.equal(h.calls.permission,0);assert.equal(h.calls.media,1);
    assert.equal(h.el('mic-sheet').classList.contains('hidden'),true);
  });
  test(`${name} primed write SecurityError permits Continue and retry`,async()=>{
    const h=harness(locale,{writeFault:true,permission:'prompt'});
    await h.run('startRec(false)');
    assert.doesNotThrow(()=>h.el('mic-go').onclick());
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.calls.writes,1);assert.equal(h.calls.media,1);
    assert.equal(h.el('mic-sheet').classList.contains('hidden'),true);
    assert.equal(h.ctx.screen,'s-err');
    h.el('btn-restart').onclick();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.calls.media,2);assert.equal(h.ctx.screen,'s-err');
  });
  test(`${name} IAB advisory Continue survives primed storage denial`,async()=>{
    const h=harness(locale,{readFault:true,writeFault:true,permission:'granted',inapp:true});
    await assert.doesNotReject(h.run('startRec(false)'));
    assert.equal(h.calls.permission,0);assert.equal(h.calls.media,0);
    assert.equal(h.el('mic-sheet').classList.contains('hidden'),false);
    assert.doesNotThrow(()=>h.el('mic-go').onclick());
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.calls.media,1);assert.equal(h.ctx.screen,'s-err');
  });
}

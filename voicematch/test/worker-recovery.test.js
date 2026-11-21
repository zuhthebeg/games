import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const pages=['','ko','en','ja','es','pt','tw','id'];
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function harness(locale=''){
 const html=readFileSync(new URL('../'+(locale?locale+'/':'')+'index.html',import.meta.url),'utf8');
 const start=html.indexOf('const worker=new Worker')>=0?html.indexOf('const worker=new Worker'):html.indexOf('let worker=null');
 const model=html.slice(start,html.indexOf('/* ---- 녹음 ---- */'));
 const analysis=html.slice(html.indexOf('async function analyzePcm('),html.indexOf('/* 결과 화면의 누적 녹음 안내.'));
 const nodes=new Map(),workers=[],timers=new Map();let seq=0;
 const el=id=>{if(!nodes.has(id))nodes.set(id,{style:{},innerHTML:'',textContent:''});return nodes.get(id);};
 class Worker{
  constructor(){this.listeners=new Map();this.posts=[];this.dead=false;workers.push(this);}
  addEventListener(k,f){if(!this.listeners.has(k))this.listeners.set(k,new Set());this.listeners.get(k).add(f);}
  removeEventListener(k,f){this.listeners.get(k)?.delete(f);}
  postMessage(m){if(this.throwPost)throw Error('post failed');this.posts.push(m);}
  terminate(){this.dead=true;}
  emit(k,data){for(const f of [...(this.listeners.get(k)||[])])f(k==='message'?{data}:{preventDefault(){}});}
  count(){return [...this.listeners.values()].reduce((n,s)=>n+s.size,0);}
 }
 const ctx=vm.createContext({Worker,AbortController,Float32Array,Uint8Array,console,window:{},LANG:'en',$:el,t:k=>k,
  setTimeout:(fn,ms)=>{timers.set(++seq,{fn,ms});return seq;},clearTimeout:id=>timers.delete(id),
  fetch:async url=>({json:async()=>[],headers:{get:()=>4},body:{getReader:()=>({read:async()=>({done:true})})}}),updateIntroPoolBtn(){},
  dailyDayUTC:()=> '20261121',dailyAudioDay:null,takeCount:0,appendNext:false,lastPitch:null,dataLayer:[],
  clearDailyResult(){},resampleTo16k:async p=>p,vmEv(){},setDailyResult(q,day){ctx.ownedDay=day;},saveDuetSelf(){},
  renderResult(){ctx.renders=(ctx.renders||0)+1;},renderAddTake(){},show:s=>ctx.screen=s,
  location:{reload(){ctx.reloads=(ctx.reloads||0)+1;}}});
 vm.runInContext(model+html.slice(html.indexOf('function resetErrBtn(){'),html.indexOf('function showMicSheet(){'))+analysis,ctx);
 const run=s=>vm.runInContext(s,ctx);
 return {ctx,workers,timers,nodes,run,el,fire:ms=>{const pair=[...timers].find(([,t])=>t.ms===ms);assert.ok(pair,'finite deadline '+ms);timers.delete(pair[0]);pair[1].fn();}};
}
async function ready(h){const p=h.run('loadModel()');await flush();h.workers.at(-1).emit('message',{type:'ready'});await p;return h.workers.at(-1);}
for(const locale of pages){
 for(const phase of ['init','inference'])for(const event of ['error','messageerror'])test((locale||'root')+' '+phase+' '+event+' rejects, cleans, fresh retry isolates stale replies',async()=>{
  const h=harness(locale);if(phase==='inference')await ready(h);
  let settled=false;const p=(phase==='init'?h.run('loadModel()').catch(()=>{}):h.run('analyzePcm(new Float32Array(48000),16000,false)')).then(()=>settled=true);
  await flush();const old=h.workers.at(-1);old.emit(event);await flush();
  assert.equal(settled,true,'Worker event must settle pending handler');await p;
  assert.equal(old.dead,true);assert.equal(old.count(),0);assert.equal(h.timers.size,0);
  const fresh=h.run('loadModel()');await flush();const w=h.workers.at(-1);assert.notEqual(w,old);
  old.emit('message',{type:'ready'});old.emit('message',{type:'result',rank:[]});assert.equal(h.run('workerReady'),false);
  w.emit('message',{type:'ready'});await fresh;assert.equal(h.run('workerReady'),true);
 });
 for(const phase of ['init','inference'])test((locale||'root')+' '+phase+' finite deadline',async()=>{
  const h=harness(locale);if(phase==='inference')await ready(h);
  let settled=false;const p=(phase==='init'?h.run('loadModel()').catch(()=>{}):h.run('analyzePcm(new Float32Array(48000),16000,false)')).then(()=>settled=true);
  await flush();const ms=phase==='init'?180000:90000;h.fire(ms);await flush();assert.equal(settled,true);await p;
  assert.equal(h.workers.at(-1).dead,true);assert.equal(h.workers.at(-1).count(),0);assert.equal(h.timers.size,0);
 });
 test((locale||'root')+' shared init and analysis success retain day/append and one result',async()=>{
  const h=harness(locale);const a=h.run('loadModel()'),b=h.run('loadModel()');assert.equal(a,b);await flush();const w=h.workers.at(-1);w.emit('message',{type:'ready'});await Promise.all([a,b]);
  const p=h.run("analyzePcm(new Float32Array(48000),16000,true,'20261120')"),q=h.run('analyzePcm(new Float32Array(48000),16000,false)');await flush();
  assert.equal(w.posts.filter(p=>p.type==='analyze').length,1,'concurrent calls must not duplicate analysis');
  assert.equal(w.posts.at(-1).append,true);w.emit('message',{type:'progress',done:1});w.emit('message',{type:'result',q:[1],rank:[],takes:2});await Promise.all([p,q]);
  assert.equal(h.ctx.renders,1);assert.equal(h.ctx.ownedDay,'20261120');assert.equal(h.run('takeCount'),2);assert.equal(h.timers.size,0);
 });
}

// These edge fixtures execute the same inline lifecycle, with deliberately deferred platform responses.
test('initialization waiters reject together and retry does not reuse rejection',async()=>{
 const h=harness();const a=h.run('loadModel()'),b=h.run('loadModel()');
 const settled=Promise.allSettled([a,b]);await flush();h.workers[0].emit('messageerror');
 const outcomes=await settled;assert.ok(outcomes.every(o=>o.status==='rejected'));
 assert.equal(outcomes[0].reason,outcomes[1].reason);assert.equal(h.timers.size,0);
 await ready(h);assert.equal(h.workers.length,2);
});
test('deadline covers stalled download; late fetch cannot mutate new cache/progress or post init',async()=>{
 const h=harness(),releases=[];h.ctx.fetch=()=>new Promise(r=>releases.push(r));
 const p=h.run('loadModel()').catch(()=>{});await flush();const old=h.workers[0];
 h.fire(180000);await p;assert.equal(old.dead,true);
 h.ctx.fetch=async()=>({json:async()=>['fresh'],headers:{get:()=>4},body:{getReader:()=>({read:async()=>({done:true})})}});
 await ready(h);h.el('ana-s').textContent='fresh progress';
 releases[0]({json:async()=>['stale']});
 releases[1]({headers:{get:()=>4},body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array([1])})})}});
 await flush();assert.equal(old.posts.length,0);assert.equal(h.el('ana-s').textContent,'fresh progress');assert.deepEqual([...h.ctx.window._singersCache],['fresh']);
});
test('constructor, init post and inference post throws settle without retained timers',async()=>{
 const h=harness(),Original=h.ctx.Worker;h.ctx.Worker=class{constructor(){throw Error('constructor');}};
 await assert.rejects(h.run('loadModel()'),/constructor/);assert.equal(h.timers.size,0);h.ctx.Worker=Original;
 const init=h.run('loadModel()');h.workers[0].throwPost=true;await assert.rejects(init,/post failed/);
 assert.equal(h.workers[0].count(),0);assert.equal(h.timers.size,0);
 const w=await ready(h);w.throwPost=true;await h.run('analyzePcm(new Float32Array(48000),16000,false)');
 assert.equal(h.ctx.screen,'s-err');assert.equal(w.dead,true);assert.equal(w.count(),0);assert.equal(h.timers.size,0);
});
test('structured init/inference errors poison generation; silence remains a completed non-result take',async()=>{
 const h=harness();const p=h.run('loadModel()');await flush();h.workers[0].emit('message',{type:'error',message:'init'});await assert.rejects(p,/init/);
 const w=await ready(h);const a=h.run('analyzePcm(new Float32Array(48000),16000,false)');await flush();w.emit('message',{type:'error',message:'inference'});await a;assert.equal(w.dead,true);
 const fresh=await ready(h);const b=h.run('analyzePcm(new Float32Array(48000),16000,false)');await flush();fresh.emit('message',{type:'result',error:'silent'});await b;
 assert.equal(h.ctx.screen,'s-err');assert.equal(h.el('err-t').innerHTML,'errSilent');assert.equal(h.run('takeCount'),0);assert.equal(fresh.dead,false);assert.equal(h.timers.size,0);
 h.el('btn-restart').onclick();assert.equal(h.ctx.reloads,1);
});

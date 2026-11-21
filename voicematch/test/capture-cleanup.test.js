import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Removing setup catch/cleanup must strand resources or reject these actual-source calls.
function harness(locale='',failure='',cleanupThrow=false){
 const html=readFileSync(new URL('../'+(locale?locale+'/':'')+'index.html',import.meta.url),'utf8');
 const code=html.slice(html.indexOf('/* ---- 녹음 ---- */'),html.indexOf('async function resampleTo16k'));
 const nodes=new Map(),timers=new Map(),tracks=[],contexts=[],sources=[],processors=[];let seq=0,fail=failure;
 const hit=k=>{if(fail===k)throw Error(k);};
 const el=id=>{if(!nodes.has(id))nodes.set(id,{style:{},children:[{style:{}}],innerHTML:'',textContent:''});return nodes.get(id);};
 class AudioContext{
  constructor(){hit('context');this.sampleRate=16000;this.destination={};contexts.push(this);}
  createMediaStreamSource(){hit('source');const s={disconnected:false,connect(){hit('source.connect');},disconnect(){this.disconnected=true;if(cleanupThrow)throw Error('disconnect');}};sources.push(s);return s;}
  createScriptProcessor(){hit('processor');const p={disconnected:false,onaudioprocess:null,connect(){hit('processor.connect');},disconnect(){this.disconnected=true;if(cleanupThrow)throw Error('disconnect');}};processors.push(p);return p;}
  close(){this.closed=true;if(cleanupThrow)return Promise.reject(Error('close'));return Promise.resolve();}
 }
 const ctx=vm.createContext({window:{AudioContext},navigator:{mediaDevices:{async getUserMedia(){hit('permission');const ts=[0,1].map(()=>({stopped:false,stop(){this.stopped=true;if(cleanupThrow)throw Error('stop');}}));tracks.push(...ts);return{getTracks:()=>ts};}}},
 document:{addEventListener(){}},localStorage:{getItem(){return null;},setItem(){hit('storage');}},dataLayer:[],location:{reload(){ctx.reloads=(ctx.reloads||0)+1;}},$:el,t:k=>k,show:s=>ctx.screen=s,
 clearDailyResult(){},dailyAudioDay:'20261120',dailyDayUTC:()=> '20261121',recordingDay:null,appendNext:true,takeCount:2,
 vmEv(){},isInApp:()=>false,micAlreadyOk:async()=>true,loadModel:async()=>{ctx.loads=(ctx.loads||0)+1;},
 setInterval(fn){hit('timer');timers.set(++seq,fn);return seq;},clearInterval:id=>timers.delete(id),
 Float32Array,console,analyzePcm:async(pcm,rate,append,day)=>{ctx.analyzed={length:pcm.length,rate,append,day};}});
 vm.runInContext(code,ctx);const run=s=>vm.runInContext(s,ctx);run('appendNext=true;takeCount=2');
 return{ctx,el,run,timers,tracks,contexts,sources,processors,setFailure:v=>fail=v};
}
for(const locale of ['','ko','en','ja','es','pt','tw','id']){
 for(const failure of ['context','source','processor','source.connect','processor.connect','timer'])for(const cleanupThrow of [false,true])test((locale||'root')+' '+failure+' cleanupThrows='+cleanupThrow+' releases partial setup and safely retries',async()=>{
  const h=harness(locale,failure,cleanupThrow);
  await assert.doesNotReject(h.run('startRec(true)'),'setup must recover through existing error screen');
  assert.equal(h.ctx.screen,'s-err');assert.equal(h.el('err-t').innerHTML,'errAnalyze');
  assert.ok(h.tracks.every(t=>t.stopped),'every acquired track stops');
  assert.ok(h.sources.every(s=>s.disconnected));assert.ok(h.processors.every(p=>p.disconnected&&p.onaudioprocess===null));assert.ok(h.contexts.every(c=>c.closed));assert.equal(h.timers.size,0);
  for(const key of ['stream','audioCtx','proc','recTimer'])assert.equal(h.run(key),null,key+' ownership released');
  assert.equal(h.run('pcmChunks.length'),0);assert.equal(h.ctx.appendNext,true);assert.equal(h.ctx.dailyAudioDay,'20261120');assert.equal(h.ctx.takeCount,2);
  h.el('btn-restart').onclick();assert.equal(h.ctx.reloads,1);
  h.setFailure('');await h.run('startRec(true)');assert.equal(h.ctx.screen,'s-rec');assert.equal(h.timers.size,1);
  h.run('proc.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(48000)}})');await h.run('stopRec()');
  assert.deepEqual(h.ctx.analyzed,{length:48000,rate:16000,append:true,day:'20261121'});assert.equal(h.timers.size,0);assert.ok(h.tracks.every(t=>t.stopped));
 });
 test((locale||'root')+' unavailable optional mic hint storage does not abort capture',async()=>{
  const h=harness(locale,'storage');await assert.doesNotReject(h.run('startRec(true)'));assert.equal(h.ctx.screen,'s-rec');assert.equal(h.timers.size,1);h.run('pcmChunks=[new Float32Array(48000)]');await h.run('stopRec()');assert.equal(h.ctx.analyzed.length,48000);
 });
 test((locale||'root')+' normal capture and short take release owned resources',async()=>{
  const h=harness(locale);await h.run('startRec(true)');assert.equal(h.ctx.loads,1);await h.run('stopRec()');assert.equal(h.ctx.screen,'s-err');assert.equal(h.el('err-t').innerHTML,'errShort');assert.ok(h.tracks.every(t=>t.stopped));assert.ok(h.sources.every(s=>s.disconnected));assert.ok(h.contexts.every(c=>c.closed));assert.equal(h.processors[0].onaudioprocess,null);
 });
}

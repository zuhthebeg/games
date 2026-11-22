import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

for(const lang of ['','ko','en','ja','es','pt','tw','id']){
 const html=readFileSync(new URL('../'+(lang?lang+'/':'')+'index.html',import.meta.url),'utf8');
 const start=html.indexOf("$('btn-share').onclick=async()=>{");
 const source=html.slice(start,html.indexOf('\n};',start)+4);
 function harness(mode='success',support=true){
  const events=[],shares=[],copies=[];let saves=0;
  const button={},save={click(){saves++;}};
  const navigator={share:async data=>{shares.push(data);if(mode==='sync')throw Error('sync-like failure');if(mode!=='success')throw mode==='null'?null:Object.assign(Error('fixture'),{name:mode});},clipboard:{writeText:text=>copies.push(text)}};
  if(support!==null)navigator.canShare=()=>support;
  const c={navigator,File:class{constructor(parts,name,options){Object.assign(this,{parts,name,...options});}},cardBlob:async()=>({fixture:'PNG'}),lastResult:[{slug:'iu',pct:87}],LANG:lang||'ko',t:k=>k,I18N:{[lang||'ko']:{shareText:()=> 'IU 87%'}},singerName:()=> 'IU',vmShareUrl:()=> 'fixture-url',vmEv:ev=>events.push(ev),$:id=>id==='btn-share'?button:save};
  runInNewContext(source,c);
  return {button,events,shares,copies,saves:()=>saves};
 }
 test('ordinary share noncancel rejection saves once '+(lang||'root'),async()=>{
  for(const mode of ['NotAllowedError','TypeError','InvalidStateError','Error','null']){
   const h=harness(mode);await h.button.onclick();assert.equal(h.saves(),1,mode);assert.equal(h.shares.length,1);assert.deepEqual(h.copies,[]);assert.deepEqual(h.events,['share']);
  }
 });
 test('ordinary share success/cancel/unsupported contracts '+(lang||'root'),async()=>{
  for(const [mode,support,saves,shares] of [['success',true,0,1],['AbortError',true,0,1],['success',false,1,0],['success',null,1,0]]){
   const h=harness(mode,support);await h.button.onclick();assert.equal(h.saves(),saves);assert.equal(h.shares.length,shares);assert.deepEqual(h.copies,[]);assert.deepEqual(h.events,['share']);
   if(shares){assert.equal(h.shares[0].files[0].name,'voicematch.png');assert.equal(h.shares[0].text,'IU 87% fixture-url');}
  }
 });
}

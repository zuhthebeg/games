import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

for(const lang of ['','ko','en','ja','es','pt','tw','id']){
 const html=readFileSync(new URL('../'+(lang?lang+'/':'')+'index.html',import.meta.url),'utf8');
 const card=html.slice(html.indexOf('async function cardBlob()'),html.indexOf('const X_TAGS='));
 const start=html.indexOf("$('btn-share').onclick=async()=>{");
 const share=html.slice(start,html.indexOf('\n};',start)+4);
 function harness(mode='ok',failureAt='canvas'){
  const nodes=Object.fromEntries(['card','btn-save','btn-share','err-t','btn-restart'].map(id=>[id,{}]));
  const downloads=[],shares=[],screens=[];let blobs=0,files=0;
  const fail=()=>{throw new Error('fixture private detail');};
  const maybe=where=>{if(mode==='throw'&&failureAt===where)fail();};
  nodes.card.toBlob=cb=>{maybe('canvas');blobs++;cb(mode==='null'?null:mode==='empty'?new Blob([],{type:'image/png'}):mode==='invalid'?{size:12,type:'image/png'}:new Blob(['valid fixture'],{type:'image/png'}));};
  const context={Blob,File:class{constructor(){files++;}},document:{fonts:{load:async()=>maybe('fonts')},createElement:()=>({click(){maybe('download');downloads.push(this.download);}})},URL:{createObjectURL:()=>{maybe('url');return 'blob:fixture';}},drawCard:()=>maybe('draw'),$:id=>nodes[id],show:id=>screens.push(id),resetErrBtn:()=>{},t:k=>k,vmEv:()=>{},lastResult:[{slug:'iu',pct:87}],LANG:'en',I18N:{en:{shareText:()=> 'IU 87%'}},singerName:()=> 'IU',vmShareUrl:()=> 'fixture-url',navigator:{canShare:()=>true,share:async d=>shares.push(d)}};
  nodes['btn-save'].click=()=>nodes['btn-save'].onclick();
  runInNewContext(card+share,context);
  return {context,nodes,downloads,shares,screens,files:()=>files,setMode:m=>{mode=m;}};
 }
 test(`cardBlob rejects invalid output ${lang||'root'}`,async()=>{
  for(const mode of ['null','empty','invalid','throw'])await assert.rejects(harness(mode).context.cardBlob());
 });
 for(const id of ['btn-share','btn-save'])test(`${id} contains failures and allows retry ${lang||'root'}`,async()=>{
  for(const [mode,at] of [['null','canvas'],['empty','canvas'],['invalid','canvas'],['throw','canvas'],['throw','fonts'],['throw','draw'],...(id==='btn-save'?[['throw','url'],['throw','download']]:[])]){
   const h=harness(mode,at);await assert.doesNotReject(h.nodes[id].onclick());
   assert.equal(h.shares.length,0);assert.equal(h.downloads.length,0);assert.equal(h.files(),0);
   assert.equal(h.screens.at(-1),'s-err');assert.equal(h.nodes['err-t'].textContent,'reqErr');assert.equal(h.nodes['btn-restart'].textContent,'micRetry');
   h.setMode('ok');h.nodes['btn-restart'].onclick();assert.equal(h.screens.at(-1),'s-result');
   await h.nodes[id].onclick();assert.equal(id==='btn-save'?h.downloads.length:h.shares.length,1);
  }
 });
}

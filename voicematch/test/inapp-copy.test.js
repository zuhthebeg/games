import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const pages=['','ko','en','ja','es','pt','tw','id'];
const button=()=>({textContent:'Copy link',isConnected:true,hidden:false,closest(selector){assert.equal(selector,'.hidden');return this.hidden?this:null;}});
function harness(lang,{clipboard='resolve',exec='true',select='ok',writeText}={}){
  const html=readFileSync(new URL(`../${lang?lang+'/':''}index.html`,import.meta.url),'utf8');
  const start=html.indexOf('const inAppCopyAttempts=');
  const source=html.slice(start<0?html.indexOf('async function copyPageUrl(btn){'):start,html.indexOf('\nfunction initInAppBar()'));
  assert.ok(source.includes('async function copyPageUrl'));
  const nodes=[],events=[],commands=[];
  const body={appendChild(node){nodes.push(node);node.remove=()=>{const at=nodes.indexOf(node);if(at>=0)nodes.splice(at,1);};}};
  const document={body,createElement(tag){assert.equal(tag,'textarea');return {style:{},select(){if(select==='throw')throw Error('selection failed');}};},execCommand(cmd){commands.push(cmd);if(exec==='throw')throw Error('copy failed');return exec==='true';}};
  const navigator={};
  if(clipboard!=='absent')navigator.clipboard={writeText:writeText||(async()=>{if(clipboard==='reject')throw Error('clipboard denied');})};
  const context={document,navigator,location:{href:'https://game.cocy.io/voicematch/#c=invite'},dataLayer:{push:x=>events.push(x)},t:key=>key==='inappCopied'?'Copied!':'Copy link'};
  runInNewContext(source+'\nthis.copyPageUrl=copyPageUrl;',context);
  return {copy:context.copyPageUrl,nodes,events,commands};
}
for(const lang of pages){
 test(`in-app copy truth table ${lang||'root'}`,async()=>{
  for(const [clipboard,exec,select,success,commandCount] of [
   ['resolve','false','ok',true,0],['reject','true','ok',true,1],['absent','true','ok',true,1],
   ['reject','false','ok',false,1],['reject','throw','ok',false,1],['absent','false','ok',false,1],
   ['reject','true','throw',false,0]
  ]){
   const h=harness(lang,{clipboard,exec,select}),btn=button();
   await h.copy(btn);
   assert.equal(btn.textContent,success?'Copied!':'Copy link',`${clipboard}/${exec}/${select} label`);
   assert.equal(h.events.length,success?1:0,`${clipboard}/${exec}/${select} event`);
   assert.equal(h.nodes.length,0,`${clipboard}/${exec}/${select} textarea cleanup`);
   assert.equal(h.commands.length,commandCount);
   if(!success){await h.copy(btn);assert.equal(btn.textContent,'Copy link');assert.equal(h.events.length,0);assert.equal(h.nodes.length,0);}
  }
 });
}

for(const lang of pages){
 const name=lang||'root';
 test(`in-app copy immediately resets a retry and recovers ${name}`,async()=>{
  let finish;
  const writes=[];
  const h=harness(lang,{exec:'false',writeText(text){
   writes.push(text);
   if(writes.length===2)return new Promise((_,reject)=>{finish=reject;});
   return Promise.resolve();
  }}),btn=button();
  await h.copy(btn);
  assert.equal(btn.textContent,'Copied!');
  const pending=h.copy(btn);
  assert.equal(btn.textContent,'Copy link');
  finish(Error('denied'));await pending;
  assert.equal(btn.textContent,'Copy link');
  assert.equal(h.events.length,1);
  assert.deepEqual(h.commands,['copy']);assert.equal(h.nodes.length,0);
  await h.copy(btn);assert.equal(btn.textContent,'Copied!');
  assert.equal(h.events.length,2);
  assert.deepEqual(writes,Array(3).fill('https://game.cocy.io/voicematch/'));
 });
 test(`in-app copy late success neither wins nor loses confirmed event ${name}`,async()=>{
  let finish,count=0;
  const h=harness(lang,{exec:'false',writeText(){
   return ++count===1?new Promise(resolve=>{finish=resolve;}):Promise.reject(Error('denied'));
  }}),btn=button();
  const old=h.copy(btn);
  await h.copy(btn);
  finish();await old;
  assert.equal(btn.textContent,'Copy link');
  assert.equal(h.events.length,1,'already-started Clipboard API actually succeeded');
  assert.deepEqual(h.commands,['copy']);
 });
 test(`in-app copy superseded rejection does not start a clipboard fallback ${name}`,async()=>{
  let fail,count=0;
  const h=harness(lang,{exec:'true',writeText(){
   return ++count===1?new Promise((_,reject)=>{fail=reject;}):Promise.resolve();
  }}),btn=button();
  const old=h.copy(btn);await h.copy(btn);
  fail(Error('late denial'));await old;
  assert.equal(btn.textContent,'Copied!');
  assert.deepEqual(h.commands,[]);assert.equal(h.events.length,1);
 });
 test(`in-app copy detached or hidden control is no longer current ${name}`,async()=>{
  const pending=[];
  const h=harness(lang,{exec:'true',writeText(){return new Promise((resolve,reject)=>pending.push({resolve,reject}));}});
  const detached=button(),hidden=button(),current=button();
  const a=h.copy(detached),b=h.copy(hidden),c=h.copy(current);
  detached.isConnected=false;hidden.hidden=true;
  pending[2].resolve();pending[0].resolve();pending[1].reject(Error('late denial'));
  await Promise.all([a,b,c]);
  assert.equal(detached.textContent,'Copy link');assert.equal(hidden.textContent,'Copy link');assert.equal(current.textContent,'Copied!');
  assert.deepEqual(h.commands,[]);assert.equal(h.events.length,2);
 });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const pages=['','ko','en','ja','es','pt','tw','id'];
function harness(lang,{clipboard='resolve',exec='true',select='ok'}={}){
  const html=readFileSync(new URL(`../${lang?lang+'/':''}index.html`,import.meta.url),'utf8');
  const source=html.slice(html.indexOf('async function copyPageUrl(btn){'),html.indexOf('\nfunction initInAppBar()'));
  assert.ok(source.startsWith('async function copyPageUrl'));
  const nodes=[],events=[],commands=[];
  const body={appendChild(node){nodes.push(node);node.remove=()=>{const at=nodes.indexOf(node);if(at>=0)nodes.splice(at,1);};}};
  const document={body,createElement(tag){assert.equal(tag,'textarea');return {style:{},select(){if(select==='throw')throw Error('selection failed');}};},execCommand(cmd){commands.push(cmd);if(exec==='throw')throw Error('copy failed');return exec==='true';}};
  const navigator={};
  if(clipboard!=='absent')navigator.clipboard={writeText:async()=>{if(clipboard==='reject')throw Error('clipboard denied');}};
  const context={document,navigator,location:{href:'https://game.cocy.io/voicematch/#c=invite'},dataLayer:{push:x=>events.push(x)},t:key=>key==='inappCopied'?'Copied!':key};
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
   const h=harness(lang,{clipboard,exec,select}),btn={textContent:'Copy link'};
   await h.copy(btn);
   assert.equal(btn.textContent,success?'Copied!':'Copy link',`${clipboard}/${exec}/${select} label`);
   assert.equal(h.events.length,success?1:0,`${clipboard}/${exec}/${select} event`);
   assert.equal(h.nodes.length,0,`${clipboard}/${exec}/${select} textarea cleanup`);
   assert.equal(h.commands.length,commandCount);
   if(!success){await h.copy(btn);assert.equal(btn.textContent,'Copy link');assert.equal(h.events.length,0);assert.equal(h.nodes.length,0);}
  }
 });
}

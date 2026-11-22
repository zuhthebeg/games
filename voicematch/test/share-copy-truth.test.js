'use strict';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function extract(name){const start=html.indexOf('async function '+name+'(');assert(start>=0);return html.slice(start,html.indexOf('\n}',start)+2);}
function fixture({native='absent',copy='reject',legacy=false,select=false,append=false}={}){
 const original={textContent:'Original label'},calls={clip:0,exec:0,ta:0};let button=original,release;
 const nav={};if(native!=='absent')nav.share=async()=>{if(native==='pending')return new Promise((r,j)=>release=()=>j({name:'AbortError'}));if(native!=='ok')throw {name:native};};
 if(copy!=='absent')nav.clipboard={writeText:async()=>{calls.clip++;if(copy==='pending')return new Promise(r=>release=r);if(copy==='reject')throw Error('clipboard');}};
 const c=vm.createContext({navigator:nav,$:id=>id==='duet-name'?{value:'Synthetic'}:button,t:k=>k.endsWith('Text')?()=>k:k,document:{createElement:()=>({style:{},select(){if(select)throw Error('select');},remove(){calls.ta=0;}}),body:{appendChild(){calls.ta++;if(append)throw Error('append');}},execCommand(){calls.exec++;if(legacy==='throw')throw Error('exec');return legacy;}},localStorage:{getItem(){return 'Synthetic';},setItem(){}},dataLayer:[],lastQ:[1],lastResult:[{slug:'fixture',pct:88}],lastPitch:null,DUET:{in:{n:'Synthetic'}},GROUP:{state:{id:'fixture',teamName:'Synthetic',target:'fixture'}},grpName:()=> 'Synthetic',singerName:()=> 'Synthetic',LANG:'ko',_dailyLast:{tgt:{slug:'fixture'},pct:88},currentDailyShare(){return c._dailyLast;},vmEv(){},vmShareUrl:()=> 'https://fixture.invalid/',buildInviteUrl:()=> 'https://fixture.invalid/'});
 vm.runInContext(extract('shareOrCopy'),c);
 return {c,calls,original,replace(){button={textContent:'Replacement'};return button;},release(){release();},run:()=>vm.runInContext("shareOrCopy('fixture','button')",c)};
}
for(const caller of ['shareDaily','makeInvite','sendDuetBack','shareGroupInvite']){
 for(const native of ['ok','AbortError','NotAllowedError','absent'])for(const copy of ['ok','reject','absent'])for(const legacy of [true,false,'throw',1])test(caller+' '+native+' / '+copy+' / '+legacy,async()=>{
  const f=fixture({native,copy,legacy});vm.runInContext(extract(caller),f.c);await vm.runInContext(caller+'()',f.c);
  const used=native!=='ok',success=used&&(copy==='ok'||legacy===true);
  assert.equal(f.original.textContent,success?'duetCopied':'Original label');assert.equal(f.calls.ta,0);
  assert.equal(f.calls.clip,used&&copy!=='absent'?1:0);assert.equal(f.calls.exec,used&&copy!=='ok'?1:0);
 });
}
for(const failure of ['select','append'])test(failure+' throw cleans textarea and retains label',async()=>{const f=fixture({[failure]:true,legacy:true});await f.run();assert.equal(f.calls.ta,0);assert.equal(f.calls.exec,0);assert.equal(f.original.textContent,'Original label');});
test('pending clipboard may not relabel replacement button',async()=>{const f=fixture({copy:'pending'});const p=f.run(),replacement=f.replace();f.release();await p;assert.equal(replacement.textContent,'Replacement');assert.equal(f.original.textContent,'Original label');});
test('daily identity loss after native AbortError prevents copy',async()=>{const f=fixture({native:'pending',copy:'ok'});vm.runInContext(extract('shareDaily'),f.c);const p=vm.runInContext('shareDaily()',f.c);f.c._dailyLast=null;f.release();await p;assert.equal(f.calls.clip,0);assert.equal(f.original.textContent,'Original label');});
test('daily identity loss during clipboard prevents relabel',async()=>{const f=fixture({copy:'pending'});vm.runInContext(extract('shareDaily'),f.c);const p=vm.runInContext('shareDaily()',f.c);f.c._dailyLast=null;f.release();await p;assert.equal(f.original.textContent,'Original label');});

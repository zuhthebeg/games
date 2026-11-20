import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf("const REQ_TRACK_KEY="),html.indexOf('// 첫 화면 로딩(모델 fetch'));
const i18n=readFileSync(new URL('../i18n.js',import.meta.url),'utf8');
function harness(rows,opts={}){
 let saved=JSON.stringify(opts.mine||[1,2,3,4].map(id=>({id,artist:id===1?'<img src=x onerror=alert(1)>':'Artist '+id,ts:Date.now()}))),active=null;
 const events=[],nodes=[],timers=[];
 class El{constructor(){this.children=[];this.isConnected=false;}appendChild(e){this.children.push(e);if(this===body){active=e;e.isConnected=true;nodes.push(e);}return e;}setAttribute(){}remove(){this.isConnected=false;if(active===this)active=null;}}
 const body=new El();const ctx=vm.createContext({Date,console,document:{body,createElement:()=>new El(),querySelector:()=>active},setTimeout:fn=>timers.push(fn),vmEv:e=>events.push(e),show(){},dataLayer:[],localStorage:{getItem(){if(opts.readError)throw Error();return saved;},setItem(k,v){if(opts.writeError)throw Error();saved=v;}},fetch:async()=>{if(opts.network)throw Error();return {ok:!opts.httpError,json:async()=>({requests:rows})};}});
 vm.runInContext(i18n,ctx);vm.runInContext("const t=k=>I18N.en[k];"+source,ctx);
 return {run:s=>vm.runInContext(s,ctx),events,nodes,timers,get active(){return active;},get saved(){return JSON.parse(saved);}};
}
test('failed notice is neutral, HTML-safe, exactly once; done event only on successful notice',async()=>{
 const h=harness([{id:1,status:'failed',artist:'server name',result:'secret raw reason'}]);await h.run('checkMyReqs()');
 assert.ok(h.active);assert.match(h.active.children[0].textContent,/could not add/i);assert.match(h.active.children[0].textContent,/<img/);assert.doesNotMatch(h.active.children[0].textContent,/secret|audio/i);assert.deepEqual(h.events,[]);
 h.active.remove();await h.run('checkMyReqs()');assert.equal(h.nodes.length,1);assert.deepEqual(h.saved.map(x=>x.id),[2,3,4]);
});
test('mixed results consume only shown notices; canceled quiet and missing retained',async()=>{
 const h=harness([{id:1,status:'done'},{id:2,status:'failed'},{id:3,status:'canceled'},{id:99,status:'done'}]);await h.run('checkMyReqs()');assert.deepEqual(h.events,['req_done_seen']);assert.deepEqual(h.saved.map(x=>x.id),[2,4]);
 await h.run('checkMyReqs()');assert.deepEqual(h.saved.map(x=>x.id),[2,4]);h.active.remove();await h.run('checkMyReqs()');assert.match(h.active.children[0].textContent,/could not add/i);assert.deepEqual(h.saved.map(x=>x.id),[4]);
});
test('storage write failures do not repeat within document; failed read/network leave quiet',async()=>{
 const h=harness([{id:1,status:'failed'}],{writeError:true});await h.run('checkMyReqs()');assert.ok(h.active);h.active.remove();await h.run('checkMyReqs()');assert.equal(h.nodes.length,1);
 for(const opts of [{readError:true},{network:true},{httpError:true}]){const x=harness([{id:1,status:'failed'}],opts);await x.run('checkMyReqs()');assert.equal(x.nodes.length,0);}
});
test('malformed local rows, unknown status and malformed response are safe',async()=>{
 const h=harness('bad',{mine:[null,{}, {id:'1&bad',artist:'X',ts:Date.now()},{id:1,artist:'Name',ts:Date.now()}]});await h.run('checkMyReqs()');assert.equal(h.nodes.length,0);
});
test('all seven locales contain localized neutral failure and requested marker',()=>{
 const ctx=vm.createContext({});vm.runInContext(i18n,ctx);for(const l of ['ko','en','ja','es','pt','tw','id']){assert.equal(vm.runInContext('typeof I18N.'+l+'.reqFailed',ctx),'function');assert.equal(vm.runInContext('typeof I18N.'+l+'.recentRequested',ctx),'string');}
});

test('concurrent checks show once and the next terminal request survives until notice clears',async()=>{
 const h=harness([{id:1,status:'failed'},{id:2,status:'done'}]);
 await Promise.all([h.run('checkMyReqs()'),h.run('checkMyReqs()')]);
 assert.equal(h.nodes.length,1);assert.deepEqual(h.saved.map(x=>x.id),[2,3,4]);
 h.timers[0]();await new Promise(r=>setImmediate(r));
 assert.equal(h.nodes.length,2);assert.deepEqual(h.events,['req_done_seen']);assert.deepEqual(h.saved.map(x=>x.id),[3,4]);
});
test('untracked rows and unknown/pending/missing states never show or consume',async()=>{
 const h=harness([null,{id:99,status:'failed'},{id:1,status:'pending'},{id:2,status:'processing'},{id:3,status:'unexpected'}]);
 await h.run('checkMyReqs()');assert.equal(h.nodes.length,0);assert.deepEqual(h.saved.map(x=>x.id),[1,2,3,4]);
});

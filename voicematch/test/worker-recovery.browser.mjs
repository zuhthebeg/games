// Actual full-page DOM/inline handlers at 390px. Synthetic Worker/clock/model only; no mic, screenshots or outward network.
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(new URL('../../',import.meta.url).pathname),base='http://127.0.0.1';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
const rows=[];
try{for(const lang of ['','ko','en','ja','es','pt','tw','id']){
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,serviceWorkers:'block'}),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await ctx.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin!==base)return route.abort();
  if(u.pathname.endsWith('.onnx'))return route.fulfill({body:Buffer.from([1,2,3,4])});
  try{const p=resolve(root,'.'+decodeURIComponent(u.pathname).replace(/\/$/,'/index.html'));if(!p.startsWith(root+'/'))throw Error('outside');return route.fulfill({contentType:({'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.css':'text/css'})[extname(p)]||'application/octet-stream',body:await readFile(p)});}catch{return route.fulfill({status:404,body:''});}
 });
 await page.addInitScript(()=>{
  window.__workers=[];window.__deadlines=new Map();window.__mic=0;
  navigator.sendBeacon=()=>true;
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia(){window.__mic++;throw Error('mic forbidden');}}});
  const st=setTimeout,ct=clearTimeout;let id=-1;
  window.setTimeout=(fn,ms,...args)=>{if(ms===180000||ms===90000){window.__deadlines.set(id,{fn,ms});return id--;}return st(fn,ms,...args);};
  window.clearTimeout=id=>{window.__deadlines.delete(id);ct(id);};
  window.Worker=class{
   constructor(){this.l=new Map();this.posts=[];this.dead=false;window.__workers.push(this);}
   addEventListener(k,f){if(!this.l.has(k))this.l.set(k,new Set());this.l.get(k).add(f);}
   removeEventListener(k,f){this.l.get(k)?.delete(f);}
   postMessage(m){this.posts.push(m);}
   terminate(){this.dead=true;}
   emit(k,data){for(const f of [...(this.l.get(k)||[])])f(k==='message'?{data}:{preventDefault(){}});}
  };
 });
 const url=base+'/voicematch/'+(lang?lang+'/':'');await page.goto(url,{waitUntil:'load'});
 const launch=()=>page.evaluate(()=>{show('s-ana');window.__job=analyzePcm(new Float32Array(48000),16000,false);});
 const initPosted=()=>page.waitForFunction(()=>window.__workers.at(-1)?.posts.some(m=>m.type==='init'));
 const initReady=()=>page.evaluate(()=>window.__workers.at(-1).emit('message',{type:'ready'}));
 // Initial event failure -> existing localized error and manual reload retry. Reload never captures audio.
 await launch();await initPosted();await page.evaluate(()=>window.__workers.at(-1).emit('error'));await page.evaluate(()=>window.__job);
 assert.equal(await page.locator('#s-err').isVisible(),true);assert.equal(await page.evaluate(()=>window.__workers.at(-1).dead),true);
 await Promise.all([page.waitForEvent('load'),page.locator('#btn-restart').click()]);
 assert.equal(await page.locator('#s-intro').isVisible(),true);
 // Inference event failure, finite initialization/inference deadline, fresh generation after each failure.
 for(const scenario of ['messageerror','init-timeout','inference-timeout']){
  await launch();await initPosted();
  if(scenario!=='init-timeout'){await initReady();await page.waitForFunction(()=>window.__workers.at(-1).posts.some(m=>m.type==='analyze'));}
  await page.evaluate(scenario=>{
   window.__old=window.__workers.at(-1);window.__oldCallbacks=[...(window.__old.l.get('message')||[])];
   if(scenario==='messageerror')window.__old.emit('messageerror');
   else{const ms=scenario==='init-timeout'?180000:90000;[...window.__deadlines.values()].find(t=>t.ms===ms).fn();}
  },scenario);await page.evaluate(()=>window.__job);
  assert.equal(await page.locator('#s-err').isVisible(),true);
  assert.equal(await page.evaluate(()=>window.__deadlines.size),0);
  assert.equal(await page.evaluate(()=>[...window.__old.l.values()].reduce((n,s)=>n+s.size,0)),0);
 }
 await launch();await initPosted();
 await page.evaluate(()=>{window.__oldCallbacks.forEach(f=>f({data:{type:'ready'}}));window.__oldCallbacks.forEach(f=>f({data:{type:'result',rank:[]}}));});
 assert.equal(await page.evaluate(()=>workerReady),false);
 await initReady();await page.waitForFunction(()=>window.__workers.at(-1).posts.some(m=>m.type==='analyze'));
 // All pool result arguments and additional recording remain actual rendering paths, not a stub.
 await page.evaluate(()=>{
  const rank=window._singersCache.slice(0,5).map((s,i)=>({...s,pct:95-i}));
  window.__done={type:'result',rank,rankAll:rank,rankJp:rank,rankCp:rank,takes:1};
  window.__workers.at(-1).emit('message',window.__done);
 });await page.evaluate(()=>window.__job);
 assert.equal(await page.locator('#s-result').isVisible(),true);
 assert.equal(await page.locator('#btn-addtake').isVisible(),true);
 for(let i=0;i<4;i++){await page.locator('#btn-pool').click();assert.equal(await page.locator('#s-result').isVisible(),true);}
 await page.evaluate(()=>{show('s-ana');window.__job=analyzePcm(new Float32Array(48000),16000,true);});
 await page.waitForFunction(()=>window.__workers.at(-1).posts.filter(m=>m.type==='analyze').length===2);
 await page.evaluate(()=>window.__workers.at(-1).emit('message',{...window.__done,takes:2}));await page.evaluate(()=>window.__job);
 assert.equal(await page.evaluate(()=>takeCount),2);assert.equal(await page.evaluate(()=>window.__deadlines.size),0);
 assert.equal(await page.evaluate(()=>window.__mic),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 rows.push({lang:lang||'root',width:390,errors:0,mic:0});await ctx.close();
}console.log(JSON.stringify({pass:rows.length,rows},null,2));}finally{await browser.close();}

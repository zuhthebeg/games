// Actual DOM/handlers, synthetic audio resources only. All routes local or aborted.
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
  const u=new URL(route.request().url());if(u.origin!==base)return route.abort();
  try{const p=resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));if(!p.startsWith(root+'/'))throw Error('outside');return route.fulfill({contentType:({'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.css':'text/css'})[extname(p)]||'application/octet-stream',body:await readFile(p)});}catch{return route.fulfill({status:404,body:''});}
 });
 await page.addInitScript(()=>{navigator.sendBeacon=()=>true;window.__nativeMic=0;Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia(){window.__nativeMic++;throw Error('native mic forbidden');}}});});
 await page.goto(base+'/voicematch/'+(lang?lang+'/':''),{waitUntil:'load'});
 await page.evaluate(()=>{
  window.__resources=[];window.__fail='';window.__timers=new Map();let seq=0;
  const hit=k=>{if(window.__fail===k)throw Error(k);};
  navigator.mediaDevices.getUserMedia=async()=>{const tracks=[0,1].map(()=>({stopped:false,stop(){this.stopped=true;throw Error('cleanup');}}));const s={tracks,getTracks:()=>tracks};window.__resources.push(s);return s;};
  window.AudioContext=class{
   constructor(){hit('context');this.sampleRate=16000;this.destination={};window.__resources.push(this);}
   createMediaStreamSource(){hit('source');const s={connect(){hit('source.connect');},disconnect(){this.disconnected=true;throw Error('cleanup');}};window.__resources.push(s);return s;}
   createScriptProcessor(){hit('processor');const p={connect(){hit('processor.connect');},disconnect(){this.disconnected=true;throw Error('cleanup');}};window.__resources.push(p);return p;}
   close(){this.closed=true;return Promise.reject(Error('cleanup'));}
  };
  window.setInterval=fn=>{window.__timers.set(++seq,fn);return seq;};window.clearInterval=id=>window.__timers.delete(id);
  loadModel=async()=>{};
 });
 for(const failure of ['context','source','processor','source.connect','processor.connect']){
  await page.evaluate(async failure=>{window.__fail=failure;await startRec(true);},failure);
  assert.equal(await page.locator('#s-err').isVisible(),true);
  assert.equal(await page.evaluate(()=>$('err-t').innerHTML===t('errAnalyze')&&$('btn-restart').textContent===t('restart')),true);
  assert.equal(await page.evaluate(()=>stream===null&&audioCtx===null&&proc===null&&captureSource===null&&recTimer===null&&window.__timers.size===0),true);
  assert.equal(await page.evaluate(()=>window.__resources.every(r=>r.tracks?r.tracks.every(t=>t.stopped):'sampleRate'in r?r.closed:r.disconnected)),true);
 }
 // Retry in the same page after failed partial setups; actual callback collects PCM.
 await page.evaluate(async()=>{window.__fail='';appendNext=true;dailyAudioDay='20261120';await startRec(true);proc.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(48000)}});});
 assert.equal(await page.locator('#s-rec').isVisible(),true);
 assert.equal(await page.evaluate(()=>pcmChunks.length===1&&appendNext&&dailyAudioDay==='20261120'),true);
 await page.evaluate(()=>{cleanupCapture();pcmChunks=[];});
 assert.equal(await page.evaluate(()=>window.__timers.size),0);
 // Actual localized restart reloads to ordinary intro, never automatically acquires audio.
 await page.evaluate(()=>{resetErrBtn();show('s-err');});
 await Promise.all([page.waitForEvent('load'),page.locator('#btn-restart').click()]);
 assert.equal(await page.locator('#s-intro').isVisible(),true);assert.equal(await page.evaluate(()=>window.__nativeMic),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 rows.push({lang:lang||'root',width:390,errors:0,nativeMic:0});await ctx.close();
}console.log(JSON.stringify({pass:rows.length,rows},null,2));}finally{await browser.close();}

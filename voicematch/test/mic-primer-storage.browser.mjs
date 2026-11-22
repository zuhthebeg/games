// Actual DOM/handlers at 390px; only vm_mic_primed storage faults. No network or native microphone.
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(new URL('../../',import.meta.url).pathname),base='http://127.0.0.1';
const types={'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.css':'text/css'};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
const rows=[];
try{
 for(const lang of ['','ko','en','ja','es','pt','tw','id']){
  for(const inapp of [false,true]){
   const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,serviceWorkers:'block',userAgent:inapp?'Mozilla/5.0 (Linux; Android 13) Threads':'Mozilla/5.0 (Linux; Android 13) Chrome/120 Safari/537.36'});
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route('**/*',async route=>{
    const u=new URL(route.request().url());if(u.origin!==base)return route.abort();
    try{const p=resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));if(!p.startsWith(root+'/'))throw Error('outside');return route.fulfill({contentType:types[extname(p)]||'application/octet-stream',body:await readFile(p)});}catch{return route.fulfill({status:404,body:''});}
   });
   await page.addInitScript(()=>{
    const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
    Storage.prototype.getItem=function(k){if(k==='vm_mic_primed')throw new DOMException('blocked','SecurityError');return get.call(this,k);};
    Storage.prototype.setItem=function(k,v){if(k==='vm_mic_primed')throw new DOMException('blocked','SecurityError');return set.call(this,k,v);};
    window.__micCalls=0;window.__permission='prompt';navigator.sendBeacon=()=>true;
    Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>({state:window.__permission})}});
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{window.__micCalls++;throw Error('synthetic mic denied');}}});
   });
   await page.goto(base+'/voicematch/'+(lang?lang+'/':''),{waitUntil:'load'});
   await page.evaluate(()=>startRec(false));
   assert.equal(await page.locator('#mic-sheet').isVisible(),true);
   assert.equal(await page.evaluate(()=>window.__micCalls),0);
   const box=await page.locator('#mic-go').boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844);
   await page.locator('#mic-go').click();await page.waitForFunction(()=>window.__micCalls===1);
   assert.equal(await page.locator('#mic-sheet').isVisible(),false);
   assert.equal(await page.locator('#s-err').isVisible(),true);
   await page.locator('#btn-restart').click();await page.waitForFunction(()=>window.__micCalls===2);
   assert.equal(await page.locator('#s-err').isVisible(),true);
   if(!inapp){await page.evaluate(()=>{window.__permission='granted';show('s-intro');});await page.evaluate(()=>startRec(false));assert.equal(await page.evaluate(()=>window.__micCalls),3);assert.equal(await page.locator('#mic-sheet').isVisible(),false);}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.deepEqual(errors,[]);rows.push({lang:lang||'root',inapp,width:390,micCalls:inapp?2:3,pageErrors:0});await ctx.close();
  }
 }
 console.log(JSON.stringify({pass:rows.length,rows},null,2));
}finally{await browser.close();}

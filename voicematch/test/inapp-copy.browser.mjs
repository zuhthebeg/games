// Offline 390px actual DOM/handlers; all network local fixtures or aborted.
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
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (Linux; Android 13) Threads'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await ctx.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin!==base)return route.abort();
   try{const p=resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));if(!p.startsWith(root+'/'))throw Error('outside');return route.fulfill({contentType:types[extname(p)]||'application/octet-stream',body:await readFile(p)});}catch{return route.fulfill({status:404,body:''});}
  });
  await page.goto(base+'/voicematch/'+(lang?lang+'/':''),{waitUntil:'load'});
  await page.evaluate(()=>{window.dataLayer=[];showMicSheet();window.__copyMode='fail';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{if(window.__copyMode!=='success')throw Error('denied');}}});document.execCommand=()=>false;});
  const btn=page.locator('#mic-copy'),label=await btn.textContent();assert.equal(await btn.isVisible(),true);
  const box=await btn.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844);
  await btn.click();await btn.click();
  assert.equal(await btn.textContent(),label);assert.equal(await page.evaluate(()=>dataLayer.filter(x=>x.event==='vm_inapp_copy').length),0);
  assert.equal(await page.evaluate(()=>document.querySelectorAll('textarea').length),0);
  await page.evaluate(()=>{window.__copyMode='success';});await btn.click();
  assert.equal(await btn.textContent(),await page.evaluate(()=>t('inappCopied')));
  assert.equal(await page.evaluate(()=>dataLayer.filter(x=>x.event==='vm_inapp_copy').length),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  rows.push({lang:lang||'root',width:390,failedClicks:2,retry:'copied',pageErrors:0});await ctx.close();
 }
 console.log(JSON.stringify({pass:rows.length,rows},null,2));
}finally{await browser.close();}

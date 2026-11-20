// Run: PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs node voicematch/test/intro-social.browser.mjs
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(new URL('../../',import.meta.url).pathname);
const types={'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.css':'text/css'};
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/\/$/,'/index.html'));if(!p.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',types[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
const rows=[];
try{
 for(const lang of ['','ko','en','ja','es','pt','tw','id']){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin===base&&u.pathname.endsWith('/analyzer.js'))return route.fulfill({contentType:'application/javascript',body:'// UI-only fixture: model/microphone not exercised'});
   if(u.origin===base&&u.pathname.endsWith('/recent.json'))return route.fulfill({contentType:'application/json',body:JSON.stringify({recent:[{slug:'iu',name:'IU',added:new Date().toISOString().slice(0,10),req:1}]})});
   if(u.origin===base)return route.continue();
   if(u.pathname.endsWith('/request-status'))return route.fulfill({contentType:'application/json',body:JSON.stringify({requests:[{id:1,status:'failed'},{id:2,status:'done'},{id:3,status:'canceled'}]})});
   if(u.hostname==='relay.cocy.io')return route.fulfill({contentType:'application/json',body:JSON.stringify({rankings:[],entries:0})});
   return route.abort();
  });
  await page.addInitScript(()=>{
   if(location.protocol!=='http:'||window!==window.top)return;
   window.__events=[];navigator.sendBeacon=(u,b)=>{b.text().then(t=>window.__events.push(JSON.parse(t)));return true;};
   if(!sessionStorage.getItem('seeded')){localStorage.setItem('vm_my_reqs',JSON.stringify([1,2,3,4].map(id=>({id,artist:id===1?'<img src=x onerror=alert(1)>':'Artist '+id,ts:Date.now()}))));sessionStorage.setItem('seeded','1');}
  });
  await page.goto(base+'/voicematch/'+(lang?lang+'/':''),{waitUntil:'load'});
  await page.waitForSelector('.req-toast');
  const expected=await page.evaluate(()=>t('reqFailed')('<img src=x onerror=alert(1)>'));
  assert.equal(await page.locator('.rt-t').textContent(),expected);
  assert.equal(await page.locator('.req-toast img').count(),0);assert.equal(await page.locator('.rt-b').count(),0);
  await page.waitForSelector('.recent-chip small');
  assert.equal(await page.locator('.recent-chip small').last().textContent(),await page.evaluate(()=>t('recentRequested')));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('vm_my_reqs')).map(x=>x.id)),[2,4]);
  await page.locator('.rt-x').click();await page.evaluate(()=>checkMyReqs());
  await page.waitForSelector('.rt-b');
  assert.equal(await page.locator('.rt-t').textContent(),await page.evaluate(()=>t('reqDone')('Artist 2')));
  assert.equal(await page.evaluate(()=>window.__events.filter(x=>x.ev==='req_done_seen').length),1);
  await page.reload({waitUntil:'load'});await page.evaluate(()=>checkMyReqs());
  assert.equal(await page.locator('.req-toast').count(),0);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('vm_my_reqs')).map(x=>x.id)),[4]);
  assert.deepEqual(errors,[]);rows.push({lang:lang||'root',width:390,errors:errors.length});await ctx.close();
 }
 console.log(JSON.stringify({pass:rows.length,mode:'Chromium real DOM; request/recent/API and model UI fixtures; no production writes; no screenshots',rows}));
}finally{await browser.close();await new Promise(r=>server.close(r));}

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
  for(const lang of ['ko','en','ja','es','pt','tw','id']){
    console.log('checking '+lang);
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,serviceWorkers:'block'});
    const page=await ctx.newPage(),errors=[];page.setDefaultTimeout(12000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===base&&u.pathname.endsWith('/analyzer.js'))return route.fulfill({contentType:'application/javascript',body:'// Analysis worker intentionally isolated: UI-only fixture.'});if(u.origin===base)return route.continue();if(u.hostname==='relay.cocy.io')return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,rankings:[],entries:0,day:new Date().toISOString().slice(0,10).replaceAll('-','')})});return route.abort();});
    await page.addInitScript(()=>{window.__micCalls=0;window.__scrolls=[];const original=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(opts){window.__scrolls.push({id:this.id,...opts});return original.call(this,opts);};const getUserMedia=()=>{window.__micCalls++;return Promise.reject(Error('no microphone in test'));};if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=getUserMedia;else Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia}});});
    await page.goto(base+'/voicematch/'+lang+'/',{waitUntil:'load'});
    await page.waitForFunction(()=>document.querySelector('#btn-social-duet').textContent.length>0);
    assert.equal(await page.locator('#intro-social').isVisible(),true);
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,labels:[...document.querySelectorAll('#intro-social button')].map(x=>x.textContent),sameRow:document.querySelector('#btn-social-duet').getBoundingClientRect().top===document.querySelector('#btn-social-group').getBoundingClientRect().top}));
    assert.ok(layout.scroll<=layout.width,lang+' horizontal overflow');assert.equal(layout.sameRow,true);
    for(const kind of ['duet','group']){
      await page.locator('#btn-social-'+kind).click();
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('vm_social_intent')),kind);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'btn-start');assert.equal(await page.locator('#social-notice').isVisible(),true);
      assert.equal(await page.evaluate(()=>window.__micCalls),0);
      // Feed a completed local analysis into the real renderer, without requesting a microphone/model.
      await page.evaluate(()=>{lastQ=window._singersCache[0].emb;renderResult([{...window._singersCache[0],pct:90}],null,null,null,null);});
      await page.waitForFunction(()=>sessionStorage.getItem('vm_social_intent')===null);
      assert.equal(await page.evaluate(()=>window.__scrolls.at(-1).id),'r-'+kind+'cta');
      await page.evaluate(()=>{show('s-intro');});
      await page.locator('#btn-social-'+kind).click();
      assert.equal(await page.evaluate(()=>window.__scrolls.at(-1).id),'r-'+kind+'cta');
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('vm_social_intent')),null);
      await page.evaluate(()=>{lastQ=null;show('s-intro');});
    }
    await page.evaluate(()=>{GROUP.in='abc';GROUP.state={teamName:'Test',target:'bts',total:7,members:[]};renderGroupBanner();renderIntroSocial();});
    assert.equal(await page.locator('#group-banner').isVisible(),true);assert.equal(await page.locator('#intro-social').isVisible(),false);
    await page.evaluate(()=>{GROUP.in=null;document.querySelector('#group-banner').classList.add('hidden');DUET.in={n:'Friend'};lastResult=null;applyLang();show('s-intro');});
    assert.equal(await page.locator('#duet-banner').isVisible(),true);assert.equal(await page.locator('#intro-social').isVisible(),false);
    await page.evaluate(()=>{DUET.in=null;lastResult=null;applyLang();show('s-intro');});
    if(lang==='ko'&&process.env.VM_SCREENSHOT){await page.locator('#intro-social').scrollIntoViewIfNeeded();await page.screenshot({path:process.env.VM_SCREENSHOT});}
    assert.deepEqual(errors,[],lang+' page errors');rows.push({lang,...layout,microphoneCalls:await page.evaluate(()=>window.__micCalls),errors:errors.length});
    await ctx.close();
  }
  console.log(JSON.stringify({pass:rows.length,rows},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}

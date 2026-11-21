// 390px actual DOM + handlers, deterministic UTC/deferred API fixtures. No external request continues.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chrome node voicematch/test/daily-ownership.browser.mjs
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
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,serviceWorkers:'block'});
    const page=await ctx.newPage(),errors=[],posts=[];page.on('pageerror',e=>errors.push(e.message));
    await ctx.route('**/*',async route=>{
      const req=route.request(),u=new URL(req.url());
      if(u.origin===base){
        if(u.pathname.endsWith('/analyzer.js'))return route.fulfill({contentType:'application/javascript',body:''});
        try{
          const p=resolve(root,'.'+decodeURIComponent(u.pathname).replace(/\/$/,'/index.html'));
          if(!p.startsWith(root+'/'))throw Error('outside fixture root');
          return route.fulfill({contentType:types[extname(p)]||'application/octet-stream',body:await readFile(p)});
        }catch{return route.fulfill({status:404,body:''});}
      }
      if(u.hostname==='relay.cocy.io'){
        if(req.method()==='POST')posts.push({path:u.pathname,body:req.postDataJSON()});
        return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,day:u.searchParams.get('day')||'20261116',rankings:[],entries:0,myRank:5})});
      }
      return route.abort();
    });
    await page.addInitScript(()=>{
      const NativeDate=Date;window.__utc='2026-11-16T23:59:00Z';
      window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[window.__utc]));}static now(){return new NativeDate(window.__utc).getTime();}};
      window.__shares=[];window.__micCalls=0;window.__gold=[];
      navigator.sendBeacon=()=>true;
      Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__shares.push(data);}});
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia(){window.__micCalls++;throw Error('microphone forbidden');}}});
    });
    await page.goto(base+'/voicematch/'+(lang?lang+'/':''),{waitUntil:'load'});
    await page.waitForFunction(()=>window._singersCache?.length>4);
    await page.evaluate(()=>{
      window.__ensure=ensureSingers;
      window.__reset=()=>{
        window.__utc='2026-11-16T23:59:00Z';expireDailyViews();ensureSingers=window.__ensure;
        clearDailyResult();localStorage.removeItem('vm_daily_last');localStorage.removeItem('vm_streak_last');localStorage.removeItem('vm_streak_n');
        localStorage.setItem('cocy_auth_token','h.'+btoa(JSON.stringify({sub:'fixture',isAnonymous:false}))+'.x');
        setDailyResult(window._singersCache[0].emb,'20261116');
        const rank=window._singersCache.slice(0,4).map((s,i)=>({...s,pct:90-i}));
        renderResult(rank,null,null,null,null);show('s-result');
      };
      window.__deferTarget=()=>{ensureSingers=()=>new Promise(resolve=>{window.__target=resolve;});};
    });
    // Target loading may not carry yesterday's audio into today or start a POST.
    await page.evaluate(()=>{window.__reset();window.__deferTarget();window.__job=renderDailyPanel();window.__utc='2026-11-17T00:00:00Z';window.__target(window._singersCache);});
    await page.evaluate(()=>window.__job);
    assert.equal(await page.locator('#r-daily').isVisible(),false);
    assert.equal(await page.evaluate(()=>localStorage.getItem('vm_daily_last')),null);
    // A newer query owns share/local/panel state even if an older target finishes last.
    await page.evaluate(()=>{window.__reset();window.__deferTarget();window.__job=renderDailyPanel();ensureSingers=window.__ensure;setDailyResult(window._singersCache[1].emb,'20261116');});
    await page.evaluate(()=>renderDailyPanel());
    const latest=await page.locator('#r-daily').innerHTML();
    await page.evaluate(()=>{window.__target(window._singersCache);return window.__job;});
    assert.equal(await page.locator('#r-daily').innerHTML(),latest);
    // Local POST promise is held entirely in this page; no API request leaves routing.
    await page.evaluate(()=>{
      window.__reset();window.__fetch=fetch;window.__pendingPosts=[];
      window.fetch=(url,opts)=>String(url)===DAILY_API&&opts?.method==='POST'?new Promise(resolve=>window.__pendingPosts.push(resolve)):window.__fetch(url,opts);
      window.__job=renderDailyPanel();
    });
    await page.waitForFunction(()=>window.__pendingPosts.length===1);
    await page.evaluate(()=>{clearDailyResult();window.__pendingPosts[0]({json:async()=>({success:true,day:'20261116',myRank:1})});return window.__job;});
    assert.equal(await page.locator('#r-daily').isVisible(),false);
    assert.equal(await page.evaluate(()=>localStorage.getItem('vm_streak_last')),null);
    await page.evaluate(()=>{window.__utc='2026-11-17T00:00:00Z';fetch=window.__fetch;});
    // Normal same-day submit/share/reward CTA works, but detached or expired CTAs cannot claim.
    await page.evaluate(()=>window.__reset());
    await page.waitForFunction(()=>document.querySelector('#dl-share'));
    await page.locator('#dl-share').click();
    assert.equal(await page.evaluate(()=>window.__shares.length),1);
    await page.evaluate(()=>{window.__oldClaim=document.querySelector('#r-daily .dl-main');});
    await page.evaluate(()=>renderDailyPanel());
    await page.evaluate(()=>window.__oldClaim.click());
    assert.equal(await page.evaluate(()=>localStorage.getItem('vm_daily_claimed_20261116')),null);
    await page.evaluate(()=>{window.__utc='2026-11-17T00:00:00Z';});
    await page.evaluate(()=>{document.querySelector('#dl-share').click();document.querySelector('#r-daily .dl-main').click();});
    assert.equal(await page.evaluate(()=>window.__shares.length),1);
    assert.equal(await page.evaluate(()=>localStorage.getItem('vm_daily_claimed_20261116')),null);
    await page.evaluate(()=>renderDailyPanel());
    assert.equal(await page.locator('#r-daily').isVisible(),false);
    // A board replaced during loading cannot overwrite the next board; rollover hides current-day labels.
    await page.evaluate(()=>{window.__utc='2026-11-16T23:59:00Z';expireDailyViews();window.__fetchBoard=fetchBoard;window.__boards=[];fetchBoard=()=>new Promise(resolve=>window.__boards.push(resolve));window.__boardJob=showDailyBoard(true);});
    await page.waitForFunction(()=>window.__boards.length===2);
    await page.locator('#lb-close').click();
    await page.evaluate(()=>{window.__boards.forEach(resolve=>resolve({rankings:[]}));return window.__boardJob;});
    assert.equal(await page.locator('#lb-modal').count(),0);
    await page.evaluate(()=>{fetchBoard=window.__fetchBoard;return showDailyBoard(true);});
    assert.equal(await page.locator('#lb-modal').isVisible(),true);
    await page.evaluate(()=>{window.__utc='2026-11-17T00:00:00Z';expireDailyViews();});
    assert.equal(await page.locator('#lb-modal').count(),0);
    assert.equal(await page.locator('#daily-banner').isVisible(),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'390px overflow');
    assert.equal(await page.evaluate(()=>window.__micCalls),0);assert.deepEqual(errors,[]);
    assert.ok(posts.every(p=>p.path.endsWith('/voicematch-daily')||p.path.endsWith('/voicematch')),'only mocked ranking POST');
    rows.push({lang:lang||'root',width:390,errors:0,mic:0,mockedPosts:posts.length});
    await ctx.close();
  }
  console.log(JSON.stringify({pass:rows.length,rows},null,2));
}finally{await browser.close();}

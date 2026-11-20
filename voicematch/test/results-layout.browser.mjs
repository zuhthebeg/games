// UI regression: real analyzePcm -> renderResult and retry, deterministic worker/API fixtures.
// PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs CHROMIUM_PATH=/path/to/chrome node voicematch/test/results-layout.browser.mjs
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(new URL('../../',import.meta.url).pathname);
const singers=JSON.parse(await readFile(resolve(root,'voicematch/singers.json'),'utf8'));
const rank=singers.filter(s=>!s.intl).slice(0,4).map((s,i)=>({...s,pct:90-i*3}));
const fixture={rank,rankAll:rank,rankJp:rank,rankCp:rank,q:rank[0].emb,pitch:{lo:140,hi:420},takes:1,
  genres:[{key:'dance',pct:90},{key:'ballad',pct:85},{key:'rock',pct:80}],
  report:{cards:[{key:'range',score:80,val:'24'},{key:'stability',score:85,val:'85'}],dur:15}};
const types={'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.css':'text/css'};
// Serve the worktree through routing: no listening socket or HTTP server is needed.
const base='http://127.0.0.1';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
const rows=[],failures=[];
async function rendered(page){
  await page.evaluate(()=>analyzePcm(new Float32Array(16000),16000,false));
  await page.waitForFunction(()=>!document.getElementById('s-result').classList.contains('hidden')&&document.querySelector('#r-setlist .sl-row')&&document.querySelector('#duet-make')&&document.querySelector('[data-grp]'));
  assert.equal(await page.locator('#r-score').textContent(),'90'+await page.evaluate(()=>t('pts')||'%'));
}
async function noOverflow(page){
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'390px overflow');
}
try{
  for(const lang of ['','ko','en','ja','es','pt','tw','id']){
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,serviceWorkers:'block'});
    const page=await ctx.newPage(),errors=[],external=[],posts=[];let group;
    page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
    try{
      // No external request is ever continued, including analytics, model/CDN, auth and API.
      await ctx.route('**/*',async route=>{
        const req=route.request(),u=new URL(req.url());
        const json=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
        if(u.origin===base){
          if(u.pathname.endsWith('.onnx'))return route.fulfill({body:Buffer.from([0])});
          if(u.pathname.endsWith('/analyzer.js'))return route.abort(); // Worker is replaced below.
          try{
            const p=resolve(root,'.'+decodeURIComponent(u.pathname).replace(/\/$/,'/index.html'));
            if(!p.startsWith(root+'/'))throw Error('outside fixture root');
            return route.fulfill({contentType:types[extname(p)]||'application/octet-stream',body:await readFile(p)});
          }catch{return route.fulfill({status:404,body:''});}
        }
        external.push({host:u.host,path:u.pathname,method:req.method()});
        if(u.hostname==='relay.cocy.io'){
          if(req.method()==='POST')posts.push({path:u.pathname,body:req.postDataJSON()});
          if(u.pathname.endsWith('/group')){
            const body=req.method()==='POST'?req.postDataJSON():null;
            if(body?.action==='create'){
              const members=await page.evaluate(k=>VM_GROUPS[k].members,body.target);
              group={id:'fixtureteam',target:body.target,teamName:body.teamName,status:'open',total:members.length,teamScore:82,members:[],assigned:members[0],assignedPct:82};
              return json({id:group.id});
            }
            if(body?.action==='join')group.members=[{member_slug:group.assigned,user_name:body.userName,pct:82}];
            if(u.searchParams.has('rankings'))return json({rankings:[]});
            return json(group);
          }
          if(u.pathname.endsWith('/request'))return json({id:123});
          return json({success:true,rankings:[],entries:0,requests:[],day:new Date().toISOString().slice(0,10).replaceAll('-','')});
        }
        return route.abort();
      });
      await page.addInitScript(data=>{
        window.__fixtureResult=data;window.__workerMessages=[];window.__shares=[];window.__opens=[];window.__micCalls=0;window.__beacons=[];
        window.Worker=class{
          listeners=new Set();
          addEventListener(type,fn){if(type==='message')this.listeners.add(fn);}
          removeEventListener(type,fn){this.listeners.delete(fn);}
          postMessage(m){
            window.__workerMessages.push(m.type);
            const result=m.type==='init'?{type:'ready'}:m.type==='analyze'?{type:'result',...window.__fixtureResult}:null;
            if(result)setTimeout(()=>{for(const fn of this.listeners)fn({data:result});},0);
          }
        };
        navigator.sendBeacon=(url,body)=>{window.__beacons.push(url);return true;};
        Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
        Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__shares.push({text:data.text,files:data.files?.map(f=>f.name)});}});
        window.open=url=>{window.__opens.push(url);return null;};
        const getUserMedia=()=>{window.__micCalls++;throw Error('microphone forbidden');};
        Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia}});
      },fixture);
      await page.goto(base+'/voicematch/'+(lang?lang+'/':''),{waitUntil:'load'});
      await rendered(page);
      const layout=await page.evaluate(()=>{
        const score=document.getElementById('r-score'),bundle=document.getElementById('r-sharing');
        return {next:score.nextElementSibling?.id,ids:bundle?[...bundle.children].map(e=>e.id):[],
          positions:bundle?[bundle,...bundle.querySelectorAll('*')].map(e=>getComputedStyle(e).position):[],
          scoreBottom:score.getBoundingClientRect().bottom,shareTop:document.getElementById('btn-share').getBoundingClientRect().top};
      });
      assert.equal(layout.next,'r-sharing','sharing immediately follows score');
      assert.deepEqual(layout.ids,['r-share-actions','r-duetcta','r-groupcta','r-duet','r-group']);
      assert.ok(!layout.positions.some(p=>p==='fixed'||p==='sticky'));
      assert.ok(layout.shareTop>=layout.scoreBottom&&layout.shareTop-layout.scoreBottom<65);
      for(const id of ['r-duet','r-group'])assert.equal(await page.locator('#'+id).isVisible(),false);
      for(const id of ['r-gaxis','r-report','r-addtake','r-rank','r-rankline','r-duetcta','r-groupcta'])assert.equal(await page.locator('#'+id).isVisible(),true,id);
      await noOverflow(page);
      const summaries=[];
      for(const [id,key,content] of [['r-fantrack','ftCta','a'],['r-setlist','setlist','.sl-row'],['r-req','reqT','.req-row']]){
        const box=page.locator('#'+id),summary=box.locator(':scope > summary');
        assert.equal(await box.evaluate(e=>e.tagName),'DETAILS');
        assert.equal(await box.evaluate(e=>e.open),false);
        assert.equal(await box.locator(content).first().isVisible(),false);
        const expected=await page.evaluate(k=>k==='ftCta'?t(k)(singerName(lastResult[0],LANG)):t(k),key);
        assert.equal(await summary.innerText(),expected);summaries.push(expected);
        assert.equal(await summary.isVisible(),true);
        await summary.click();assert.equal(await box.evaluate(e=>e.open),true);
        assert.equal(await box.locator(content).first().isVisible(),true);
        await noOverflow(page);
        await summary.focus();await page.keyboard.press('Enter');assert.equal(await box.evaluate(e=>e.open),false);
        await page.keyboard.press('Space');assert.equal(await box.evaluate(e=>e.open),true);
        await summary.click();assert.equal(await box.evaluate(e=>e.open),false);
        await summary.click();assert.equal(await box.evaluate(e=>e.open),true);
      }
      assert.match(await page.locator('#r-fantrack a').getAttribute('href'),/fantrack\/c\//);
      assert.match(await page.locator('#r-setlist .sl-row').first().getAttribute('href'),/^https:\/\/youtu.be\//);
      await page.locator('#req-all').click();
      await page.locator('#al-modal').waitFor({state:'visible'});
      assert.equal(await page.locator('#al-modal').isVisible(),true);
      await page.locator('#al-close').click();
      await page.locator('#al-modal').waitFor({state:'detached'});
      await page.locator('#req-in').fill(await page.evaluate(()=>singerName(lastResult[0],LANG)));
      await page.waitForFunction(()=>document.getElementById('req-b').disabled);
      await page.locator('#req-in').fill('Fixture unknown artist');
      await page.waitForFunction(()=>!document.getElementById('req-b').disabled);
      await page.locator('#req-b').click();await page.waitForFunction(()=>document.getElementById('req-in').value==='');
      assert.equal(posts.filter(p=>p.path.endsWith('/request')).length,1);
      await page.locator('#btn-pool').click();assert.equal(await page.locator('#r-score').textContent(),'90'+await page.evaluate(()=>t('pts')||'%'));
      await page.locator('#btn-share').click();await page.waitForFunction(()=>window.__shares.length===1);
      assert.deepEqual(await page.evaluate(()=>window.__shares[0].files),['voicematch.png']);
      for(const [id,host] of [['btn-threads','www.threads.com'],['btn-x','twitter.com']]){
        await page.locator('#'+id).click();assert.equal(new URL(await page.evaluate(()=>window.__opens.at(-1))).hostname,host);
      }
      const downloadPromise=page.waitForEvent('download');await page.locator('#btn-save').click();assert.equal((await downloadPromise).suggestedFilename(),'voicematch.png');
      await page.locator('#duet-name').fill('Fixture friend');await page.locator('#duet-make').click();
      await page.waitForFunction(()=>window.__shares.some(x=>x.text.includes('#d=')));
      // Reuse the real invite parser and compatibility renderer, not a manually unhidden panel.
      const inviteHash=await page.evaluate(()=>new URL(window.__shares.find(x=>x.text.includes('#d=')).text.split('\n').at(-1)).hash);
      await page.goto(base+'/voicematch/'+(lang?lang+'/':'')+inviteHash,{waitUntil:'load'});
      // A hash-only navigation keeps the existing document; reload to run the real startup parser.
      await page.reload({waitUntil:'load'});
      assert.equal(await page.evaluate(()=>DUET.in?.n),'Fixture friend');
      assert.equal(await page.evaluate(()=>DUET.in?.emb.length),192);
      await rendered(page);
      assert.equal(await page.locator('#r-duet').isVisible(),true);
      await page.locator('#duet-share').click();await page.waitForFunction(()=>window.__shares.some(x=>x.files?.includes('voicematch-duet.png')));
      await page.locator('#duet-return').click();await page.waitForFunction(()=>window.__shares.some(x=>x.text.includes('#d=')));
      await page.locator('#grp-team').fill('Fixture team');await page.locator('[data-grp]').first().click();
      await page.waitForFunction(()=>!document.getElementById('r-group').classList.contains('hidden'));
      // groupJoin renders the panel before createGroup finishes hiding its creation CTA.
      await page.locator('#r-groupcta').waitFor({state:'hidden'});
      assert.equal(await page.locator('#r-groupcta').isVisible(),false);
      assert.deepEqual(posts.filter(p=>p.path.endsWith('/group')).map(p=>p.body.action),['create','join']);
      assert.equal(await page.locator('#grp-card').count(),0);
      assert.equal(await page.locator('#grp-claim').count(),0);
      await page.locator('#grp-share').click();await page.waitForFunction(()=>window.__shares.some(x=>x.text.includes('#g=fixtureteam')));
      await page.locator('#grp-rank').click();
      await page.locator('#lb-modal').waitFor({state:'visible'});
      assert.equal(await page.locator('#lb-modal').isVisible(),true);
      await page.locator('#lb-close').click();
      await page.locator('#lb-modal').waitFor({state:'detached'});
      // Exercise the existing two-member conditional without changing its implementation.
      await page.evaluate(()=>{const s=GROUP.state; s.members.push({member_slug:VM_GROUPS[s.target].members[1],user_name:'Second fixture',pct:82});renderGroupBox();});
      assert.equal(await page.locator('#grp-card').isVisible(),true);
      assert.equal(await page.locator('#grp-claim').count(),0);
      await page.locator('#grp-card').click();await page.waitForFunction(()=>window.__shares.some(x=>x.files?.includes('voicematch-team.png')));
      await noOverflow(page);
      // Retry must execute the actual handler, reset takes, then reach results again via analyzePcm.
      await page.evaluate(()=>{takeCount=3;appendNext=true;});
      await page.locator('#btn-retry').click();
      assert.deepEqual(await page.evaluate(()=>({intro:!$('s-intro').classList.contains('hidden'),result:$('s-result').classList.contains('hidden'),takeCount,appendNext,reset:window.__workerMessages.at(-1),addHidden:$('r-addtake').classList.contains('hidden')})),{intro:true,result:true,takeCount:0,appendNext:false,reset:'resetTakes',addHidden:true});
      await rendered(page);
      assert.equal(await page.locator('#r-duet').isVisible(),true);
      assert.equal(await page.locator('#r-group').isVisible(),true);
      assert.equal(await page.locator('#r-groupcta').isVisible(),false);
      for(const id of ['r-fantrack','r-setlist','r-req'])assert.equal(await page.locator('#'+id).evaluate(e=>e.open),false,'fresh results collapse '+id);
      assert.equal(await page.evaluate(()=>window.__micCalls),0);
      assert.deepEqual(errors,[]);
      await noOverflow(page);
      rows.push({lang:lang||'root',width:390,summaries,analysisRuns:await page.evaluate(()=>window.__workerMessages.filter(x=>x==='analyze').length),externalIntercepted:external.length,errors:0});
      console.log('PASS '+(lang||'root'));
    }catch(e){failures.push({lang:lang||'root',error:e.stack});console.error('FAIL '+(lang||'root')+' '+e.message);}
    finally{await ctx.close();}
  }
  console.log(JSON.stringify({pass:rows.length,failures,mode:'Local Chromium DOM/text only; all external requests intercepted; deterministic worker/API; no mic or screenshots',rows},null,2));
  assert.equal(failures.length,0,'all eight result/retry regressions');
}finally{await browser.close();}

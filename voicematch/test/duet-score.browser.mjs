// 390px real Chromium DOM, offline routes only; no microphone or screenshots.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chrome node voicematch/test/duet-score.browser.mjs
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(new URL('../../',import.meta.url).pathname),base='http://127.0.0.1';
const singers=JSON.parse(await readFile(resolve(root,'voicematch/singers.json'),'utf8'));
const types={'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.css':'text/css'};
const markup='<em id="p-probe">score probe</em>';
const payload={v:1,n:'<b id="name-probe">Friend</b>',s:singers[0].slug,p:markup,e:Buffer.alloc(192,130).toString('base64url')};
const hash='#d='+Buffer.from(JSON.stringify(payload)).toString('base64url');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
const rows=[];
try{
  for(const lang of ['','ko','en','ja','es','pt','tw','id']){
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,serviceWorkers:'block'});
    const page=await ctx.newPage(),errors=[],posts=[];
    page.on('pageerror',e=>errors.push(e.message));
    await ctx.route('**/*',async route=>{
      const req=route.request(),u=new URL(req.url());
      if(req.method()==='POST'){posts.push(u.href);return route.abort();}
      if(u.origin!==base)return route.abort();
      if(u.pathname.endsWith('/analyzer.js'))return route.abort();
      try{
        const p=resolve(root,'.'+decodeURIComponent(u.pathname).replace(/\/$/,'/index.html'));
        if(!p.startsWith(root+'/'))throw Error('outside fixture root');
        return route.fulfill({contentType:types[extname(p)]||'application/octet-stream',body:await readFile(p)});
      }catch{return route.fulfill({status:404,body:''});}
    });
    await page.addInitScript(()=>{
      window.__shares=[];window.__micCalls=0;
      navigator.sendBeacon=()=>true;
      Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
      Object.defineProperty(navigator,'share',{configurable:true,value:async data=>window.__shares.push({text:data.text,files:data.files?.map(f=>f.name)})});
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia(){window.__micCalls++;throw Error('microphone forbidden');}}});
    });
    await page.goto(base+'/voicematch/'+(lang?lang+'/':'')+hash,{waitUntil:'load'});
    const result=await page.evaluate(({singers,markup})=>{
      const check=(ok,label)=>{if(!ok)throw Error(label);};
      check(DUET.in.p===markup&&DUET.in.emb.length===192,'real invite parser retains participation');
      window._singersCache=singers;
      const incoming=singers.find(s=>s.slug===DUET.in.s);
      incoming.name='<i id="singer-probe">Singer</i>';
      EN_NAMES[incoming.slug]=incoming.name;TW_NAMES[incoming.slug]=incoming.name;
      lastQ=incoming.emb;lastResult=[{...incoming,pct:88}];catalogCache={artists:[]};
      document.fonts.load=async()=>[];
      show('s-result');
      const expected=JSON.stringify(computeDuet());
      let invalid=0,valid=0;
      const poison=()=>{throw Error('score coercion hook called');};
      const bad=[markup,'50','',[],[50],true,false,null,undefined,{},
        {toString:poison},{valueOf:poison},{[Symbol.toPrimitive]:poison},NaN,Infinity,-Infinity,-0.01,100.01];
      for(const p of bad){
        DUET.in.p=p;renderDuetPanels();
        check(!$('r-duet').classList.contains('hidden'),'invalid score preserves duet');
        check(!document.querySelector('.duet-tops'),'invalid score omits row');
        check(!document.querySelector('#p-probe,#name-probe,#singer-probe'),'untrusted markup never creates element');
        check(JSON.stringify(computeDuet())===expected,'score never changes compatibility');
        check(typeof $('duet-share').onclick==='function'&&typeof $('duet-return').onclick==='function','share/return handlers retained');
        invalid++;
      }
      for(const p of [0,0.125,87.654321,100]){
        DUET.in.p=p;renderDuetPanels();
        const tops=document.querySelector('.duet-tops');
        check(tops&&tops.textContent.includes(singerName(incoming,LANG)+' '+p+'%'),'valid number displayed exactly');
        check(tops.textContent.includes('88%'),'local score preserved');
        check(!document.querySelector('#name-probe,#singer-probe'),'names remain escaped');
        valid++;
      }
      // Missing singer still suppresses tops, while malformed score leaves invite/return/card sharing live.
      DUET.in.s='missing';renderDuetPanels();check(!document.querySelector('.duet-tops'),'unknown singer omits row');
      DUET.in.s=incoming.slug;DUET.in.p=markup;renderDuetPanels();
      return {invalid,valid,total:computeDuet().total};
    },{singers,markup});
    assert.deepEqual([result.invalid,result.valid],[18,4]);
    await page.locator('#duet-name').fill('Fixture reply');
    await page.locator('#duet-make').click();
    await page.locator('#duet-return').click();
    await page.locator('#duet-share').click();
    await page.waitForFunction(()=>window.__shares.some(s=>s.files?.includes('voicematch-duet.png')));
    const shares=await page.evaluate(()=>window.__shares);
    assert.equal(shares.length,3);
    for(const share of shares.slice(0,2)){
      const url=new URL(share.text.split('\n').at(-1));
      assert.equal(url.searchParams.get('utm_medium'),'invite');
      const p=JSON.parse(Buffer.from(url.hash.slice(3),'base64url').toString());
      assert.equal(p.n,'Fixture reply');assert.equal(p.p,88);assert.equal(p.v,1);
    }
    assert.equal(new URL(shares[2].text.split('\n').at(-1)).searchParams.get('utm_medium'),'duet');
    // Existing group thresholds, local join controls and invite/card shares stay independent of duet p.
    await page.evaluate(()=>{
      const target='blackpink',slugs=VM_GROUPS[target].members;
      GROUP.in='fixtureteam';GROUP.state={id:GROUP.in,target,teamName:'Fixture team',total:slugs.length,status:'open',teamScore:82,members:[{member_slug:slugs[0],user_name:'First',pct:82}]};
      renderGroupBox();
    });
    assert.equal(await page.locator('#grp-join').count(),1);
    assert.equal(await page.locator('#grp-card').count(),0);
    assert.equal(await page.locator('#grp-claim').count(),0);
    await page.locator('#grp-share').click();
    assert.match(await page.evaluate(()=>window.__shares.at(-1).text),/#g=fixtureteam/);
    await page.evaluate(()=>{GROUP.state.members.push({member_slug:VM_GROUPS.blackpink.members[1],user_name:'Second',pct:82});renderGroupBox();});
    assert.equal(await page.locator('#grp-card').isVisible(),true);
    assert.equal(await page.locator('#grp-claim').count(),0);
    await page.locator('#grp-card').click();
    await page.waitForFunction(()=>window.__shares.some(s=>s.files?.includes('voicematch-team.png')));
    await page.evaluate(()=>{const st=GROUP.state;st.status='complete';st.members=VM_GROUPS.blackpink.members.map(member_slug=>({member_slug,user_name:'Member',pct:82}));localStorage.setItem('vm_group_joined_'+st.id,JSON.stringify({slug:st.members[0].member_slug,pct:82}));renderGroupBox();});
    assert.equal(await page.locator('#grp-claim').isVisible(),true);
    assert.equal(await page.evaluate(()=>window.__micCalls),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'390px overflow');
    assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
    rows.push({lang:lang||'root',width:390,...result,shares:5,errors:0,posts:0,mic:0});
    console.log('PASS '+(lang||'root'));
    await ctx.close();
  }
  console.log(JSON.stringify({pass:rows.length,invalidCases:144,validCases:32,mode:'offline Chromium DOM; external routes aborted; no POST, mic or screenshots',rows},null,2));
}finally{await browser.close();}

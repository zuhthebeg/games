import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const i18n=readFileSync(new URL('../i18n.js',import.meta.url),'utf8');
const pages=['','ko','en','ja','es','pt','tw','id'].map(locale=>({locale,html:readFileSync(new URL('../'+(locale?locale+'/':'')+'index.html',import.meta.url),'utf8')}));
const esc=html.slice(html.indexOf('function escHtml('),html.indexOf('\n',html.indexOf('function escHtml(')));

// renderDailyPanel까지 돌리려는 slice 밖 의존성은 실제 구현을 prelude로 얹는다.
// lastQ/cosv/relPct는 index.html의 /* ---- 결과 ---- */ 이후에 선언되어 slice에 없다.
const EXTRA=`
var lastQ=null;
function cosv(a,b){let c=0;for(let i=0;i<a.length;i++)c+=a[i]*b[i];return c;}
function relPct(c,dist){const mu=dist.reduce((a,b)=>a+b)/dist.length;const sd=Math.sqrt(dist.reduce((a,b)=>a+(b-mu)**2,0)/dist.length)||1;return Math.max(5,Math.min(99,Math.round(100*(0.55+0.45*Math.tanh((c-mu)/(2*sd))))));}
`;

const SINGERS=Array.from({length:5},(_,i)=>({slug:'s'+i,name:'가수'+i,gk:true,emb:[1,0,0,0],hub:0}));
const BOARD={success:true,day:'20261116',entries:3,rankings:[
  {user_id:'a',nickname:'AAA',pct:70,country:'KR'},
  {user_id:'b',nickname:'BBB',pct:60,country:'TW'},
]};

function harness(handler=()=>BOARD,lang='ko',page=html){
  const source=page.slice(page.indexOf('/* ---- 랭킹 ---- */'),page.indexOf('/* ---- 결과 ---- */'));
  const elements=new Map(),requests=[],timers=new Map();let timer=0,now='2026-11-16T03:00:00Z',singerLoad=async()=>SINGERS;
  const document={activeElement:null,querySelectorAll:()=>[],addEventListener(){},createElement:tag=>new Element(tag),getElementById:id=>elements.get(id)||null};
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this._html='';this.textContent='';this.isConnected=true;
      this.classList={_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},toggle(c){this._s.has(c)?this._s.delete(c):this._s.add(c)},contains(c){return this._s.has(c)}};}
    set id(v){this._id=v;elements.set(v,this);}get id(){return this._id;}
    set innerHTML(v){this._html=v;}
    get innerHTML(){return this._html;}
    setAttribute(k,v){this.attributes[k]=String(v);}
    appendChild(el){this.children.push(el);el.parent=this;return el;}
  }
  document.body=new Element('body');
  const box=new Element('div');box.id='r-daily';box.classList.add('hidden');document.body.appendChild(box);
  const banner=new Element('div');banner.id='daily-banner';banner.classList.add('hidden');document.body.appendChild(banner);
  const storage=new Map();
  const ctx=vm.createContext({vmEv(){},document,console,URLSearchParams,AbortController,Math,JSON,
    Date:class extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return new Date(now).getTime();}},
    setTimeout:(fn,ms)=>{timers.set(++timer,{fn,ms});return timer;},clearTimeout:id=>timers.delete(id),
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},
    atob:s=>Buffer.from(s,'base64').toString('binary'),
    window:{_singersCache:SINGERS},ensureSingers:()=>singerLoad(),
    fetch:async(url,options={})=>{requests.push({url,options});const r=await handler(url,options);if(r instanceof Error)throw r;return{ok:true,json:async()=>r};}});
  vm.runInContext(i18n,ctx);
  vm.runInContext("const $=id=>document.getElementById(id);let LANG="+JSON.stringify(lang)+";const t=k=>I18N[LANG][k]??I18N.en[k];"+EXTRA+esc+source,ctx);
  return {ctx,box,requests,storage,timers,elements,clock:v=>{now=v;},load:fn=>{singerLoad=fn;},run:s=>vm.runInContext(s,ctx)};
}

test('dailyDiffVs: signed %p only when the stored result is yesterday',()=>{
  const h=harness();
  assert.equal(h.run("dailyDiffVs({day:'20261115',pct:40},'20261115',55)"),15);
  assert.equal(h.run("dailyDiffVs({day:'20261115',pct:90},'20261115',55)"),-35);
  assert.equal(h.run("dailyDiffVs({day:'20261114',pct:40},'20261115',55)"),null);
  assert.equal(h.run("dailyDiffVs(null,'20261115',55)"),null);
  assert.equal(h.run("dailyDiffVs({day:'20261115',pct:'x'},'20261115',55)"),null);
});
test('getDailyLastPct validates shape; saveDailyLastPct roundtrips',()=>{
  const h=harness();
  h.run("localStorage.setItem('vm_daily_last','not json')");
  assert.equal(h.run("getDailyLastPct()"),null);
  h.run("localStorage.setItem('vm_daily_last',JSON.stringify({day:'2026',pct:55}))");
  assert.equal(h.run("getDailyLastPct()"),null);
  h.run("saveDailyLastPct('20261116',55)");
  assert.deepEqual(h.run("getDailyLastPct()"),{day:'20261116',pct:55});
});
const fixtures={
  'absent provenance':BOARD,
  'untrusted artist metadata':{...BOARD,artist:'s0',scoreVersion:'claimed',rankings:BOARD.rankings.map(r=>({...r,artist:'s0'}))},
  'entries above 50':{...BOARD,entries:60,rankings:Array.from({length:50},()=>({pct:90}))},
  'known truncated list':{...BOARD,entries:10,rankings:[{pct:90}]},
  'offline':new Error('offline'),
};
for(const {locale,html:page} of pages){
  for(const [label,board] of Object.entries(fixtures)){
    test(`${locale||'root'}: unsubmitted ${label} never fetches or renders an estimate`,async()=>{
      const h=harness(()=>board,locale||'ko',page);
      h.run("setDailyResult([1,0,0,0],'20261116');saveDailyLastPct('20261115',40);localStorage.setItem('vm_streak_last','20261115');localStorage.setItem('vm_streak_n','3')");
      await h.run('renderDailyPanel()');
      assert.equal(h.requests.length,0,'no estimate GET, even for plausible artist metadata');
      assert.equal(h.box.classList.contains('hidden'),false);
      assert.deepEqual([...h.box.innerHTML.matchAll(/<div class="dl-rank">(.*?)<\/div>/g)].map(m=>m[1]),
        [h.run("t('dailyVsYday')(15)")],'only yesterday diff, no estimated rank text');
      assert.match(h.box.innerHTML,/55%/);
      for(const key of ['lb_login','lb_loginBtn','dailyBoardBtn','dailyShareBtn'])assert.ok(h.box.innerHTML.includes(h.run(`t('${key}')`)),key);
      assert.ok(h.box.innerHTML.includes(h.run("t('dailyVsYday')(15)")));
      assert.ok(h.box.innerHTML.includes(h.run("t('dailyStreak')(4)")));
      assert.match(h.box.innerHTML,/showDailyBoard\(\)/);
      assert.match(h.box.innerHTML,/shareDaily\(\)/);
      assert.match(h.box.innerHTML,/SharedWallet.showLogin\(\)/);
      assert.equal(h.storage.get('vm_streak_last'),'20261116');
      assert.equal(h.storage.get('vm_streak_n'),'4');
      assert.equal(h.storage.get('vm_daily_last'),'{"day":"20261116","pct":55}');
      assert.equal(h.run('typeof estDailyRank'),'undefined','estimate-only helper removed');
    });
  }
  for(const failure of [{success:false},new Error('offline')]){
    test(`${locale||'root'}: failed registered submission retains local result and actions without estimate GET`,async()=>{
      const h=harness((url,o)=>o.method==='POST'?failure:BOARD,locale||'ko',page);
      const jwt='h.'+Buffer.from(JSON.stringify({sub:'u9',isAnonymous:false,nickname:'Me'})).toString('base64')+'.x';
      h.run(`setDailyResult([1,0,0,0],'20261116');localStorage.setItem('cocy_auth_token','${jwt}');saveDailyLastPct('20261115',40)`);
      await h.run('renderDailyPanel()');
      assert.equal(h.requests.length,1,'only the existing submission POST');
      assert.equal(h.requests[0].options.method,'POST');
      assert.deepEqual(JSON.parse(h.requests[0].options.body),{userId:'u9',artist:h.run('_dailyLast.tgt.slug'),pct:55});
      assert.match(h.box.innerHTML,/55%/);
      assert.deepEqual([...h.box.innerHTML.matchAll(/<div class="dl-rank">(.*?)<\/div>/g)].map(m=>m[1]),[h.run("t('dailyVsYday')(15)")]);
      assert.doesNotMatch(h.box.innerHTML,/dl-login|dl-main/);
      assert.match(h.box.innerHTML,/showDailyBoard\(\)/);
      assert.match(h.box.innerHTML,/shareDaily\(\)/);
      assert.equal(h.storage.get('vm_daily_last'),'{"day":"20261116","pct":55}');
    });
  }
}
test('yesterday record produces signed %p line, then today overwrites it',async()=>{
  const h=harness();
  h.run("setDailyResult([1,0,0,0],'20261116')");
  h.run("localStorage.setItem('vm_daily_last',JSON.stringify({day:'20261115',pct:40}))");
  await h.run('renderDailyPanel()');
  assert.match(h.box.innerHTML,/어제 대비 \+15%p/);
  assert.equal(h.storage.get('vm_daily_last'),'{"day":"20261116","pct":55}');
});
test('non-login streak continues from yesterday and renders',async()=>{
  const h=harness();
  h.run("setDailyResult([1,0,0,0],'20261116')");
  h.run("localStorage.setItem('vm_streak_last','20261115');localStorage.setItem('vm_streak_n','3')");
  await h.run('renderDailyPanel()');
  assert.match(h.box.innerHTML,/🔥 4일 연속 도전 중!/);
  assert.equal(h.storage.get('vm_streak_n'),'4');
});
for(const {locale,html:page} of pages){
  test(`${locale||'root'}: registered submit, real rank, reward and ordinary daily share remain`,async()=>{
    const h=harness((url,o)=>o.method==='POST'?{success:true,day:'20261116',myRank:5,myPct:55}:BOARD,locale||'ko',page);
    const jwt='h.'+Buffer.from(JSON.stringify({sub:'u9',isAnonymous:false,nickname:'Me'})).toString('base64')+'.x';
    h.run(`setDailyResult([1,0,0,0],'20261116');localStorage.setItem('cocy_auth_token','${jwt}')`);
    await h.run('renderDailyPanel()');
    assert.deepEqual([...h.box.innerHTML.matchAll(/<div class="dl-rank">(.*?)<\/div>/g)].map(m=>m[1]),[h.run("t('dailyMyRank')(5)")]);
    assert.match(h.box.innerHTML,/claimDailyGold\(this,'20261116',5,\d+\)/);
    assert.match(h.box.innerHTML,/showDailyBoard\(\)/);
    assert.match(h.box.innerHTML,/shareDaily\(\)/);
    assert.equal(h.storage.get('vm_daily_last'),'{"day":"20261116","pct":55}');
    assert.equal(h.requests.length,1);
    assert.equal(h.requests[0].options.method,'POST');
    h.run("var shared=[];function vmShareUrl(kind,data){return 'fixture:'+kind+':'+data.slug+':'+data.pct;}async function shareOrCopy(text,id){shared.push({text,id});}");
    await h.run('shareDaily()');
    assert.equal(h.run('shared.length'),1);
    assert.equal(h.run('shared[0].id'),'dl-share');
    assert.equal(h.run('shared[0].text'),h.run("t('dailyShareText')(singerName(_dailyLast.tgt,LANG),55)+'\\nfixture:daily:'+_dailyLast.tgt.slug+':55'"));
  });
}
test('every locale retains dailyVsYday',()=>{
  for(const lang of ['ko','en','ja','es','pt','tw','id']){
    const h=harness(undefined,lang);
    assert.equal(typeof h.run('t("dailyVsYday")'),'function',lang);
  }
});

test('footprints promo: 7 locales, below animalface promo', () => {
  for (const loc of ['ko','en','ja','es','tw','id','pt']) {
    const blk = i18n.slice(i18n.indexOf(`\n  ${loc}: {`));
    assert.ok(/xpromo2T: '.+', xpromo2S: '.+'/.test(blk.slice(0, 20000)), loc);
  }
  assert.ok(html.indexOf('id="xpromo"') < html.indexOf('id="xpromo2"'));
  assert.ok(html.includes("page.cocy.io/footprints/"));
});

// VM-I07f: deterministic UTC clock + controllable target/POST completion.
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
function result(h,q='[1,0,0,0]',day='20261116'){
  h.run(`if(typeof setDailyResult==='function')setDailyResult(${q},'${day}');else lastQ=${q}`);
}
function registered(h){h.storage.set('cocy_auth_token','h.'+Buffer.from(JSON.stringify({sub:'u9',isAnonymous:false})).toString('base64')+'.x');}
const rollover=h=>h.clock('2026-11-17T00:00:00Z');
for(const {locale,html:page} of pages){
  const make=fn=>harness(fn,locale||'ko',page);
  test(`${locale||'root'}: target load crossing midnight never saves or POSTs`,async()=>{
    const d=deferred(),h=make();registered(h);result(h);h.load(()=>d.promise);
    const pending=h.run('renderDailyPanel()');rollover(h);d.resolve(SINGERS);await pending;
    assert.equal(h.requests.length,0);assert.equal(h.storage.has('vm_daily_last'),false);
    assert.equal(h.box.classList.contains('hidden'),true);assert.equal(h.run('_dailyLast'),null);
  });
  test(`${locale||'root'}: newer query wins over a deferred target`,async()=>{
    const d=deferred(),h=make();result(h);h.load(()=>d.promise);
    const old=h.run('renderDailyPanel()');h.load(async()=>SINGERS);result(h,'[0,1,0,0]');
    await h.run('renderDailyPanel()');const saved=h.storage.get('vm_daily_last'),markup=h.box.innerHTML;
    d.resolve(SINGERS);await old;assert.equal(h.storage.get('vm_daily_last'),saved);assert.equal(h.box.innerHTML,markup);
    assert.equal(h.run('_dailyLast.owner.q===lastQ'),true);
  });
  test(`${locale||'root'}: reset invalidates pending target`,async()=>{
    const d=deferred(),h=make();registered(h);result(h);h.load(()=>d.promise);
    const pending=h.run('renderDailyPanel()');h.run("if(typeof clearDailyResult==='function')clearDailyResult();else lastQ=null");
    d.resolve(SINGERS);await pending;assert.equal(h.requests.length,0);assert.equal(h.run('_dailyLast'),null);
  });
  test(`${locale||'root'}: midnight immediately before POST fails closed`,async()=>{
    const h=make();registered(h);result(h);
    // Scoring is synchronous, but guards must be immediately adjacent to dispatch.
    h.ctx.crossMidnight=()=>rollover(h);h.run('const originalDailyPct=dailyPct;dailyPct=(...a)=>{const p=originalDailyPct(...a);crossMidnight();return p;}');
    await h.run('renderDailyPanel()');assert.equal(h.requests.length,0);assert.equal(h.storage.has('vm_daily_last'),false);
  });
  test(`${locale||'root'}: stale POST cannot overwrite later result/local/share state`,async()=>{
    const d=deferred();let posts=0;const h=make(()=>++posts===1?d.promise:{success:true,day:'20261116',myRank:7});registered(h);result(h);
    const old=h.run('renderDailyPanel()');await new Promise(r=>setImmediate(r));
    result(h,'[0,1,0,0]');await h.run('renderDailyPanel()');
    const saved=[...h.storage],markup=h.box.innerHTML,share=h.run('_dailyLast');
    d.resolve({success:true,day:'20261116',myRank:1});await old;
    assert.deepEqual([...h.storage],saved);assert.equal(h.box.innerHTML,markup);assert.equal(h.run('_dailyLast'),share);
  });
  test(`${locale||'root'}: POST response after midnight cannot save streak or show reward`,async()=>{
    const d=deferred(),h=make(()=>d.promise);registered(h);result(h);
    const pending=h.run('renderDailyPanel()');await new Promise(r=>setImmediate(r));rollover(h);
    d.resolve({success:true,day:'20261117',myRank:1});await pending;
    assert.equal(h.storage.has('vm_streak_last'),false);assert.equal(h.box.classList.contains('hidden'),true);
    assert.equal(h.run('_dailyLast'),null);
  });
  test(`${locale||'root'}: rollover share/reward and rerender never relabel old audio`,async()=>{
    const h=make(()=>({success:true,day:'20261116',myRank:5}));registered(h);result(h);await h.run('renderDailyPanel()');
    h.run("var shared=[];function vmShareUrl(){return 'fixture';}async function shareOrCopy(text){shared.push(text)}");
    rollover(h);await h.run('shareDaily()');h.run("claimDailyGold(null,'20261116',5,1)");await h.run('renderDailyPanel()');
    assert.equal(h.run('shared.length'),0);assert.equal(h.storage.has('vm_daily_claimed_20261116'),false);
    assert.equal(h.requests.length,1);assert.equal(h.box.classList.contains('hidden'),true);assert.equal(h.run('_dailyLast'),null);
    assert.equal(JSON.parse(h.storage.get('vm_daily_last')).day,'20261116');
  });
}

for(const {locale,html:page} of pages){
  test(`${locale||'root'}: banner target/count keep captured day and latest request`,async()=>{
    const d=deferred(),h=harness(()=>d.promise,locale||'ko',page),el=h.elements.get('daily-banner');
    const old=h.run('renderDailyBanner()');await new Promise(r=>setImmediate(r));
    assert.match(h.requests[0].url,/day=20261116&limit=1/);
    rollover(h);h.run('expireDailyViews()');
    d.resolve({success:true,day:'20261116',entries:99});await old;
    assert.equal(el.classList.contains('hidden'),true);assert.doesNotMatch(el.innerHTML,/99/);
    const load=deferred();h.load(()=>load.promise);const slow=h.run('renderDailyBanner()');
    h.load(async()=>SINGERS);await h.run('renderDailyBanner()');const markup=el.innerHTML;
    load.resolve(SINGERS);await slow;assert.equal(el.innerHTML,markup);
  });
  test(`${locale||'root'}: reset during POST leaves no local record or share`,async()=>{
    const d=deferred(),h=harness(()=>d.promise,locale||'ko',page);registered(h);result(h);
    const old=h.run('renderDailyPanel()');await new Promise(r=>setImmediate(r));h.run('clearDailyResult()');
    d.resolve({success:true,day:'20261116',myRank:1});await old;
    assert.equal(h.storage.has('vm_daily_last'),false);assert.equal(h.storage.has('vm_streak_last'),false);
    assert.equal(h.run('_dailyLast'),null);assert.equal(h.box.classList.contains('hidden'),true);
  });
  test(`${locale||'root'}: same-day reward requires current panel identity`,async()=>{
    const h=harness(()=>({success:true,day:'20261116',myRank:5}),locale||'ko',page);registered(h);result(h);
    await h.run('renderDailyPanel()');const old=h.run('_dailyLast.seq');
    await h.run('renderDailyPanel()');h.run(`claimDailyGold(null,'20261116',5,${old})`);
    assert.equal(h.storage.has('vm_daily_claimed_20261116'),false);
    h.run("claimDailyGold(null,'20261116',5,_dailyLast.seq)");
    assert.equal(h.storage.get('vm_daily_claimed_20261116'),'1');
  });
  test(`${locale||'root'}: daily board closes stale day and ignores replaced modal`,async()=>{
    const h=harness(undefined,locale||'ko',page);
    h.run("var boards=[],pendingBoards=[];openBoard=()=>{const content={innerHTML:'',contains:()=>false,setAttribute(){}};const m={isConnected:true,closeBoard(){this.isConnected=false;}};const b={m,content,heading:{textContent:''}};boards.push(b);return b;};fetchBoard=()=>new Promise(resolve=>pendingBoards.push(resolve));");
    const first=h.run('showDailyBoard()');await new Promise(r=>setImmediate(r));
    h.run('boards[0].m.isConnected=false');const second=h.run('showDailyBoard()');await new Promise(r=>setImmediate(r));
    h.run("pendingBoards[0]({rankings:[]});pendingBoards[1]({rankings:[]})");await first;
    assert.doesNotMatch(h.run('boards[0].content.innerHTML'),/20261116 UTC/);
    rollover(h);h.run("pendingBoards[2]({rankings:[]});pendingBoards[3]({rankings:[]})");await second;
    assert.equal(h.run('boards[1].m.isConnected'),false);
  });
}

test('restored duet keeps original audio day; legacy audio stays usable without daily relabeling',async()=>{
  const h=harness(),duet=html.slice(html.indexOf('function saveDuetSelf('),html.indexOf('function buildInviteUrl('));
  h.run("var lastPitch=null;function packEmb(q){return q}function b64uEnc(q){return q}function b64uDec(q){return q}function unpackEmb(q){return q}function renderResult(){return renderDailyPanel()}"+duet);
  result(h);h.run("saveDuetSelf({q:[1,0,0,0],rank:[{slug:'s0',pct:55}]},'20261116')");
  rollover(h);await h.run('duetInstant()');await new Promise(r=>setImmediate(r));
  assert.equal(h.run('dailyResult.day'),'20261116');assert.equal(h.box.classList.contains('hidden'),true);
  assert.equal(h.storage.has('vm_daily_last'),false);assert.equal(h.run('lastQ.length'),4);
  h.run("const saved=JSON.parse(localStorage.getItem('vm_duet_self'));delete saved.day;localStorage.setItem('vm_duet_self',JSON.stringify(saved))");
  await h.run('duetInstant()');await new Promise(r=>setImmediate(r));
  assert.equal(h.run('dailyResult.day'),null);assert.equal(h.run('lastQ.length'),4);assert.equal(h.box.classList.contains('hidden'),true);
});
test('a server response for another day cannot save or render current daily state',async()=>{
  const h=harness(()=>({success:true,day:'20261117',myRank:1}));registered(h);result(h);
  await h.run('renderDailyPanel()');assert.equal(h.box.classList.contains('hidden'),true);
  assert.equal(h.storage.has('vm_daily_last'),false);assert.equal(h.storage.has('vm_streak_last'),false);assert.equal(h.run('_dailyLast'),null);
});
test('deferred native share failure cannot copy stale daily text or change a later share button',async()=>{
  const h=harness(),share=html.slice(html.indexOf('async function shareOrCopy('),html.indexOf('async function makeInvite('));
  const d=deferred();let copied=0;h.ctx.navigator={share:()=>d.promise,clipboard:{writeText:async()=>{copied++;}}};
  h.run(share+"function vmShareUrl(){return 'fixture'}");result(h);await h.run('renderDailyPanel()');
  const pending=h.run('shareDaily()');rollover(h);d.reject(new Error('cancelled'));await pending;
  assert.equal(copied,0);assert.equal(h.run('_dailyLast'),null);
});
test('ordinary rank submission and page copy handlers are unchanged',()=>{
  // These flows have separate ownership/contracts and are outside VM-I07f.
  const rank=html.slice(html.indexOf('async function rankFlow('),html.indexOf('function openBoard('));
  assert.doesNotMatch(rank,/current\(\)|r.day===day/);
  const copy=html.slice(html.indexOf('async function copyPageUrl('),html.indexOf('async function startRec('));
  assert.doesNotMatch(copy,/current\(\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const i18n=readFileSync(new URL('../i18n.js',import.meta.url),'utf8');
const source=html.slice(html.indexOf('/* ---- 랭킹 ---- */'),html.indexOf('/* ---- 결과 ---- */'));
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

function harness(handler=()=>BOARD,lang='ko'){
  const elements=new Map(),requests=[],timers=new Map();let timer=0;
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
  const storage=new Map();
  const ctx=vm.createContext({document,console,URLSearchParams,AbortController,Math,JSON,
    Date:class extends Date{constructor(...a){super(...(a.length?a:['2026-11-16T03:00:00Z']));}},
    setTimeout:(fn,ms)=>{timers.set(++timer,{fn,ms});return timer;},clearTimeout:id=>timers.delete(id),
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},
    atob:s=>Buffer.from(s,'base64').toString('binary'),
    window:{_singersCache:SINGERS},ensureSingers:async()=>SINGERS,
    fetch:async(url,options={})=>{requests.push({url,options});const r=await handler(url,options);if(r instanceof Error)throw r;return{ok:true,json:async()=>r};}});
  vm.runInContext(i18n,ctx);
  vm.runInContext("const $=id=>document.getElementById(id);let LANG="+JSON.stringify(lang)+";const t=k=>I18N[LANG][k]??I18N.en[k];"+EXTRA+esc+source,ctx);
  return {ctx,box,requests,storage,run:s=>vm.runInContext(s,ctx)};
}

test('estDailyRank: ties share the same rank (server pct > ? rule)',()=>{
  const h=harness();
  assert.equal(h.run("estDailyRank([{pct:90},{pct:80},{pct:80},{pct:70}],80)"),2);
  assert.equal(h.run("estDailyRank([{pct:80},{pct:80}],80)"),1);
});
test('estDailyRank: empty board means rank 1',()=>{
  const h=harness();
  assert.equal(h.run("estDailyRank([],55)"),1);
  assert.equal(h.run("estDailyRank(null,55)"),1);
});
test('estDailyRank: I am first when nobody beats my pct',()=>{
  const h=harness();
  assert.equal(h.run("estDailyRank([{pct:90},{pct:80}],99)"),1);
});
test('estDailyRank: I am last when everyone beats my pct',()=>{
  const h=harness();
  assert.equal(h.run("estDailyRank([{pct:90},{pct:80},{pct:70}],10)"),4);
});
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
test('non-login result shows estimated rank, streak and login CTA; public GET only',async()=>{
  const h=harness();
  h.run('lastQ=[1,0,0,0]');
  await h.run('renderDailyPanel()');
  assert.equal(h.box.classList.contains('hidden'),false);
  assert.match(h.box.innerHTML,/오늘 3명 중 예상 3위/);       // pct=55 < 70,60 → est 3 of 3
  assert.match(h.box.innerHTML,/로그인하면 랭킹에 이름을 남길 수 있어요/);
  assert.equal(h.storage.get('vm_streak_last'),'20261116');
  assert.equal(h.storage.get('vm_streak_n'),'1');
  assert.equal(h.storage.get('vm_daily_last'),'{"day":"20261116","pct":55}');
  assert.equal(h.requests.length,1);
  assert.match(h.requests[0].url,/^https:\/\/relay\.cocy\.io\/api\/rankings\/voicematch-daily\?day=20261116&limit=50$/);
  assert.equal(h.requests[0].options.method||'GET','GET');
});
test('board fetch failure omits the estimate silently, panel still renders',async()=>{
  const h=harness(()=>new Error('offline'));
  h.run('lastQ=[1,0,0,0]');
  await h.run('renderDailyPanel()');
  assert.equal(h.box.classList.contains('hidden'),false);
  assert.doesNotMatch(h.box.innerHTML,/예상/);
  assert.match(h.box.innerHTML,/오늘의 랭킹/);
});
test('yesterday record produces signed %p line, then today overwrites it',async()=>{
  const h=harness();
  h.run('lastQ=[1,0,0,0]');
  h.run("localStorage.setItem('vm_daily_last',JSON.stringify({day:'20261115',pct:40}))");
  await h.run('renderDailyPanel()');
  assert.match(h.box.innerHTML,/어제 대비 \+15%p/);
  assert.equal(h.storage.get('vm_daily_last'),'{"day":"20261116","pct":55}');
});
test('non-login streak continues from yesterday and renders',async()=>{
  const h=harness();
  h.run('lastQ=[1,0,0,0]');
  h.run("localStorage.setItem('vm_streak_last','20261115');localStorage.setItem('vm_streak_n','3')");
  await h.run('renderDailyPanel()');
  assert.match(h.box.innerHTML,/🔥 4일 연속 도전 중!/);
  assert.equal(h.storage.get('vm_streak_n'),'4');
});
test('registered submit path unchanged: real rank, no estimate, local record still saved',async()=>{
  const h=harness((url,o)=>o.method==='POST'?{success:true,day:'20261116',myRank:5,myPct:55}:BOARD);
  h.run('lastQ=[1,0,0,0]');
  const jwt='h.'+Buffer.from(JSON.stringify({sub:'u9',isAnonymous:false,nickname:'Me'})).toString('base64')+'.x';
  h.run(`localStorage.setItem('cocy_auth_token','${jwt}')`);
  await h.run('renderDailyPanel()');
  assert.match(h.box.innerHTML,/오늘 전세계 5위!/);
  assert.doesNotMatch(h.box.innerHTML,/예상/);
  assert.equal(h.storage.get('vm_daily_last'),'{"day":"20261116","pct":55}');
  assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].options.method,'POST');
});
test('every locale has dailyEstRank and dailyVsYday',()=>{
  for(const lang of ['ko','en','ja','es','pt','tw','id']){
    const h=harness(undefined,lang);
    assert.equal(typeof h.run('t("dailyEstRank")'),'function',lang);
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

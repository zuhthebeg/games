import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const i18n=readFileSync(new URL('../i18n.js',import.meta.url),'utf8');
const source=html.slice(html.indexOf('/* ---- 랭킹 ---- */'),html.indexOf('/* ---- 결과 ---- */'));
const esc=html.slice(html.indexOf('function escHtml('),html.indexOf('\n',html.indexOf('function escHtml(')));
const locales=['ko','en','ja','es','pt','tw','id'];

// Deliberately small DOM: real inline ranking code, real locale dictionary, no third-party DOM dependency.
function harness(handler=()=>({success:true,rankings:[],day:'20261116',entries:0}),lang='en',full=false){
  const elements=new Map(), requests=[], timers=new Map();let timer=0;
  const document={activeElement:null,documentElement:{},querySelectorAll:()=>[],addEventListener(){},createElement:tag=>new Element(tag),getElementById:id=>elements.get(id)||null};
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.style={};this.dataset={};this._html='';this.textContent='';this.isConnected=true;this.listeners={};this.classList={add(){},remove(){},toggle(){}};}
    set id(v){this._id=v;elements.set(v,this);}get id(){return this._id;}
    set innerHTML(value){this._html=value;this.children=[];for(const m of value.matchAll(/<(button|div|h3|p|span)[^>]*id="([^"]+)"[^>]*>/g)){const el=new Element(m[1]);el.id=m[2];this.appendChild(el);}}
    get innerHTML(){return this._html;}
    appendChild(el){this.children.push(el);el.parent=this;return el;}
    setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k];}
    querySelector(q){if(q[0]==='#')return elements.get(q.slice(1))||null;return this.querySelectorAll(q)[0]||null;}
    querySelectorAll(q){return this.children.flatMap(c=>[c,...c.querySelectorAll(q)]).filter(e=>q.includes('button')?e.tagName==='BUTTON':false);}
    addEventListener(k,fn){this.listeners[k]=fn;}removeEventListener(k){delete this.listeners[k];}
    focus(){document.activeElement=this;}click(){return this.onclick?.({target:this});}
    remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);for(const [k,v]of elements)if(v===this||this.children.includes(v))elements.delete(k);}
    contains(el){return el===this||this.children.some(c=>c.contains(el));}
  }
  document.body=new Element('body');
  for(const id of ['entry-ranking','entry-rank-title','entry-rank-hint','entry-rank-date','entry-rank-list','btn-entry-board','btn-entry-retry','btn-start']){const e=new Element(id.startsWith('btn')?'button':'div');e.id=id;document.body.appendChild(e);}
  if(full)for(const match of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"/g)){if(!elements.has(match[2])){const e=new Element(match[1]);e.id=match[2];document.body.appendChild(e);}}
  const storage=new Map();
  const ctx=vm.createContext({document,console,URLSearchParams,AbortController,Date:class extends Date{constructor(...args){super(...(args.length?args:['2026-11-16T03:00:00Z']));}},setTimeout:(fn,ms)=>{timers.set(++timer,{fn,ms});return timer;},clearTimeout:id=>timers.delete(id),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},atob:s=>Buffer.from(s,'base64').toString('binary'),Blob,window:{_singersCache:[{slug:'iu',name:'아이유',gk:true}]},ensureSingers:async()=>[{slug:'iu',name:'아이유',gk:true}],fetch:async(url,options={})=>{requests.push({url,options});const response=await handler(url,options);if(response instanceof Error)throw response;return {ok:true,json:async()=>response,...response?.response};}});
  vm.runInContext(i18n,ctx);
  if(full){
    ctx.navigator={language:lang,userAgent:'test',sendBeacon(){return true},mediaDevices:{getUserMedia(){throw Error('unexpected microphone request');}}};
    ctx.location={search:'',hash:'',pathname:'/voicematch/'+lang+'/'};
    ctx.Worker=class{addEventListener(){}postMessage(){throw Error('unexpected model action');}};
    ctx.SharedWallet={init(){},_initialized:true,showLogin(){throw Error('unexpected login');},addGold(){throw Error('unexpected reward');}};
    ctx.window.SharedWallet=ctx.SharedWallet;
    const inline=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
    vm.runInContext(inline,ctx);
  }else vm.runInContext("const $=id=>document.getElementById(id);let LANG="+JSON.stringify(lang)+";const t=k=>I18N[LANG][k]??I18N.en[k];"+esc+source,ctx);
  return {ctx,document,elements,requests,timers,storage,run:s=>vm.runInContext(s,ctx)};
}

const rows=Array.from({length:5},(_,i)=>({user_id:'u'+i,nickname:i===0?'<img src=x onerror=alert(1)>':'Player'+i,pct:99-i,country:'KR'}));
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};

test('entry is below primary CTA, auto-loads on language apply, and exposes named live preview',()=>{
  assert.match(html, /id="entry-ranking"/);
  assert.ok(html.indexOf('id="btn-start"')<html.indexOf('id="entry-ranking"'));
  assert.ok(html.indexOf('id="entry-ranking"')<html.indexOf('id="xpromo"'));
  assert.match(html,/id="entry-rank-list"[^>]*aria-live="polite"/);
  const apply=html.slice(html.indexOf('function applyLang()'),html.indexOf('const LANGS='));
  assert.match(apply,/renderEntryRanking\(\)/);
});

test('preview uses public daily GET only, shows top 3 in API order, escapes nicknames',async()=>{
  const h=harness(()=>({success:true,rankings:rows,day:'20261116',entries:5}));
  await h.run('renderEntryRanking()');
  const markup=h.elements.get('entry-rank-list').innerHTML;
  assert.equal((markup.match(/class="lb-row/g)||[]).length,3);
  assert.match(markup,/&lt;img/);assert.doesNotMatch(markup,/<img|Player3/);
  assert.ok(markup.indexOf('99%')<markup.indexOf('98%'));
  assert.match(h.elements.get('entry-rank-date').textContent,/2026-11-16.*UTC/);
  assert.equal(h.requests.length,1);assert.match(h.requests[0].url,/voicematch-daily\?day=20261116&limit=3$/);
  assert.equal(h.requests[0].options.method,'GET');assert.doesNotMatch(h.requests[0].url,/me=|user/);
  assert.equal(h.storage.size,0);
});

test('loading, empty, failure and retry stay distinct and never disable singing',async()=>{
  let resolve;const h=harness(()=>new Promise(r=>resolve=r));
  const pending=h.run('renderEntryRanking()');
  assert.match(h.elements.get('entry-rank-list').innerHTML,/Loading/);
  assert.equal(h.elements.get('entry-rank-list').getAttribute('aria-busy'),'true');
  resolve({success:true,rankings:[],day:'20261116',entries:0});await pending;
  assert.match(h.elements.get('entry-rank-list').innerHTML,/No challengers/);
  assert.equal(h.elements.get('entry-rank-list').getAttribute('aria-busy'),'false');
  assert.notEqual(h.elements.get('btn-start').disabled,true);
  let fail=true;const f=harness(()=>fail?new Error('offline'):{success:true,rankings:rows,day:'20261116'});
  await f.run('renderEntryRanking()');
  assert.match(f.elements.get('entry-rank-list').innerHTML,/Could not load/);
  assert.doesNotMatch(f.elements.get('entry-rank-list').innerHTML,/No challengers/);
  fail=false;await f.elements.get('btn-entry-retry').click();await flush();
  assert.match(f.elements.get('entry-rank-list').innerHTML,/99%/);
  assert.notEqual(f.elements.get('btn-start').disabled,true);
});

for(const [name,result]of Object.entries({http:{response:{ok:false}},api:{success:false,rankings:[]},schema:{success:true},row:{success:true,rankings:[{nickname:'x',pct:'99'}]},wrongDay:{success:true,rankings:[],day:'20261115'}})){
  test('preview treats '+name+' failure as error, not empty',async()=>{
    const h=harness(()=>result);await h.run('renderEntryRanking()');
    assert.match(h.elements.get('entry-rank-list').innerHTML,/Could not load/);
  });
}

test('request timeout is bounded and aborts the GET',async()=>{
  let signal;const h=harness((url,opts)=>{signal=opts.signal;return new Promise(()=>{});});
  const pending=h.run('renderEntryRanking()');
  const timeout=[...h.timers.values()].find(x=>x.ms>0&&x.ms<=10000);
  assert.ok(timeout);timeout.fn();await pending;
  assert.equal(signal.aborted,true);assert.match(h.elements.get('entry-rank-list').innerHTML,/Could not load/);
});

test('modal opens immediately, reuses ranking rows, closes with Escape and restores focus',async()=>{
  const h=harness(url=>({success:true,rankings:rows,day:new URL(url).searchParams.get('day')}));
  const opener=h.elements.get('btn-entry-board');opener.focus();
  const pending=h.run('showDailyBoard(true)');
  const modal=h.elements.get('lb-modal');assert.ok(modal);
  assert.equal(modal.getAttribute('role'),'dialog');assert.equal(modal.getAttribute('aria-modal'),'true');
  assert.equal(modal.getAttribute('aria-labelledby'),'lb-title');
  assert.equal(h.document.activeElement.id,'lb-close');
  await pending;
  const content=h.elements.get('lb-content').innerHTML;
  assert.match(content,/99%/);assert.doesNotMatch(content,/<img/);
  assert.ok(h.requests.every(r=>(r.options.method||'GET')==='GET'&&!r.url.includes('me=')));
  let prevented=false;modal.onkeydown({key:'Tab',shiftKey:false,preventDefault(){prevented=true;}});assert.equal(prevented,true);
  modal.onkeydown({key:'Escape',preventDefault(){}});
  assert.equal(h.elements.has('lb-modal'),false);assert.equal(h.document.activeElement,opener);
});

test('daily modal separates failed today from yesterday, provides retry',async()=>{
  let fail=true;const h=harness(url=>url.includes('20261115')?{success:true,rankings:rows.slice(0,3),day:'20261115'}:fail?new Error('offline'):{success:true,rankings:[],day:'20261116'});
  await h.run('showDailyBoard(true)');
  assert.match(h.elements.get('lb-content').innerHTML,/Could not load/);
  assert.match(h.elements.get('lb-content').innerHTML,/Yesterday/);
  assert.ok(h.elements.get('lb-retry'));fail=false;
  await h.elements.get('lb-retry').click();await flush();
  assert.match(h.elements.get('lb-content').innerHTML,/No challengers/);
});

test('post-result artist board keeps artist metric and my rank, safely escaped',async()=>{
  const h=harness(()=>({success:true,rankings:rows,myRank:12,myPct:83}));
  h.run("authUser=()=>({userId:'signed-in',registered:true})");
  await h.run("showBoard('iu')");
  assert.match(h.requests[0].url,/artist=iu&me=signed-in/);
  assert.match(h.elements.get('lb-title').textContent,/TOP 10/);
  assert.match(h.elements.get('lb-content').innerHTML,/12/);
  assert.doesNotMatch(h.elements.get('lb-content').innerHTML,/<img/);
});

test('every existing language has new entry, loading, error, retry and today strings',()=>{
  for(const lang of locales){const h=harness(undefined,lang);
    for(const key of ['entryRankTitle','entryRankHint','entryRankView','lb_loading','lb_error','lb_retry','dailyToday']){
      assert.equal(h.run('typeof I18N[LANG]['+JSON.stringify(key)+']'),'string',lang+' '+key);
    }
  }
});

for(const lang of locales)test('actual initial page script boots and permits preplay ranking in '+lang,async()=>{
  const h=harness(url=>({success:true,rankings:rows,day:new URL(url).searchParams.get('day')||'20261116',entries:5}),lang,true);
  await flush();
  assert.ok(h.elements.get('btn-start').textContent);
  assert.match(h.elements.get('entry-rank-list').innerHTML,/99%/);
  await h.elements.get('btn-entry-board').click();
  assert.ok(h.elements.get('lb-modal'));
  assert.ok(h.requests.every(r=>(r.options.method||'GET')==='GET'));
  assert.deepEqual([...h.storage.keys()],['vm_visit_day']);
});

test('late response cannot replace a newer preview',async()=>{
  const pending=[];const h=harness(()=>new Promise(resolve=>pending.push(resolve)));
  const first=h.run('renderEntryRanking()'),second=h.run('renderEntryRanking()');
  pending[1]({success:true,rankings:rows.slice(1),day:'20261116'});await second;
  pending[0]({success:true,rankings:[],day:'20261116'});await first;
  assert.match(h.elements.get('entry-rank-list').innerHTML,/98%/);
  assert.doesNotMatch(h.elements.get('entry-rank-list').innerHTML,/No challengers/);
});

test('modal retry preserves keyboard focus when the retry button is removed',async()=>{
  const h=harness(()=>new Error('offline'));
  await h.run('showDailyBoard(true)');
  const retry=h.elements.get('lb-retry');retry.focus();
  const pending=retry.click();assert.equal(h.document.activeElement.id,'lb-close');await pending;
});

test('late board fetch does not reopen a dismissed modal',async()=>{
  let finish;const h=harness(()=>new Promise(r=>finish=r));
  const pending=h.run("showBoard('iu')");
  h.elements.get('lb-close').click();finish({success:true,rankings:rows});await pending;
  assert.equal(h.elements.has('lb-modal'),false);
});

test('failed initial leaderboard still permits the existing microphone consent sheet',async()=>{
  const h=harness(()=>new Error('offline'),'en',true);
  await flush();assert.match(h.elements.get('entry-rank-list').innerHTML,/Could not load/);
  await h.elements.get('btn-start').click();
  assert.match(h.elements.get('mic-t').textContent,/mic/i);
  assert.deepEqual([...h.storage.keys()],['vm_visit_day']);
  assert.ok(h.requests.every(r=>(r.options.method||'GET')==='GET'));
});

test('public entry browsing never even reads an existing signed-in identity',async()=>{
  const h=harness(url=>({success:true,rankings:rows,day:new URL(url).searchParams.get('day')}));
  h.run("authUser=()=>{throw Error('identity must not be read for entry browsing')}");
  await h.run('renderEntryRanking()');await h.elements.get('btn-entry-board').click();
  assert.match(h.elements.get('lb-content').innerHTML,/99%/);
  assert.ok(h.requests.every(r=>!r.url.includes('me=')&&r.options.credentials==='omit'));
});

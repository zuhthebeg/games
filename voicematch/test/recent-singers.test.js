import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const i18n=readFileSync(new URL('i18n.js',root),'utf8');
const source=html.slice(html.indexOf('/* ---- 새로 추가된 가수 ---- */'),html.indexOf('/* ---- 새 가수 쇼케이스 끝 ---- */'));
const modal=html.slice(html.indexOf('async function openArtistList('),html.indexOf("$('btn-all').onclick=openArtistList;"));
const esc=html.slice(html.indexOf('function escHtml('),html.indexOf('\n',html.indexOf('function escHtml(')));
function harness(data={recent:[]},lang='en',idle=true){
  const elements=new Map(),requests=[],timers=[],idles=[],opened=[];
  class Element{
    constructor(){this.children=[];this.attributes={};this.classes=new Set(['hidden']);this.classList={toggle:(k,on)=>on?this.classes.add(k):this.classes.delete(k)};}
    set innerHTML(v){this.html=v;this.children=[];for(const m of v.matchAll(/id="([^"]+)"/g))elements.set(m[1],new Element());}get innerHTML(){return this.html||'';}
    appendChild(el){this.children.push(el);return el;}setAttribute(k,v){this.attributes[k]=v;}querySelector(q){return elements.get(q.slice(1));}
    remove(){elements.delete(this.id);}
  }
  for(const id of ['recent-singers','recent-chips','recent-title','btn-all'])elements.set(id,new Element());
  const document={createElement:()=>new Element(),body:new Element()};
  const ctx=vm.createContext({document,console,Date,setTimeout:(fn,ms)=>timers.push({fn,ms}),window:idle?{requestIdleCallback:(fn,opt)=>idles.push({fn,opt})}:{},fetch:async url=>{requests.push(url);if(data instanceof Error)throw data;return{ok:data?.ok!==false,json:async()=>data};},openArtistList:slug=>opened.push(slug)});
  vm.runInContext(i18n,ctx);
  ctx.elements=elements;
  vm.runInContext("const $=id=>elements.get(id);let LANG="+JSON.stringify(lang)+";const t=k=>I18N[LANG][k];"+esc+source,ctx);
  return{ctx,elements,requests,timers,idles,opened,run:s=>vm.runInContext(s,ctx)};
}
const artist=(i=0)=>({slug:'singer_'+i,name:'가수 '+i,added:'2026-11-19',intl:1});
for(const [name,data] of [['missing',{}],['empty',{recent:[]}],['null',null],['network failure',Error('offline')],['HTTP failure',{ok:false}],['malformed',{recent:[null,{},artist(1),{...artist(2),added:'bad'}]}]]){
  test('recent feed '+name+' is quiet and safe',async()=>{
    const h=harness(data);await h.run('loadRecentSingers()');
    const n=name==='malformed'?1:0;
    assert.equal(h.elements.get('recent-chips').children.length,n);
    assert.equal(h.elements.get('recent-singers').classes.has('hidden'),!n);
    assert.deepEqual(h.requests,['recent.json']);
  });
}
test('feed is deferred until timer then idle, with timer fallback',async()=>{
  const h=harness();assert.equal(h.requests.length,0);assert.equal(h.timers.length,1);
  h.timers[0].fn();assert.equal(h.requests.length,0);assert.equal(h.idles.length,1);
  assert.equal(h.idles[0].opt.timeout,3000);await h.idles[0].fn();assert.deepEqual(h.requests,['recent.json']);
  const f=harness({},'en',false);f.timers[0].fn();assert.equal(f.timers[1].ms,1200);assert.equal(f.requests.length,0);await f.timers[1].fn();assert.equal(f.requests.length,1);
});
test('maximum eight chips, deduplicated, date and pool labels, click only browses',async()=>{
  const h=harness({recent:[artist(0),artist(0),...Array.from({length:12},(_,i)=>artist(i+1))]});await h.run('loadRecentSingers()');
  const chips=h.elements.get('recent-chips').children;assert.equal(chips.length,8);
  const b=chips[0].children[0];assert.match(b.innerHTML,/All artists/);assert.match(b.innerHTML,/11\/19/);b.onclick();assert.deepEqual(h.opened,['singer_0']);
  assert.equal(h.run("recentPool({jp:1,intl:1})"),'jp');assert.equal(h.run('recentPool({})'),'kr');
  assert.doesNotMatch(source,/poolPref\s*=|vmView\s*=|vmEv\(|CATALOG_URL|ensureSingers\(/);
});
test('NEW is date-based, not an eternal badge',()=>{
  const h=harness();assert.equal(h.run("recentIsNew('2026-11-19',Date.parse('2026-11-20T00:00:00Z'))"),true);
  for(const d of ['2026-11-01','2026-12-01','bad'])assert.equal(h.run('recentIsNew('+JSON.stringify(d)+",Date.parse('2026-11-20T00:00:00Z'))"),false);
});
test('shared names, English fallback, safe markup, language refresh',async()=>{
  const h=harness({recent:[{slug:'iu',name:'<img>',added:'2026-11-19'}]});await h.run('loadRecentSingers()');
  assert.match(h.elements.get('recent-chips').children[0].children[0].innerHTML,/>IU</);
  assert.equal(h.run("recentName({slug:'new_artist',name:'새가수'})"),'new artist');
  assert.equal(h.run("recentName({slug:'new_band',name:'New Band'})"),'New Band');
  h.run("LANG='ko';renderRecentSingers()");assert.match(h.elements.get('recent-chips').children[0].children[0].innerHTML,/&lt;img&gt;/);
  assert.match(html.slice(html.indexOf('function applyLang()'),html.indexOf('const LANGS=')),/renderRecentSingers\(\)/);
});
test('chip opens existing catalog prefiltered to exact slug; All button remains unfiltered',async()=>{
  const h=harness();h.run("let catalogCache={artists:[{slug:'iu',name:'아이유',genre:'팝'},{slug:'other',name:'Other',genre:'팝'},{slug:'iu_extra',name:'IU Extra',genre:'팝'}]};const CATALOG_URL='catalog.json';function normName(s){return String(s).toLowerCase();}");
  vm.runInContext(modal,h.ctx);await h.run("openArtistList('iu')");assert.equal(h.elements.get('al-q').value,'iu');assert.match(h.elements.get('al-list').innerHTML,/IU/);assert.doesNotMatch(h.elements.get('al-list').innerHTML,/Other|Extra/);
  h.elements.delete('al-modal');await h.run('openArtistList({target:{}})');assert.equal(h.elements.get('al-q').value,'');assert.match(h.elements.get('al-list').innerHTML,/Other/);
});
test('seven locales have keys, correct feed URL and bumped shared i18n',()=>{
  const h=harness();for(const l of ['ko','en','ja','es','pt','tw','id']){
    for(const k of ['recentTitle','recentAdded','recentPoolkr','recentPooljp','recentPoolall'])assert.equal(h.run('typeof I18N.'+l+'.'+k),'string');
    const page=readFileSync(new URL(l+'/index.html',root),'utf8');assert.match(page,/RECENT_URL='\/voicematch\/recent.json'/);assert.match(page,/i18n.js\?v=20261120cp/);
  }
  assert.match(html,/#recent-chips\{[^}]*overflow-x:auto/);
});
test('published feed is below 5KB, has twelve valid matching pool flags and SW is network-first',()=>{
  const raw=readFileSync(new URL('recent.json',root));assert.ok(raw.length<=5000);const recent=JSON.parse(raw).recent;assert.equal(recent.length,12);
  const singers=JSON.parse(readFileSync(new URL('singers.json',root)));for(const a of recent){const s=singers.find(s=>s.slug===a.slug);assert.ok(s);assert.equal(!!a.intl,!!s.intl);assert.equal(!!a.jp,!!s.jp);}
  const sw=readFileSync(new URL('sw.js',root),'utf8');assert.match(sw,/fetch\(req\)\.then/);assert.doesNotMatch(sw.slice(sw.indexOf('HEAVY_RE ='),sw.indexOf("self.addEventListener('install'")),/json/);
});

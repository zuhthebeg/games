import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const i18n=readFileSync(new URL('../i18n.js',import.meta.url),'utf8');
const source=html.slice(html.indexOf('/* ---- 인트로 소셜 진입 ---- */'),html.indexOf('/* ---- 인트로 소셜 끝 ---- */'));
function harness(saved=null,blocked=false){
  const storage=new Map(saved?[['vm_social_intent',saved]]:[]),elements=new Map(),scrolls=[],events=[];
  for(const id of ['intro-social','social-notice','btn-social-duet','btn-social-group','btn-start','duet-banner','group-banner','s-result','r-duetcta','r-groupcta']){
    const classes=new Set(['social-notice','duet-banner','group-banner','s-result','r-duetcta','r-groupcta'].includes(id)?['hidden']:[]);
    elements.set(id,{textContent:'',classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k),toggle(k,v){v?classes.add(k):classes.delete(k);}},scrollIntoView:o=>scrolls.push({id,...o}),focus:o=>{ctx.focused=id;},setAttribute(){}});
  }
  const ctx=vm.createContext({vmEv:ev=>events.push(ev),$:id=>elements.get(id),sessionStorage:{getItem:k=>{if(blocked)throw Error('blocked');return storage.get(k)||null;},setItem:(k,v)=>{if(blocked)throw Error('blocked');storage.set(k,v);},removeItem:k=>{if(blocked)throw Error('blocked');storage.delete(k);}},document:{},window:{matchMedia:()=>({matches:false})},show:id=>{ctx.shown=id;elements.get('s-result').classList.remove('hidden');}});
  vm.runInContext(i18n,ctx);
  vm.runInContext("let LANG='ko',lastQ=null;const DUET={in:null},GROUP={in:null};const t=k=>I18N[LANG][k];"+source,ctx);
  return{events,elements,storage,scrolls,ctx,run:s=>vm.runInContext(s,ctx)};
}
test('intro has one compact social card below start and before ranking',()=>{
  assert.match(html,/id="intro-social"/);
  assert.ok(html.indexOf('id="btn-start"')<html.indexOf('id="intro-social"'));
  assert.ok(html.indexOf('id="intro-social"')<html.indexOf('id="entry-ranking"'));
  assert.match(html,/id="social-notice"[^>]*role="status"/);
});
for(const intent of ['duet','group'])test(intent+' stores intent and guides to start without recording',()=>{
  const h=harness();h.run('renderIntroSocial()');h.elements.get('btn-social-'+intent).onclick();
  assert.equal(h.storage.get('vm_social_intent'),intent);assert.equal(h.ctx.focused,'btn-start');
  assert.equal(h.scrolls.at(-1).id,'btn-start');assert.equal(h.elements.get('social-notice').classList.contains('hidden'),false);
  assert.match(h.elements.get('social-notice').textContent,/녹음/);
  assert.doesNotMatch(source,/startRec|getUserMedia/);
});
for(const banner of ['duet-banner','group-banner'])test(banner+' hides card and notice',()=>{
  const h=harness('duet');h.elements.get(banner).classList.remove('hidden');h.run('renderIntroSocial()');
  assert.equal(h.elements.get('intro-social').classList.contains('hidden'),true);
  assert.equal(h.elements.get('social-notice').classList.contains('hidden'),true);
});
test('pending group invite hides card before async banner fetch resolves',()=>{
  const h=harness();h.run("GROUP.in='abc';renderIntroSocial()");assert.equal(h.elements.get('intro-social').classList.contains('hidden'),true);
});
for(const intent of ['duet','group'])test(intent+' consumes only when result and CTA are visible',()=>{
  const h=harness(intent);h.run('lastQ=[1];consumeSocialIntent()');assert.equal(h.storage.get('vm_social_intent'),intent);
  h.elements.get('s-result').classList.remove('hidden');h.run('consumeSocialIntent()');assert.equal(h.storage.get('vm_social_intent'),intent);
  h.elements.get('r-'+intent+'cta').classList.remove('hidden');h.run('consumeSocialIntent()');
  assert.equal(h.storage.has('vm_social_intent'),false);assert.equal(h.scrolls.at(-1).id,'r-'+intent+'cta');assert.equal(h.scrolls.at(-1).behavior,'smooth');
  const n=h.scrolls.length;h.run('consumeSocialIntent()');assert.equal(h.scrolls.length,n);
});
for(const intent of ['duet','group'])test(intent+' with existing analysis goes straight to result CTA',()=>{
  const h=harness();h.elements.get('r-'+intent+'cta').classList.remove('hidden');h.run("lastQ=[1];renderIntroSocial()");h.elements.get('btn-social-'+intent).onclick();
  assert.equal(h.ctx.shown,'s-result');assert.equal(h.scrolls.at(-1).id,'r-'+intent+'cta');assert.equal(h.storage.size,0);
});
test('blocked storage retains current-page intent; unknown values ignored',()=>{
  const h=harness(null,true);h.run("renderIntroSocial()");assert.doesNotThrow(()=>h.elements.get('btn-social-duet').onclick());
  h.elements.get('s-result').classList.remove('hidden');h.elements.get('r-duetcta').classList.remove('hidden');h.run('lastQ=[1];consumeSocialIntent()');assert.equal(h.scrolls.at(-1).id,'r-duetcta');
  assert.equal(harness('bad').run('readSocialIntent()'),null);
});
test('reloaded intent restores notice without requesting the microphone',()=>{
  const h=harness('group');h.run('renderIntroSocial()');assert.match(h.elements.get('social-notice').textContent,/그룹/);assert.equal(h.elements.get('social-notice').classList.contains('hidden'),false);
});
test('reduced motion uses immediate scrolling and invalid choice is inert',()=>{
  const h=harness();h.ctx.window.matchMedia=()=>({matches:true});h.run("selectSocialIntent('group')");assert.equal(h.scrolls.at(-1).behavior,'auto');const n=h.scrolls.length;h.run("selectSocialIntent('bad')");assert.equal(h.scrolls.length,n);
});
for(const lang of ['ko','en','ja','es','pt','tw','id'])test(lang+' has explicit social labels and notices',()=>{
  const h=harness();for(const key of ['socialDuet','socialGroup','socialDuetHint','socialGroupHint'])assert.equal(h.run('typeof I18N.'+lang+'.'+key),'string');
});
test('result render hooks cover synchronous duet and asynchronous group CTA readiness',()=>{
  const result=html.slice(html.indexOf('function renderResult('),html.indexOf('/* ---- 2단계:'));
  assert.match(result,/consumeSocialIntent()/);
  const group=html.slice(html.indexOf('async function renderGroupPanels('),html.indexOf('/* ---- 내 요청 추적:'));
  assert.match(group,/consumeSocialIntent()/);
});

for(const kind of ['duet','group'])test(kind+' emits only from intro activation, not render or intent restoration',()=>{
 const h=harness(kind);h.run('renderIntroSocial();renderIntroSocial();consumeSocialIntent()');assert.deepEqual(h.events,[]);
 h.run("selectSocialIntent('"+kind+"')");assert.deepEqual(h.events,[]);
 h.elements.get('btn-social-'+kind).onclick();assert.deepEqual(h.events,['social_tap_'+kind]);
 h.elements.get('r-'+kind+'cta').classList.remove('hidden');h.run('lastQ=[1];consumeSocialIntent()');assert.deepEqual(h.events,['social_tap_'+kind]);
});

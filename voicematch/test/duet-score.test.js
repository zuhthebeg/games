import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

for(const locale of ['','ko/','en/','ja/','es/','pt/','tw/','id/']){
  const html=readFileSync(new URL('../'+locale+'index.html',import.meta.url),'utf8');
  const source=html.slice(html.indexOf('function renderDuetPanels(){'),html.indexOf('/* ---- 그룹 완성 모드 ----'));
  const esc=html.slice(html.indexOf('function escHtml('),html.indexOf('\n',html.indexOf('function escHtml(')));
  function render(p){
    const nodes=Object.fromEntries(['r-duet','duet-share','duet-return'].map(id=>[id,{innerHTML:'',classList:{add(){},remove(){}},querySelectorAll:()=>[]}]));
    const ctx=vm.createContext({DUET:{in:{p,n:'<b>Friend</b>',s:'fixture'}},lastQ:[1],lastResult:[{name:'<i>Me</i>',pct:88}],LANG:'en',DUET_ANON:{},window:{_singersCache:[{slug:'fixture',name:'<em>Singer</em>'}]},$:id=>nodes[id],computeDuet:()=>({total:80,tone:70,range:null,taste:null,type:'harmony'}),singerName:s=>s.name,t:k=>k==='duetReturn'?n=>'Return '+n:k,requestAnimationFrame:fn=>fn(),renderDuetSetlist(){},sendDuetBack(){},dataLayer:[]});
    vm.runInContext(esc+source+'renderDuetPanels()',ctx);
    assert.equal(typeof nodes['duet-share'].onclick,'function');
    assert.equal(typeof nodes['duet-return'].onclick,'function');
    assert.match(nodes['r-duet'].innerHTML,/duet-big/);
    assert.match(nodes['r-duet'].innerHTML,/&lt;b&gt;Friend&lt;\/b&gt;/);
    return nodes['r-duet'].innerHTML;
  }
  test((locale||'root')+' rejects malformed incoming scores without coercion or lost participation',()=>{
    const poison={toString(){throw Error('coerced string');},valueOf(){throw Error('coerced number');},[Symbol.toPrimitive](){throw Error('coerced primitive');}};
    for(const p of ['<em id="p-probe">probe</em>','50','',[],[50],true,false,null,undefined,{},poison,NaN,Infinity,-Infinity,-0.01,100.01])assert.doesNotMatch(render(p),/class="duet-tops"/);
  });
  test((locale||'root')+' displays inclusive zero, fractions and 100 exactly with escaped names',()=>{
    for(const p of [0,0.125,87.654321,100]){
      const out=render(p);
      assert.ok(out.includes('&lt;em&gt;Singer&lt;/em&gt; '+p+'%'));
      assert.ok(out.includes('&lt;i&gt;Me&lt;/i&gt; 88%'));
    }
  });
}

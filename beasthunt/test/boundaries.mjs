// Real browser boundary regressions; frozen rAF and explicit wall time.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire('/home/cocy/.openclaw/workspace/')('playwright');
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const ctx=await browser.newContext();
 await ctx.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8791/')?r.continue():r.abort());
 await ctx.addInitScript(()=>{window.requestAnimationFrame=()=>0;window.wall=1000;performance.now=()=>window.wall;});
 const page=await ctx.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8791/beasthunt/?lowfx=1');await page.waitForFunction(()=>window.__bh);
 const results=await page.evaluate(()=>{
  const B=window.__bh, out=[], advance=n=>{for(let i=0;i<n;i++){wall+=1000/60;B.step(1/60);}};
  for(const hidden of [false,true]) for(const action of ['attack','heavy','roll','potion']) {
   B.start('q1');const h=B.hunt;Object.assign(h.p,{state:'stun',t:1.15,hp:50});
   B.input.press(action);B.input.release(action);advance(1);
   if(hidden){Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;}
   else document.querySelector('#pauseBtn').click();
   const cleared=Object.values(h.p.buffer).every(n=>n===0);
   wall+=10000;document.querySelector('#resume').click();advance(10);
   out.push({name:'R1 '+(hidden?'hidden ':'pause ')+action,pass:cleared&&h.p.state==='idle',state:h.p.state,cleared});B.end();
  }
  for(const action of ['attack','heavy','roll','potion']) {
   B.start('q1');const h=B.hunt;Object.assign(h.p,{state:'stun',t:1.05,hp:50});
   B.input.press(action);B.input.release(action);wall+=240;advance(18);
   out.push({name:'R2 aged '+action,pass:h.p.state==='idle',state:h.p.state});B.end();
  }
  B.start('q1');const h=B.hunt;Object.assign(h.p,{x:24,z:20,state:'dead',hp:0,t:2.299});h.frame(1/60+1/120);
  out.push({name:'R3 respawn',pass:h.H.root.position.x===h.p.x&&h.H.root.position.z===h.p.z,sim:[h.p.x,h.p.z],render:[h.H.root.position.x,h.H.root.position.z]});B.end();
  return out;
 });
 for(const r of results)console.log((r.pass?'PASS ':'FAIL ')+JSON.stringify(r));
 assert.deepEqual(errors,[]);assert.equal(results.filter(r=>!r.pass).length,0);console.log('ALL PASS '+results.length+' boundary cases');
} finally {await browser.close();}

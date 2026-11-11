// Independent 2026-11-11 reviewer probe copy: only fixed invariants/import paths updated.
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire('/home/cocy/.openclaw/workspace/')('playwright');const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
const ctx=await browser.newContext({viewport:{width:390,height:780},hasTouch:true,isMobile:true});await ctx.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8791/')?r.continue():r.abort());
const fixture={v:1,shards:17654,mats:{b_hide:37,b_gem:2,e_tail:6},w:{gs:3,db:2,bow:4},armor:3,weapon:'bow',clears:{q1:{n:3,best:84.17},q2:{n:2,best:117.5}}};
await ctx.addInitScript(f=>{if(location.origin==='http://127.0.0.1:8791')localStorage.setItem('beasthunt_save_v1',JSON.stringify(f));window.requestAnimationFrame=()=>0},fixture);
const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/ERR_|Failed to load resource/.test(m.text()))errors.push(m.text())});
await page.goto('http://127.0.0.1:8791/beasthunt/?lowfx=1');await page.waitForFunction(()=>window.__bh);assert.deepEqual(await page.evaluate(()=>window.__bh.save),fixture);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('beasthunt_save_v1'))),fixture);
await page.locator('[data-q=q1]').tap();await page.locator('#depart').tap();
const cdp=await ctx.newCDPSession(page);const box=await page.locator('#joyZone').boundingBox();const joy={x:box.x+65,y:box.y+box.height-70,id:1};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[joy]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...joy,y:joy.y-52}]});
await page.evaluate(()=>window.__bh.step(1/60,220));await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
const moved=await page.evaluate(()=>({z:window.__bh.hunt.p.z,held:window.__bh.input.joy.y}));assert.ok(moved.z>-20);assert.equal(moved.held,0);
let taps=0;for(let i=0;i<500;i++){
 if(i%20===0){await page.locator('[data-act=attack]').tap();taps++;}
 if(i%130===0)await page.locator('[data-act=roll]').tap();
 await page.evaluate(()=>window.__bh.step(1/60,6));
 if(await page.evaluate(()=>window.__bh.hunt.over))break;
}
const combat=await page.evaluate(()=>({hp:window.__bh.hunt.m.hp,maxHp:window.__bh.hunt.m.maxHp,carts:window.__bh.hunt.carts,over:window.__bh.hunt.over,win:window.__bh.hunt.win}));
// If needed, let AI resolve the untouched remainder; no debug damage or invulnerability.
await page.evaluate(()=>{const B=window.__bh;for(let i=0;i<30000&&!B.hunt.ended;i++)B.step(1/60)});
const end=await page.evaluate(()=>({ended:window.__bh.hunt.ended,result:!document.querySelector('#result').hidden,carts:window.__bh.hunt.carts,win:window.__bh.hunt.win}));assert.ok(end.ended&&end.result);
await page.locator('#resBack').tap();
const findings=await page.evaluate(()=>{
 const B=window.__bh,out={};B.start('q1');let h=B.hunt;h.skipRender=true;h.p.x=24;h.p.z=20;h.p.state='dead';h.p.hp=0;h.p.t=2.299;h.frame(1/60+1/120);out.respawn={sim:[h.p.x,h.p.z],render:[h.H.root.position.x,h.H.root.position.z],alpha:h.ticker.alpha};B.end();
 // Regression: a wall-time 250ms old input must not gain a new 16-tick lifetime.
 B.start('q1');h=B.hunt;h.p.state='stun';h.p.t=1.05;B.input.pressed.attack=performance.now()-250;h.frame(1/60);for(let i=0;i<17;i++)h.frame(1/60);out.oldInput={state:h.p.state,t:h.p.t};B.end();
 // Regression: UI pause must clear platform input and the pending sim buffer.
 B.start('q1');h=B.hunt;h.p.state='stun';h.p.t=1.15;B.input.press('attack');B.input.release('attack');h.frame(1/60);document.querySelector('#pauseBtn').click();out.pauseBuffer={...h.p.buffer};h.frame(60);document.querySelector('#resume').click();for(let i=0;i<10;i++)h.frame(1/60);out.afterResume=h.p.state;B.end();return out;
});
console.log(JSON.stringify({saveLossless:true,touch:{moved,taps,combat,end},findings,errors},null,2));assert.equal(findings.afterResume,'idle');assert.equal(findings.oldInput.state,'idle');assert.deepEqual(findings.respawn.render,findings.respawn.sim);
assert.deepEqual(errors,[]);console.log(JSON.stringify({saveLossless:true,touch:{moved,taps,combat,end},findings,errors},null,2));
}finally{await browser.close()}

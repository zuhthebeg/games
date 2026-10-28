import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url)),port=8997,base='http://127.0.0.1:'+port,pause=ms=>new Promise(r=>setTimeout(r,ms));
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});const report={rows:[],errors:[],screenshots:0};
try{
for(let i=0;i<50;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await pause(100);}
for(const width of [1280,390]){
 const ctx=await browser.newContext({viewport:{width,height:844},hasTouch:width===390,isMobile:width===390});
 // Test-only module instrumentation captures the renderer; never shipped or world-mutating.
 await ctx.route('**/js/render/renderer.js*',async route=>{const r=await route.fetch();let s=await r.text();s=s.replace('this.app = app;','this.app = app; globalThis.__mp1Renderer=this;');await route.fulfill({response:r,body:s});});
 await ctx.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
 const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});const requests=[];page.on('request',r=>{if(r.url().includes('/mine-lift/lift.webp'))requests.push(r.url());});
 await page.goto(base+'/arpg/?character=human');await page.waitForFunction(()=>window.__arpg);
 assert.equal(requests.length,0);
 await page.evaluate(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');const {trained}=await import('./test/fixtures/trained.js');const s=trained(createSave({name:'MP1',weapon:'blade',answers:[0,0,0,0,0],createdAt:1}),30);s.cleared.S10=true;s.stacks.potion=20;new SaveStore(localStorage).save(s);localStorage.setItem('arpg.autoAttack','0');});
 await page.reload();await page.locator('#inn-name').waitFor();
 const activate=async sel=>{const l=page.locator(sel).first();await l.scrollIntoViewIfNeeded();if(width===390)await l.tap();else{await l.focus();await page.keyboard.press('Enter');}};
 await activate('[data-action="board"]');await activate('[data-action="map-region"][data-region="mine"]');await activate('[data-action="sortie"][data-stage="M_MINE_CART"]');await activate('[data-action="launch"]');
 await page.waitForFunction(()=>__arpg.world?.round.stageId==='M_MINE_CART'&&__mp1Renderer.mineLift.sprite.visible);
 const observe=()=>page.evaluate(()=>{const r=__mp1Renderer,l=r.mineLift,s=l.sprite,b=s.getBounds();return {active:l.state.active,loaded:!!l.state.asset,failed:l.state.failed,frame:s.texture.frame.x/192+s.texture.frame.y/192*8,seconds:l.state.seconds,visible:s.visible,bounds:{x:b.x,y:b.y,w:b.width,h:b.height},scale:r.scale,layer:r.root.children.indexOf(s.parent),telegraphLayer:r.root.children.indexOf(r.layers.telegraphs),entityLayer:r.root.children.indexOf(r.layers.entities),anchor:{x:s.anchor.x,y:s.anchor.y}};});
 const first=await observe();await pause(650);const second=await observe();assert.notEqual(first.frame,second.frame);assert.ok(first.layer<first.telegraphLayer&&first.layer<first.entityLayer);assert.ok(first.bounds.x+first.bounds.w>0&&first.bounds.x<width&&first.bounds.y+first.bounds.h>0&&first.bounds.y<844);assert.equal(requests.length,1);report.rows.push({width,input:width===390?'native touch':'native keyboard',first,second,requests:requests.length});
 // Pure isolated render fixture, with the same actual atlas and failure path.
 const fixture=await page.evaluate(async()=>{const {Container}=await import('./vendor/pixi-8.22.0.min.mjs');const {createMineLift}=await import('./js/render/mine-lift.js');const c=new Container(),l=createMineLift(c);l.reset('S12');const noRequest=!l.state.pending;l.reset('M_MINE_CART');await l.state.pending;l.update(.5,false);const ok=l.sprite.visible&&l.sprite.texture.frame.x===384;const texture=l.state.asset.base;l.reset('S1');return {noRequest,ok,hidden:!l.sprite.visible,disposed:texture.destroyed};});assert.deepEqual(fixture,{noRequest:true,ok:true,hidden:true,disposed:true});report.rows.at(-1).fixture=fixture;
 await ctx.route('**/mine-lift/lift.webp',r=>r.fulfill({status:200,contentType:'image/webp',body:'invalid webp'}));
 const failed=await page.evaluate(async()=>{const {Container}=await import('./vendor/pixi-8.22.0.min.mjs');const {createMineLift}=await import('./js/render/mine-lift.js');const l=createMineLift(new Container());l.reset('M_MINE_CART');await l.state.pending;l.update(1,false);return {failed:l.state.failed,visible:l.sprite.visible,asset:l.state.asset};});assert.deepEqual(failed,{failed:true,visible:false,asset:null});report.rows.at(-1).decodeFailure=failed;
 await ctx.close();
}
assert.deepEqual(report.errors,[]);report.status='PASS';
}finally{await writeFile('/home/cocy/.openclaw/workspace/tmp/arpg-mp1-native.json',JSON.stringify(report,null,2));await browser.close();server.kill();}
console.log(JSON.stringify(report));

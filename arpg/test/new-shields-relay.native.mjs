// Fresh synthetic preboot saves; ordinary native UI; real deployed relay.
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';import {spawn,execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {writeFile} from 'node:fs/promises';
import {createSave,validateSave} from '../js/meta/save.js';import {trained} from './fixtures/trained.js';import {instance} from '../js/meta/items.js';import {SHIELDS} from '../js/content/shields.js';
const root=fileURLToPath(new URL('../..',import.meta.url)),base=process.env.ARPG_BASE_URL||'http://127.0.0.1:8975',out=process.env.ARPG_NEW_SHIELDS_RELAY_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-new-shields/relay-local.json';
const server=process.env.ARPG_BASE_URL?null:spawn('python3',['-m','http.server','8975','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const report={status:'RUNNING',head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),base,rows:[],errors:[],screenshots:0,worldWrites:0,liveSaveReads:0},pause=ms=>new Promise(r=>setTimeout(r,ms));
async function client(width,id){const s=trained(createSave({name:id,weapon:'blade',answers:[0,0,0,0,0],createdAt:123}),30);s.items.push(instance('shield',id,0,[]));s.equipped.offhand='shield';s.cleared.S1=true;s.autoUse={potion:false,hp:50,mp:50,recall:false};assert.ok(validateSave(s));
 const ctx=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390});await ctx.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));await ctx.route('**/api.qrserver.com/**',r=>r.abort());await ctx.addInitScript(s=>{if(['http:','https:'].includes(location.protocol)&&!localStorage.getItem('new-shield-fixture')){localStorage.setItem('arpg.save.v1',JSON.stringify(s));localStorage.setItem('arpg.autoAttack','0');localStorage.setItem('new-shield-fixture','1');}},s);
 const page=await ctx.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));const wire=[];page.on('websocket',ws=>{const r={url:ws.url(),snapshots:[],events:[]};wire.push(r);ws.on('framereceived',f=>{try{const d=JSON.parse(f.payload).data;if(d?.t==='snapshot')r.snapshots.push({tick:d.tick,players:d.entities.filter(e=>e.kind==='player').map(e=>({pid:e.pid,hp:e.hp,mp:e.mp,cds:e.cds,shieldModel:e.shieldModel}))});for(const e of d?.events||[])r.events.push(e);}catch{}});});
 const press=async sel=>{await page.bringToFront();const n=page.locator(sel).first();await n.scrollIntoViewIfNeeded();width===390?await n.tap():await n.click();};return {ctx,page,width,id,wire,press};}
async function enter(c){await c.page.goto(base+'/arpg/?character=human');await c.page.locator('#inn-name').waitFor();}
async function move(c,dx,dy,ms){await c.page.bringToFront();if(c.width===390){const cdp=await c.ctx.newCDPSession(c.page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:50,y:500,id:4}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:50+dx*40,y:500+dy*40,id:4}]});await pause(ms);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else{const keys=[...(dx>.2?['KeyD']:dx<-.2?['KeyA']:[]),...(dy>.2?['KeyS']:dy<-.2?['KeyW']:[])];for(const k of keys)await c.page.keyboard.down(k);await pause(ms);for(const k of keys)await c.page.keyboard.up(k);}}
try{
 for(let i=0;i<40;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await pause(100);}
 for(const [width,hostType,guestType]of [[1280,'buckler','kite_shield'],[390,'tower_shield','bone_shield']]){
 const h=await client(width,hostType),g=await client(width,guestType),row={width,hostType,guestType,hostWire:h.wire,guestWire:g.wire};report.rows.push(row);await enter(h);await enter(g);
 await h.press('[data-action="board"]');await h.press('[data-action="coop"]');await h.press('#mpl-create');await h.page.waitForFunction(()=>document.querySelectorAll('#mpl-list .mpl-pl').length===1);
 const invite=decodeURIComponent(await h.page.locator('img[alt="입장 QR"]').getAttribute('src')).split('&data=')[1];await g.page.goto(invite);await g.press('[data-action="choose-human"]');await g.page.waitForFunction(()=>document.querySelectorAll('#mpl-list .mpl-pl').length===2);await g.press('#mpl-ready');await h.page.waitForFunction(()=>!document.querySelector('#mpl-start').disabled);await h.page.locator('#arpg-party-stage').selectOption('S2');await h.press('#mpl-start');
 for(const c of [h,g])await c.page.waitForFunction(()=>__arpg.multi?.phase==='running'&&__arpg.world?.entities.filter(e=>e.kind==='player').length===2);
 assert.equal(await h.page.evaluate(()=>__arpg.multi.ownsSim),true);assert.equal(await g.page.evaluate(()=>__arpg.multi.ownsSim),false);const guestUid=await g.page.evaluate(()=>__arpg.multi.uid);
 await g.page.waitForFunction(()=>__arpg.art.visuals.filter(v=>v.physicalShield).length===2);
 row.initialHost=await h.page.evaluate(()=>JSON.parse(JSON.stringify(__arpg.world.entities.filter(e=>e.kind==='player'))));row.initialGuest=await g.page.evaluate(()=>JSON.parse(JSON.stringify(__arpg.world.entities.filter(e=>e.kind==='player'))));
 for(const side of [row.initialHost,row.initialGuest])assert.deepEqual(side.map(e=>e.shieldModel.type).sort(),[hostType,guestType].sort());
 const expected=[SHIELDS[hostType].shape,SHIELDS[guestType].shape].sort();assert.deepEqual(await g.page.evaluate(()=>__arpg.art.visuals.filter(v=>v.physicalShield).map(v=>v.physicalShield.shape).sort()),expected);
 // Native movement goes to the host; guest display remains a received/predicted view.
 const before=row.initialHost.find(p=>p.pid===guestUid);await move(g,0,1,300);await h.page.waitForFunction(({pid,y})=>__arpg.world.entities.find(e=>e.pid===pid).y>y+15,{pid:guestUid,y:before.y});
 // Native held guard reaches authority and is shown with the same model on guest.
 await g.page.bringToFront();let cdp;if(width===390){cdp=await g.ctx.newCDPSession(g.page);const b=await g.page.locator('#dodge').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:8}]});}else await g.page.keyboard.down('Space');
 await h.page.waitForFunction(pid=>__arpg.world.entities.find(e=>e.pid===pid).shieldGuard?.left>0,guestUid);await pause(1200);
 row.guardHost=await h.page.evaluate(pid=>{const e=__arpg.world.entities.find(e=>e.pid===pid);return {hp:e.hp,mp:e.mp,shieldModel:e.shieldModel,guard:e.shieldGuard};},guestUid);
 assert.deepEqual(row.guardHost.shieldModel,{v:1,type:guestType});assert.ok(row.guardHost.guard.left>0);assert.equal(await g.page.evaluate(()=>__arpg.multi.ownsSim),false);
 row.rendered=await g.page.evaluate(()=>__arpg.art.visuals.filter(v=>v.physicalShield));assert.deepEqual(row.rendered.map(v=>v.physicalShield.shape).sort(),expected);
 if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else await g.page.keyboard.up('Space');
 assert.ok(g.wire.some(w=>w.url.startsWith('wss://relay-do-poc.zuhejbeg.workers.dev/')&&w.snapshots.length>0));assert.ok(g.wire.flatMap(w=>w.snapshots).some(s=>s.players.some(p=>p.shieldModel?.type===guestType)));
 for(const c of [h,g]){assert.equal(await c.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await c.page.goto('about:blank');await c.ctx.close();}row.status='PASS';console.log(JSON.stringify({width,hostType,guestType,status:'PASS'}));
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{await writeFile(out,JSON.stringify(report,null,2));await browser.close();server?.kill();}

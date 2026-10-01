// Local-only, two isolated browsers, real MultiplayerLobby/WSClient/Session/physics.
// DO relay is a loopback protocol fixture. No remote writes and NO screenshots.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = await import('/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs');
const { wsServer: WebSocketServer } = require('/home/cocy/.openclaw/workspace/node_modules/playwright-core/lib/utilsBundle.js');
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
let base;
const http = createServer(async (req,res) => {
  try {
    let path=decodeURIComponent(new URL(req.url,'http://local').pathname);if(path.endsWith('/'))path+='index.html';
    const file=resolve(ROOT,'.'+path);assert.ok(file.startsWith(ROOT+'/'));
    const data=await readFile(file);res.setHeader('content-type',({'.js':'text/javascript','.html':'text/html','.mp3':'audio/mpeg','.webp':'image/webp','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(data);
  } catch {res.statusCode=404;res.end();}
});
await new Promise(r=>http.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+http.address().port;
const wss=new WebSocketServer({server:http}),peers=new Map(),messages=[];let seq=0,started=false;
const broadcast=(data,except)=>{for(const [uid,ws] of peers)if(uid!==except&&ws.readyState===1)ws.send(JSON.stringify(data));};
const roster=()=>broadcast({type:'roster',players:[...peers.keys()].map(user=>({user,nick:user,ready:true})),hostUser:peers.keys().next().value,connections:peers.size,started});
wss.on('connection',(ws,req)=>{const uid=new URL(req.url,base).searchParams.get('u');peers.set(uid,ws);roster();
  ws.on('message',raw=>{const p=JSON.parse(raw);messages.push({from:uid,...p});
    if(p.type==='start'){started=true;broadcast({type:'started',players:[...peers.keys()]});}
    else if(p.type==='action')broadcast({type:'event',event:{seq:++seq,data:p.action}});
    else if(p.type==='rt')broadcast({type:'rt',from:uid,data:p.data},uid);
    else if(p.type==='leave'){peers.delete(uid);roster();ws.close();}
    else if(p.type==='ready')roster();
  });ws.on('close',()=>{if(peers.get(uid)===ws){peers.delete(uid);roster();}});
});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-gpu']});
const errors=[],results={transport:'real two browser contexts → loopback WebSocket → actual shared WSClient → host physics/snapshot',remoteWrites:0,screenshots:0};
const pages=[];
try {
  for(const uid of ['host','guest']) {
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await ctx.route('**/*',async route=>{
      const url=route.request().url();if(!url.startsWith(base)){await route.abort();return;}
      if(url.includes('/lib/mp-lobby.js')){let code=await readFile(resolve(ROOT,'lib/mp-lobby.js'),'utf8');code=code.replace("var DEFAULT_WORKER = 'wss://relay-do-poc.zuhejbeg.workers.dev';",`var DEFAULT_WORKER = '${base.replace('http:','ws:')}';`);code=code.replace('this._injectStyles();','window.testLobby=this; this._injectStyles();');await route.fulfill({status:200,contentType:'text/javascript',body:code});return;}
      await route.continue();
    });
    await ctx.addInitScript(uid=>{
      if(location.hostname!=='127.0.0.1')return;
      localStorage.setItem('spud_uid',uid);localStorage.setItem('spud_mute','true');
      const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window),set=new Set();window.motionListeners=set;
      window.addEventListener=(type,cb,...rest)=>{if(type==='devicemotion')set.add(cb);return add(type,cb,...rest);};
      window.removeEventListener=(type,cb,...rest)=>{if(type==='devicemotion')set.delete(cb);return remove(type,cb,...rest);};
      window.fireShake=()=>{const e=new Event('devicemotion');Object.defineProperty(e,'acceleration',{value:{x:20,y:0,z:0}});window.dispatchEvent(e);};
    },uid);
    const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/spudsquad/?room=FOLLOWUP&debug=1');pages.push(page);
  }
  const [host,guest]=pages;
  for(const page of pages)await page.waitForFunction(()=>window.testLobby?._roster?.connections===2);
  await host.waitForTimeout(100);await host.evaluate(()=>testLobby._ws.start({}));
  for(const page of pages)await page.locator('[data-act="basic"]').click();
  for(const page of pages)await page.waitForFunction(()=>SPUD.main.mode==='wave');
  await host.evaluate(()=>{const w=SPUD.main.session.world;w.spawnClock=-1e9;w.bossSpawned=true;w.tm=999;for(const p of Object.values(w.players)){p.immune=1e9;p.cool=[1e9];}});
  results.initialHP=await host.evaluate(()=>Object.values(SPUD.main.session.world.players).map(p=>[p.hp,p.maxHp]));assert.deepEqual(results.initialHP,[[12,12],[12,12]]);
  // Host fires guest's actual weapon; inspect displacement after physics and then remote snapshot.
  results.knockback=[];
  for(const id of ['pistol','smg','shotgun','crossbow','slingshot','rocket','potato_cannon','boomerang','frost_wand','flamethrower','laser','staff']){
    const moved=await host.evaluate(id=>{
      const S=SPUD.sim,w=SPUD.main.session.world,p=w.players.guest;w.enemies=[];w.projectiles=[];p.weapons=[[id,1]];p.cool=[1e9];
      const e=S.spawn(w,'blob',p.x+170,p.y);e.speed=e.dmg=0;e.hp=e.maxHp=1e6;const start=e.x;
      S.weaponHit(w,p,id,1,e,0);for(let i=0;i<30;i++)S.step(w,1/30);
      return {id,enemy:e.id,start,x:e.x,damage:1e6-e.hp,kb:SPUD.data.weapons[id].kb};
    },id);
    assert.ok(moved.damage>0,id+' actual hit');if(moved.kb>0)assert.ok(moved.x>moved.start,id+' actual displacement');else assert.equal(moved.x,moved.start);
    await guest.waitForFunction(id=>SPUD.main.session.buffer.a.at(-1)?.s.e.some(e=>e[0]===id),moved.enemy);
    const x=await guest.evaluate(id=>SPUD.main.session.buffer.a.at(-1).s.e.find(e=>e[0]===id)[2],moved.enemy);assert.ok(Math.abs(x-moved.x)<=1,id+' authoritative snapshot position');
    results.knockback.push({...moved,guestX:x});
  }
  assert.equal(await guest.evaluate(()=>SPUD.main.session.world),null,'guest has no simulation world');
  // Dead mobile guest gets a live motion listener and can revive once in this wave.
  await host.evaluate(()=>{const p=SPUD.main.session.world.players.guest;p.alive=false;p.hp=0;});
  await guest.waitForFunction(()=>!document.getElementById('reviveBtn').hidden&&motionListeners.size===1);
  await guest.evaluate(async()=>{for(let i=0;i<20;i++){fireShake();await new Promise(r=>setTimeout(r,230));}});
  await host.waitForFunction(()=>SPUD.main.session.world.players.guest.alive);
  results.revive=await host.evaluate(()=>{const p=SPUD.main.session.world.players.guest;return {hp:p.hp,max:p.maxHp,used:p.shakeRevived};});assert.deepEqual(results.revive,{hp:6,max:12,used:true});
  await guest.waitForFunction(()=>document.getElementById('reviveBtn').hidden&&motionListeners.size===0);
  // Death + GAME_OVER arrives via the real WS event path; button/listener must disappear at once.
  for(const win of [false,true]){
    if(win){await host.evaluate(()=>SPUD.main.session.start(2));for(const page of pages)await page.waitForFunction(()=>SPUD.main.mode==='wave'&&SPUD.main.session.wave===2);await host.evaluate(()=>{const w=SPUD.main.session.world;w.spawnClock=-1e9;w.tm=999;for(const p of Object.values(w.players)){p.immune=1e9;p.cool=[1e9];}});}
    await host.evaluate(()=>{const p=SPUD.main.session.world.players.guest;p.alive=false;p.hp=0;});await guest.waitForFunction(()=>!document.getElementById('reviveBtn').hidden);
    await host.evaluate(win=>SPUD.main.session.local({type:'GAME_OVER',payload:{win,wave:SPUD.main.session.wave,kills:{},dmg:{}}}),win);
    for(const page of pages)await page.waitForFunction(()=>SPUD.main.mode==='end'&&document.getElementById('reviveBtn').hidden&&motionListeners.size===0);
    await guest.evaluate(()=>{fireShake();testLobby._ws.sendRt({t:'rv',w:SPUD.main.session.wave});});await host.waitForTimeout(120);
    assert.equal(await host.evaluate(()=>SPUD.main.session.world.players.guest.alive),false,'late terminal rv blocked');
  }
  results.endings={victory:true,defeat:true,lateReviveBlocked:true};
  // Actual leave roster path while dead, then back/new SOLO reset; ultimate button still works.
  await host.evaluate(()=>SPUD.main.session.start(3));for(const page of pages)await page.waitForFunction(()=>SPUD.main.mode==='wave'&&SPUD.main.session.wave===3);
  await host.evaluate(()=>{const w=SPUD.main.session.world;w.spawnClock=-1e9;w.tm=999;for(const p of Object.values(w.players)){p.immune=1e9;p.cool=[1e9];}w.players.guest.alive=false;w.players.guest.hp=0;});
  await guest.waitForFunction(()=>!document.getElementById('reviveBtn').hidden&&motionListeners.size===1);
  await host.evaluate(()=>testLobby._ws.leave());await guest.waitForFunction(()=>SPUD.main.mode==='end'&&document.getElementById('reviveBtn').hidden&&motionListeners.size===0);
  results.endings.hostLeave=true;
  await guest.locator('#returnLobby').click();await guest.waitForFunction(()=>SPUD.main.mode==='title');
  await guest.locator('#mpl-solo-start').click();await guest.locator('[data-act="basic"]').click();await guest.waitForFunction(()=>SPUD.main.mode==='wave');
  await guest.evaluate(()=>{const w=SPUD.main.session.world;w.spawnClock=-1e9;w.tm=999;w.players.solo.immune=1e9;});
  await guest.locator('#ultBtn').click();assert.equal(await guest.evaluate(()=>SPUD.main.session.world.players.solo.ultUsed),true);
  results.newGameUltimate=true;results.messages=messages.length;results.revivePackets=messages.filter(m=>m.type==='rt'&&m.data?.t==='rv').map(m=>({from:m.from,...m.data}));
  assert.deepEqual(errors,[]);results.runtimeErrors=errors;console.log(JSON.stringify({passed:true,...results},null,2));
} finally {await browser.close();for(const ws of peers.values())ws.terminate();await new Promise(r=>wss.close(r));await new Promise(r=>http.close(r));}

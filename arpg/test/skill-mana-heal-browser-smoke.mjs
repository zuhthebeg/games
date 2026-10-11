import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const port=Number(process.env.ARPG_CDP_PORT||9368), httpPort=Number(process.env.ARPG_HTTP_PORT||8798);
const profile=await mkdtemp(join(tmpdir(),'arpg-multi-'));
const server=spawn('python3',['-m','http.server',String(httpPort),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const chrome=spawn('/home/cocy/bin/chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[], clients=[];
class CDP {
  constructor(url) {
    this.ws=new WebSocket(url);this.seq=0;this.pending=new Map();
    this.open=new Promise((resolve,reject)=>{this.ws.onopen=resolve;this.ws.onerror=reject;});
    this.ws.onmessage=({data})=>{
      const d=JSON.parse(data);
      if(d.id){this.pending.get(d.id)?.(d);this.pending.delete(d.id);}
      else if(d.method==='Runtime.exceptionThrown'||d.method==='Runtime.consoleAPICalled'&&d.params.type==='error'||d.method==='Log.entryAdded'&&d.params.entry.level==='error') errors.push(d);
    };
  }
  async cmd(method,params={}) {
    await this.open;const id=++this.seq;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`CDP timeout ${method}`));},15000);
      this.pending.set(id,d=>{clearTimeout(timer);d.error?reject(Error(JSON.stringify(d.error))):resolve(d.result);});
      this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  async eval(expression) {
    const r=await this.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
    return r.result.value;
  }
  async wait(expression,timeout=20000) {
    const started=Date.now();while(Date.now()-started<timeout){if(await this.eval(expression))return;await sleep(100);}
    throw Error(`timeout ${expression}`);
  }
  async navigate(url) { await this.cmd('Page.navigate',{url}); }
}
try {
  let targets;
  for (let i=0;i<80;i++) {
    try { targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch {}
    if(targets?.[0]?.webSocketDebuggerUrl)break;await sleep(100);
  }
  assert.equal(server.exitCode,null);
  const host=new CDP(targets[0].webSocketDebuggerUrl);clients.push(host);
  await host.cmd('Runtime.enable');await host.cmd('Page.enable');await host.cmd('Log.enable');
  const origin=`http://127.0.0.1:${httpPort}`;
  await host.navigate(`${origin}/arpg/?dev=1&debug=1`);
  await host.wait('!!window.__arpg && document.querySelector("#boot").hidden');
  const installSave=async(c,name)=>c.eval(`(async()=>{
    const {createSave,SaveStore}=await import('./js/meta/save.js');
    const s=createSave({name:${JSON.stringify(name)},answers:[0,0,0,0,0],weapon:'focus',createdAt:1});
    s.gold=600;s.cleared.S1=true;s.learned=['healing_light'];s.skills.focus='healing_light';
    new SaveStore(localStorage).save(s);
  })()`);
  await installSave(host,'host');
  await host.navigate(`${origin}/arpg/?dev=1&debug=1`);
  await host.wait('!!window.__arpg && document.querySelector("#meta-screen")?.dataset.page==="inn"');
  await host.eval(`document.querySelector('[data-action="trainer"]').click()`);
  await host.wait(`!!document.querySelector('[data-action="equip-skill"][data-id="healing_light"]')`);
  assert.equal(await host.eval(`document.querySelector('[data-action="equip-skill"][data-id="healing_light"]').disabled`),true);
  assert.match(await host.eval('document.querySelector("#meta-screen").textContent'),/회복의 빛/);
  await host.eval(`document.querySelector('[data-action="inn"]').click();document.querySelector('[data-action="board"]').click()`);
  await host.eval(`document.querySelector('[data-action="sortie"][data-stage="S1"]').click();document.querySelector('#sortie-confirm').click()`);
  await host.wait('__arpg.world?.tick>0');
  const probe=async c=>{
    await c.eval(`(async()=>{
      window.healSmokeEvents=[];
      const {ArenaRenderer}=await import('./js/render/renderer.js');
      const events=ArenaRenderer.prototype.events;
      ArenaRenderer.prototype.events=function(w,es){window.healSmokeEvents.push(...es.filter(e=>['act','healCast','heal','actCancel'].includes(e.type)));return events.call(this,w,es);};
    })()`);
  };
  const prepare=async c=>{
    await c.wait('!!document.querySelector("#arpg-debug-panel")');
    await c.eval(`(async()=>{
      const {registerDebugAction}=await import('./js/debug/index.js');
      registerDebugAction({group:'Heal smoke',label:'Prepare heal smoke',run:ctx=>{
        for(const e of ctx.world.entities) {
          if(e.kind==='player'){e.hp=10;e.mp=e.maxMp;e.mpRegen=0;e.x=500;e.y=400+20*(e.pid!==ctx.world.entities[0].pid);e.cds={};e.act=null;}
          else {e.x=1250;e.y=750;e.thinkLeft=100000;e.act=null;}
        }
      }});
      [...document.querySelectorAll('#arpg-debug-panel button')].find(b=>b.textContent.endsWith('Prepare heal smoke')).click();
    })()`);
  };
  const cast=async c=>{
    await c.cmd('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyK',key:'k',windowsVirtualKeyCode:75});
    await c.cmd('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyK',key:'k',windowsVirtualKeyCode:75});
  };
  await probe(host);await prepare(host);
  const initialMp=await host.eval('__arpg.world.entities[0].maxMp');
  await cast(host);await host.wait('__arpg.world.entities[0].act?.phase==="windup"');
  assert.equal(await host.eval('__arpg.world.entities[0].hp'),10);
  await host.wait('healSmokeEvents.some(e=>e.type==="heal")');
  await host.wait('__arpg.world.entities[0].cds.healing_light>0');
  assert.equal(await host.eval('__arpg.world.entities[0].mp'),initialMp-28);
  const singleHp=await host.eval('__arpg.world.entities[0].hp');
  assert.equal(singleHp,10+Math.round(await host.eval('__arpg.world.entities[0].maxHp')*.3));
  assert.equal(await host.eval('healSmokeEvents.filter(e=>e.type==="heal").length'),1);
  assert.equal(await host.eval('document.querySelector("#skill").getAttribute("aria-label")'),'회복의 빛');
  assert.ok(await host.eval('__arpg.feedback.pools.effects>0 && __arpg.feedback.pools.numbers>0'));
  assert.match(await host.eval('document.querySelector("#hp-text").textContent'),new RegExp('^'+singleHp+'/'));
  const room=`heal-smoke-${Date.now()}`;
  await host.navigate(`${origin}/arpg/?dev=1&debug=1&room=${room}&coopTest=host`);
  await host.wait('!!window.__arpg && document.querySelector("#boot").hidden');
  const second=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin+'/arpg/?dev=1')}`,{method:'PUT'})).json();
  const guest=new CDP(second.webSocketDebuggerUrl);clients.push(guest);
  await guest.cmd('Runtime.enable');await guest.cmd('Page.enable');await guest.cmd('Log.enable');
  await guest.wait('!!window.__arpg && document.querySelector("#boot").hidden');
  await installSave(guest,'guest');
  await guest.navigate(`${origin}/arpg/?dev=1&room=${room}&coopTest=guest`);
  await guest.wait('window.__arpg?.multi?.phase==="running" && window.__arpg?.world?.tick>0');
  await host.wait('__arpg.world?.entities.filter(e=>e.kind==="player").length===2');
  assert.equal(await guest.eval('__arpg.multi.ownsSim'),false);
  await probe(host);await probe(guest);await prepare(host);
  await guest.wait('__arpg.world.entities[0].hp===10');
  const guestUid=await guest.eval('__arpg.multi.uid');
  const guestSelector=`__arpg.world.entities.find(e=>e.pid===${JSON.stringify(guestUid)})`;
  const maxHp=await guest.eval('__arpg.world.entities[0].maxHp');
  const maxMp=await guest.eval('__arpg.world.entities[0].maxMp');
  const saved=await guest.eval('localStorage.getItem("arpg.save.v1")');
  await cast(guest);
  await host.wait(`${guestSelector}.act?.phase==='windup'`);
  await guest.wait('healSmokeEvents.filter(e=>e.type==="heal").length===2');
  await guest.wait('__arpg.world.entities[0].hp>10');
  assert.equal(await guest.eval('__arpg.world.entities[0].hp'),10+Math.round(maxHp*.3));
  assert.equal(await guest.eval('__arpg.world.entities[0].mp'),maxMp-28);
  assert.equal(await host.eval(`${guestSelector}.mp`),maxMp-28);
  assert.equal(await guest.eval('healSmokeEvents.filter(e=>e.type==="healCast").length'),1);
  assert.equal(await host.eval('healSmokeEvents.filter(e=>e.type==="heal").length'),2);
  assert.equal(await guest.eval('localStorage.getItem("arpg.save.v1")'),saved,'heal cannot write guest rewards/save');
  assert.match(await guest.eval('document.querySelector("#hp-text").textContent'),new RegExp('^'+(10+Math.round(maxHp*.3))+'/'));
  assert.match(await guest.eval('document.querySelector("#mp-text").textContent'),new RegExp('^'+Math.floor(maxMp-28)+'/'));
  await guest.wait('__arpg.world.entities[0].cds.healing_light>0');
  assert.equal(await guest.eval('document.querySelector("#skill").disabled'),true);
  assert.ok(await guest.eval('__arpg.feedback.pools.effects>0 && __arpg.feedback.pools.numbers>0'));
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));
  console.log(JSON.stringify({passed:true,actualIndex:true,single:{hp:singleHp,mp:initialMp-28,healEvents:1,manual:true,visiblePhases:true},
    coop:{guestOwnsSim:false,guestUid,hp:10+Math.round(maxHp*.3),mp:maxMp-28,healEventsPerPeer:2,healCastPerPeer:1,personalHud:true,guestSaveUnchanged:true},consoleErrors:0},null,2));
} finally {
  for(const c of clients)c.ws.close();chrome.kill('SIGKILL');server.kill('SIGKILL');await sleep(250);await rm(profile,{recursive:true,force:true});
}

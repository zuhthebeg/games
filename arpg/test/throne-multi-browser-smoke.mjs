import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const port=Number(process.env.ARPG_CDP_PORT||19458), httpPort=Number(process.env.ARPG_HTTP_PORT||8889);
const profile=await mkdtemp(join(tmpdir(),'arpg-multi-'));
const server=spawn('python3',['-m','http.server',String(httpPort),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const chrome=spawn('/home/cocy/bin/chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[], clients=[];
const relayTest=process.env.ARPG_USE_LOCAL_RELAY==='1';
const network = { latency: Number(process.env.ARPG_NET_LATENCY) || 0, jitter: Number(process.env.ARPG_NET_JITTER) || 0, loss: Number(process.env.ARPG_NET_LOSS) || 0 };
const netQuery = relayTest ? '' : `&netLatency=${network.latency}&netJitter=${network.jitter}&netLoss=${network.loss}`;
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
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`CDP timeout ${method}`));},180000);
      this.pending.set(id,d=>{clearTimeout(timer);d.error?reject(Error(`${method}: ${JSON.stringify(d.error)}`)):resolve(d.result);});
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
  let targets;for(let i=0;i<80;i++){try{targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();}catch{}if(targets?.some(t=>t.type==='page'))break;await sleep(100);}
  const origin=`http://127.0.0.1:${httpPort}`;
  const host=new CDP(targets.find(t=>t.type==='page').webSocketDebuggerUrl);clients.push(host);
  const room=undefined; // No room query: don't auto-launch the legacy S2 test path.
  const activate=async(c,selector)=>{await c.eval(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||!n.checkVisibility())throw Error('inaccessible '+${JSON.stringify(selector)});n.scrollIntoView({block:'center'});n.focus({preventScroll:true});})()`);await c.cmd('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await c.cmd('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await sleep(150);};
  const setup=async(c,uid)=>{await c.cmd('Emulation.setFocusEmulationEnabled',{enabled:true});await c.cmd('Runtime.enable');await c.cmd('Page.enable');await c.cmd('Log.enable');await c.navigate(`${origin}/arpg/?dev=1&coopTest=${uid}`);await c.wait('window.__arpg');await c.eval(`(async()=>{const {fixtureSave}=await import('./test/fixtures/multi-round.js');const {SaveStore}=await import('./js/meta/save.js');const s=fixtureSave('${uid}','${uid==='host'?'blade':'bow'}');localStorage.setItem('arpg.autoAttack','0');new SaveStore(localStorage).save(s);})()`);await c.cmd('Page.reload');await c.wait(`document.querySelector('#meta-screen').dataset.page==='inn'`);await activate(c,'[data-action="board"]');await activate(c,'[data-action="map-region"][data-region="throne"]');await activate(c,'[data-action="sortie"][data-stage="TD1"]');await activate(c,'[data-action="coop"]');};
  await setup(host,'host');
  const second=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`,{method:'PUT'})).json();const guest=new CDP(second.webSocketDebuggerUrl);clients.push(guest);await setup(guest,'guest');
  await host.wait('__arpg.world?.round.stageId==="TD1" && __arpg.multi.phase==="running"');await guest.wait('__arpg.world?.round.stageId==="TD1" && __arpg.multi.phase==="running"');
  await host.wait(`__arpg.art.visuals.some(v=>v.key==='throne_dragon'&&v.mode==='atlas'&&v.textureLoaded)`,30000);await guest.wait(`__arpg.art.visuals.some(v=>v.key==='throne_dragon'&&v.mode==='atlas'&&v.textureLoaded)`,30000);
  assert.equal(await host.eval('__arpg.multi.ownsSim'),true);assert.equal(await guest.eval('__arpg.multi.ownsSim'),false);
  const key=async(c,type,code)=>c.cmd('Input.dispatchKeyEvent',{type,code,key:code==='KeyD'?'d':'a',windowsVirtualKeyCode:code==='KeyD'?68:65});
  for(const c of [host,guest]){await key(c,'keyDown','KeyD');await c.wait(`(()=>{const p=__arpg.world.entities[0],d=__arpg.world.entities.find(e=>e.type==='throne_dragon');return d&&Math.hypot(p.x-d.x,p.y-d.y)<185})()`);await key(c,'keyUp','KeyD');}
  const cues=new Set(),hitHP=await guest.eval('__arpg.world.entities[0].hp');const phaseNames=new Set();let minHP=hitHP;
  const end=Date.now()+35000;while(Date.now()<end&&cues.size<3){const s=await guest.eval(`JSON.parse(JSON.stringify({hp:__arpg.world.entities[0].hp,d:__arpg.world.entities.find(e=>e.type==='throne_dragon'),views:__arpg.art.visuals,owns:__arpg.multi.ownsSim,telegraphs:__arpg.multi.telegraphs}))`);assert.equal(s.owns,false);minHP=Math.min(minHP,s.hp);if(s.d.act){cues.add(s.d.act.id);phaseNames.add(s.d.act.phase);const visual=s.views.find(v=>v.key==='throne_dragon');assert.equal(visual.mode,'atlas');assert.equal(visual.state,{dragon_flame:'breath',dragon_stomp:'stomp',dragon_tail:'tail'}[s.d.act.id]);}await sleep(90);}
  assert.deepEqual([...cues].sort(),['dragon_flame','dragon_stomp','dragon_tail']);
  // Native guest input is authoritative on host; guest may receive the same AoE damage journal.
  const gid=await guest.eval('__arpg.multi.uid');const x=await host.eval(`__arpg.world.entities.find(e=>e.pid==='${gid}').x`);await key(guest,'keyDown','KeyA');await host.wait(`__arpg.world.entities.find(e=>e.pid==='${gid}').x<${x-20}`);await key(guest,'keyUp','KeyA');
  await activate(guest,'[data-auto-toggle]');await activate(host,'[data-auto-toggle]');
  // Steer both axes through real input; a dead/cleared boss is already a success, not an approach timeout.
  let held=[];const closeEnd=Date.now()+25000;
  while(Date.now()<closeEnd){const s=await host.eval(`JSON.parse(JSON.stringify({state:__arpg.world.round.state,p:__arpg.world.entities[0],d:__arpg.world.entities.find(e=>e.type==='throne_dragon')}))`);
    if(s.state==='clear'||s.d.dead)break;assert.ok(!s.p.terminal,'host must survive');
    const dx=s.d.x-s.p.x,dy=s.d.y-s.p.y;if(Math.hypot(dx,dy)<120)break;
    const want=[...(dx>18?['KeyD']:dx<-18?['KeyA']:[]),...(dy>18?['KeyS']:dy<-18?['KeyW']:[])];
    for(const code of held)if(!want.includes(code))await host.cmd('Input.dispatchKeyEvent',{type:'keyUp',code,key:code.slice(3).toLowerCase()});
    for(const code of want)if(!held.includes(code))await host.cmd('Input.dispatchKeyEvent',{type:'keyDown',code,key:code.slice(3).toLowerCase()});
    held=want;await sleep(90);
  }
  for(const code of held)await host.cmd('Input.dispatchKeyEvent',{type:'keyUp',code,key:code.slice(3).toLowerCase()});
  await host.wait('__arpg.world.round.state==="clear"',60000);await guest.wait('__arpg.world.round.state==="clear"',20000);
  assert.equal(await host.eval('__arpg.save.lastReceipt.terminal'),'clear');assert.equal(await guest.eval('__arpg.save.lastReceipt.terminal'),'clear');assert.equal(await guest.eval('__arpg.multi.ownsSim'),false);
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));
  console.log(JSON.stringify({ok:true,transport:'two actual app documents / local BroadcastChannel (no relay credentials)',nativeQuestSelection:true,hostOwnsSim:true,guestOwnsSim:false,guestInputMovedOnHost:true,guestClips:[...cues],guestPhases:[...phaseNames],guestHP:{initial:hitHP,minimum:minHP},hostClear:true,guestClear:true,consoleErrors:0,screenshots:0},null,2));
} finally {
  for(const c of clients)c.ws.close();chrome.kill('SIGKILL');server.kill('SIGKILL');await sleep(250);await rm(profile,{recursive:true,force:true});
}

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const port=Number(process.env.ARPG_CDP_PORT||19521), httpPort=Number(process.env.ARPG_HTTP_PORT||8971);
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
  assert.equal(server.exitCode,null);
  const origin=`http://127.0.0.1:${httpPort}`, host=new CDP(targets.find(t=>t.type==='page').webSocketDebuggerUrl);clients.push(host);
  const results=[];
  const activate=async(c,selector,mobile=false)=>{
    const p=await c.eval(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||!n.checkVisibility())throw Error('not actionable '+${JSON.stringify(selector)});n.scrollIntoView({block:'center'});n.focus({preventScroll:true});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    if(mobile){await c.cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await sleep(60);await c.cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    else {await c.cmd('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await c.cmd('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});}
    await sleep(160);
  };
  const setup=async(c,{width=1280,height=800,uid=null,armor=true}={})=>{
    await c.cmd('Emulation.setFocusEmulationEnabled',{enabled:true});await c.cmd('Runtime.enable');await c.cmd('Page.enable');await c.cmd('Log.enable');
    await c.cmd('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await c.cmd('Emulation.setTouchEmulationEnabled',{enabled:width<600});
    await c.navigate(`${origin}/arpg/?${uid?'dev=1&coopTest='+uid:'debug=0'}`);await c.wait('window.__arpg');
    await c.eval(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');const {trained}=await import('./test/fixtures/trained.js');const {instance}=await import('./js/meta/items.js');
      const s=trained(createSave({name:'${uid||'QM1 smoke'}',weapon:'blade',answers:[0,0,0,0,0],createdAt:1}),30);
      s.cleared.S10=true;s.flags.chiefPity=true;s.autoUse={potion:${armor},hp:50,mp:50,recall:false};s.stacks.potion=10;
      if(${armor}){s.items.push({...instance('qm1:armor','leather_vest_epic',1,[]),enhance:10});s.equipped.body='qm1:armor';}
      new SaveStore(localStorage).save(s);localStorage.setItem('arpg.autoAttack','0');})()`);
    await c.cmd('Page.reload');await c.wait(`document.querySelector('#meta-screen').dataset.page==='inn'`);
    await activate(c,'[data-action="board"]',width<600);await activate(c,'[data-action="map-region"][data-region="mine"]',width<600);
    assert.match(await c.eval(`document.querySelector('.panel-header').textContent`),/1 \/ 20/);
    await activate(c,'[data-action="sortie"][data-stage="M_MINE_CART"]',width<600);
    assert.match(await c.eval(`document.querySelector('#meta-screen').textContent`),/장부 회수→입구/);
    await activate(c,uid?'[data-action="coop"]':'[data-action="launch"]',width<600);
    if(!uid)await c.wait('__arpg.world?.round.stageId==="M_MINE_CART"');
  };
  // Exact native input to the normal InputLayer. No world writes, teleport, fake completion or debug clear.
  const steer=async(c,pos,mobile=false)=>{
    let held=[],touching=false;const deadline=Date.now()+25000;
    while(Date.now()<deadline){
      const p=await c.eval('JSON.parse(JSON.stringify(__arpg.world.entities[0]))');assert.ok(!p.terminal,'movement participant ended '+p.terminal);
      const dx=pos.x-p.x,dy=pos.y-p.y;if(Math.hypot(dx,dy)<25)break;
      if(mobile){
        if(!touching){await c.cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:90,y:500}]});touching=true;}
        const d=Math.hypot(dx,dy);await c.cmd('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:90+dx/d*42,y:500+dy/d*42}]});
      } else {
        const want=[...(dx>15?['KeyD']:dx<-15?['KeyA']:[]),...(dy>15?['KeyS']:dy<-15?['KeyW']:[])];
        for(const code of held)if(!want.includes(code))await c.cmd('Input.dispatchKeyEvent',{type:'keyUp',code,key:code.slice(3).toLowerCase()});
        for(const code of want)if(!held.includes(code))await c.cmd('Input.dispatchKeyEvent',{type:'keyDown',code,key:code.slice(3).toLowerCase()});held=want;
      }
      await sleep(75);
    }
    if(touching)await c.cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    for(const code of held)await c.cmd('Input.dispatchKeyEvent',{type:'keyUp',code,key:code.slice(3).toLowerCase()});
    const p=await c.eval('JSON.parse(JSON.stringify(__arpg.world.entities[0]))');assert.ok(Math.hypot(pos.x-p.x,pos.y-p.y)<64,'arrival inside marker');
  };
  for(const width of [1280,390]){
    await setup(host,{width,height:width===390?844:800});const mobile=width===390;
    await steer(host,{x:1092,y:258},mobile);await host.wait('__arpg.world.round.objective.state==="carried"');
    const carried=await host.eval('__arpg.world.round.objective.carrier');assert.equal(carried,'local');
    assert.match(await host.eval('document.querySelector("#objective").textContent'),/장부→입구/);
    await steer(host,{x:252,y:430},mobile);await host.wait('__arpg.save.lastReceipt?.stageId==="M_MINE_CART" && __arpg.save.lastReceipt.terminal==="clear"');
    const proof=await host.eval(`JSON.parse(JSON.stringify({state:__arpg.world.round.state,ticks:__arpg.world.round.t,seconds:__arpg.world.round.t/30,monsters:__arpg.world.entities.filter(e=>e.kind==='monster'&&!e.dead).length,receipt:__arpg.save.lastReceipt,goal:document.querySelector('#objective').textContent}))`);
    assert.equal(proof.receipt.stageXp,910);assert.ok(proof.monsters>0);results.push({viewport:[width,width===390?844:800],input:mobile?'native touch joystick':'native keyboard',...proof});
  }
  await setup(host,{uid:'host',armor:false});
  const second=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`,{method:'PUT'})).json();const guest=new CDP(second.webSocketDebuggerUrl);clients.push(guest);
  await setup(guest,{uid:'guest'});await host.wait('__arpg.multi?.phase==="running"');await guest.wait('__arpg.multi?.phase==="running"');
  assert.equal(await guest.eval('__arpg.multi.ownsSim'),false);
  await steer(host,{x:1092,y:258});await host.wait('__arpg.world.round.objective.carrier==="host"');
  await host.wait('__arpg.world.entities[0].terminal==="death"',120000);
  const token=await host.eval('JSON.parse(JSON.stringify(__arpg.world.round.objective.token))');assert.equal(await host.eval('__arpg.world.round.objective.carrier'),null);
  await steer(guest,token);await guest.wait('__arpg.world.round.objective.carrier==="guest"');
  await steer(guest,{x:252,y:430});await guest.wait('__arpg.world.round.state==="clear"');
  assert.equal(await host.eval('__arpg.world.entities[0].terminal'),'death');assert.equal(await guest.eval('__arpg.world.entities[0].terminal'),'clear');
  results.push({coop:'two actual app documents / BroadcastChannel',carrierDeath:true,companionRecovered:true,hostTerminal:'death',guestTerminal:'clear',guestOwnsSim:false,token});
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));
  console.log(JSON.stringify({ok:true,results,consoleErrors:0,screenshots:0,physicalPhone:false},null,2));
} finally {
  for(const c of clients)c.ws.close();chrome.kill('SIGTERM');server.kill('SIGTERM');await sleep(500);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}

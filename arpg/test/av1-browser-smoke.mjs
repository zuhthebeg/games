import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const port=Number(process.env.ARPG_CDP_PORT||19931), httpPort=Number(process.env.ARPG_HTTP_PORT||8951);
const profile=await mkdtemp(join(tmpdir(),'arpg-av1-'));
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
    const started=Date.now();while(Date.now()-started<timeout){if(await this.eval(expression))return;await sleep(10);}
    throw Error(`timeout ${expression}`);
  }
  async navigate(url) { await this.cmd('Page.navigate',{url}); }
}
try {
  let targets;
  for(let i=0;i<80;i++){
    try{targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();}catch{}
    if(targets?.some(t=>t.type==='page'))break;await sleep(100);
  }
  assert.equal(server.exitCode,null);
  const host=new CDP(targets.find(t=>t.type==='page').webSocketDebuggerUrl);clients.push(host);
  await host.cmd('Runtime.enable');await host.cmd('Page.enable');await host.cmd('Log.enable');
  const origin=`http://127.0.0.1:${httpPort}`,results=[];
  for(const mobile of [false,true]) for(const form of ['sword','blunt','bow','wand','staff']) for(const latency of [0,40,80,120]) {
    const query=`room=av1-${Date.now()}&form=${form}&latency=${latency}&jitter=${latency?25:0}`;
    await host.navigate(`${origin}/arpg/test/av1-combo-fixture.html?uid=host&${query}`);
    const second=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`,{method:'PUT'})).json();
    const guest=new CDP(second.webSocketDebuggerUrl);clients.push(guest);
    await guest.cmd('Runtime.enable');await guest.cmd('Page.enable');await guest.cmd('Log.enable');
    await guest.cmd('Emulation.setDeviceMetricsOverride',{width:mobile?390:1280,height:mobile?844:800,deviceScaleFactor:1,mobile});
    await guest.cmd('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:1});
    await guest.navigate(`${origin}/arpg/test/av1-combo-fixture.html?uid=guest&${query}`);
    await guest.wait('window.fixture?.ready');await host.wait('window.fixture?.ready');
    if(mobile){
      const rect=await guest.eval('(()=>{const r=document.querySelector("#attack").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
      await guest.cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...rect,id:1}]});
    }else await guest.cmd('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyJ',key:'j',windowsVirtualKeyCode:74});
    await host.wait('fixture.report().events.filter(e=>e.type==="act"&&e.step===3).length>=2',15000);
    if(mobile)await guest.cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    else await guest.cmd('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyJ',key:'j',windowsVirtualKeyCode:74});
    await guest.wait('fixture.report().seenSteps.includes(3)');
    const manual=await host.eval('fixture.report()');
    await sleep(1300);const n=manual.events.filter(e=>e.type==='act').length;
    await guest.eval('fixture.auto(true)');
    await host.wait(`fixture.report().events.filter(e=>e.type==='act').length>=${n+7}`,15000);
    await guest.eval('fixture.auto(false)');await sleep(500);
    const h=await host.eval('fixture.report()'),g=await guest.eval('fixture.report()');
    assert.equal(g.ownsSim,false);assert.equal(h.ownsSim,true);assert.ok(g.frames>50);
    const casts=h.events.filter(e=>e.type==='act'&&e.step),steps=casts.slice(0,6).map(e=>e.step);
    assert.deepEqual(steps,[1,2,3,1,2,3]);assert.deepEqual([...g.seenSteps].sort(),[1,2,3]);
    for(const hit of h.events.filter(e=>e.type==='hit'&&e.step))assert.ok(['slash','arrow','focus_pulse'].includes(hit.ability));
    if(form==='sword')for(const trail of ['slash','reverse','thrust'])assert.ok(g.seenTrails.includes(trail),trail);
    if(form==='blunt')for(const trail of ['down','up','spin'])assert.ok(g.seenTrails.includes(trail),trail);
    if(form==='staff')assert.ok(h.events.some(e=>e.type==='explode'&&e.step===3&&e.radius===46));
    if(form==='bow')assert.ok(g.maxShots>=2,`double-shot max ${g.maxShots}`);
    results.push({mobile,form,latency,jitter:latency?25:0,manualSteps:steps,autoCasts:casts.length-n,guestSteps:g.seenSteps,guestTrails:g.seenTrails,maxShots:g.maxShots,frames:g.frames,ownsGuestSim:g.ownsSim});
    console.error(`passed ${mobile?'mobile':'desktop'} ${form} ${latency}ms`);
    await guest.navigate('about:blank');await host.navigate('about:blank');guest.ws.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${second.id}`);
  }
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));
  console.log(JSON.stringify({passed:true,consoleErrors:0,screenshots:0,cdpPort:port,httpPort,results},null,2));
} finally {
  for(const c of clients)c.ws.close();chrome.kill('SIGKILL');server.kill('SIGKILL');await sleep(250);await rm(profile,{recursive:true,force:true});
}

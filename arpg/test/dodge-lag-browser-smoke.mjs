import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const port=Number(process.env.ARPG_CDP_PORT||19941), httpPort=Number(process.env.ARPG_HTTP_PORT||8961);
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
  const origin=`http://127.0.0.1:${httpPort}`, results=[];
  for (const condition of [{latency:0,jitter:0},{latency:40,jitter:25},{latency:80,jitter:25},{latency:120,jitter:25}]) {
    const query=`room=dodge-${Date.now()}&latency=${condition.latency}&jitter=${condition.jitter}`;
    await host.navigate(`${origin}/arpg/test/dodge-lag-fixture.html?uid=host&${query}`);
    const second=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`,{method:'PUT'})).json();
    const guest=new CDP(second.webSocketDebuggerUrl);clients.push(guest);
    await guest.cmd('Runtime.enable');await guest.cmd('Page.enable');await guest.cmd('Log.enable');
    await guest.navigate(`${origin}/arpg/test/dodge-lag-fixture.html?uid=guest&${query}`);
    await guest.wait('window.fixture?.ready');await host.wait('window.fixture?.ready');
    await sleep(2500);await host.eval('fixture.arm()');await guest.wait('fixture.dodgeNow');
    await guest.cmd('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyD',key:'d',windowsVirtualKeyCode:68});
    await guest.cmd('Input.dispatchKeyEvent',{type:'keyDown',code:'Space',key:' ',windowsVirtualKeyCode:32});
    await guest.cmd('Input.dispatchKeyEvent',{type:'keyUp',code:'Space',key:' ',windowsVirtualKeyCode:32});
    await guest.cmd('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyD',key:'d',windowsVirtualKeyCode:68});
    try { await host.wait("fixture.report().events.some(e=>e.type==='counter'&&e.pid==='guest')"); } catch (e) { console.error(JSON.stringify({condition,host:await host.eval('fixture.report()'),guest:await guest.eval('fixture.report()'),errors})); throw e; }
    await guest.wait("fixture.report().events.some(e=>e.type==='counter'&&e.pid==='guest')");
    const h=await host.eval('fixture.report()'),g=await guest.eval('fixture.report()');
    assert.equal(g.ownsSim,false);assert.equal(h.events.filter(e=>e.type==='perfectDodge'&&e.pid==='guest').length,1);
    assert.equal(g.events.filter(e=>e.type==='perfectDodge'&&e.pid==='guest').length,1);assert.equal(g.hp,g.maxHp);
    assert.ok(g.dodgePackets.some(p=>Number.isSafeInteger(p.viewTick)));assert.ok(g.frames>100);
    results.push({condition,hostPerfect:1,guestPerfect:1,hostCounters:1,guestCounters:1,
      refunds:h.events.filter(e=>e.type==='dodgeRewind').length,guestHp:g.hp,guestRtt:g.rtt,renderTick:g.viewTick,dodgeViewTick:g.dodgePackets[0]?.dodgeViews?.at(-1)?.[1],frames:g.frames});
    await guest.navigate('about:blank');await host.navigate('about:blank');guest.ws.close();
  }
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));
  console.log(JSON.stringify({passed:true,consoleErrors:0,results},null,2));
  if(process.env.ARPG_MULTI_RESULT)await writeFile(process.env.ARPG_MULTI_RESULT,JSON.stringify({passed:true,consoleErrors:0,results},null,2));
} finally {
  for(const c of clients)c.ws.close();chrome.kill('SIGKILL');server.kill('SIGKILL');await sleep(250);await rm(profile,{recursive:true,force:true});
}

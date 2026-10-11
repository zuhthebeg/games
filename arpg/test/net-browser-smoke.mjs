import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const port=Number(process.env.ARPG_CDP_PORT||19181), httpPort=Number(process.env.ARPG_HTTP_PORT||8781);
const profile=await mkdtemp(join(tmpdir(),'arpg-multi-'));
const server=spawn('python3',['-m','http.server',String(httpPort),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const chrome=spawn('/home/cocy/bin/chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[], clients=[];
const relayTest=process.env.ARPG_USE_LOCAL_RELAY==='1';
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
  let targets;
  for(let i=0;i<80;i++){
    try{targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();}catch{}
    if(targets?.some(t=>t.type==='page'))break;await sleep(100);
  }
  assert.equal(server.exitCode,null);
  const host=new CDP(targets.find(t=>t.type==='page').webSocketDebuggerUrl);clients.push(host);
  await host.cmd('Runtime.enable');await host.cmd('Page.enable');await host.cmd('Log.enable');
  const origin=`http://127.0.0.1:${httpPort}`, results=[];
  for (const condition of [{latency:60,jitter:20,loss:.02},{latency:120,jitter:40,loss:.02}]) {
    for (const before of [true,false]) {
      const room=`net-${Date.now()}`, query=`room=${room}&latency=${condition.latency}&jitter=${condition.jitter}&loss=${condition.loss}&before=${Number(before)}`;
      await host.navigate(`${origin}/arpg/test/net-fixture.html?uid=host&${query}`);
      const second=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${origin}/arpg/test/net-fixture.html?uid=guest&${query}`)}`,{method:'PUT'})).json();
      const guest=new CDP(second.webSocketDebuggerUrl);clients.push(guest);
      await guest.cmd('Runtime.enable');await guest.cmd('Page.enable');await guest.cmd('Log.enable');
      await guest.wait('window.fixture?.ready');await host.wait('window.fixture?.ready');
      await sleep(1500);await guest.eval('fixture.beginMeasure()');
      for (const code of ['KeyD','KeyA','KeyD','KeyA']) {
        const key=code==='KeyD'?'d':'a', windowsVirtualKeyCode=code==='KeyD'?68:65;
        await guest.cmd('Input.dispatchKeyEvent',{type:'keyDown',code,key,windowsVirtualKeyCode});
        await sleep(550);
        await guest.cmd('Input.dispatchKeyEvent',{type:'keyUp',code,key,windowsVirtualKeyCode});
        await sleep(1000);
      }
      await guest.cmd('Input.dispatchKeyEvent',{type:'keyDown',code:'Space',key:' ',windowsVirtualKeyCode:32});
      await guest.cmd('Input.dispatchKeyEvent',{type:'keyUp',code:'Space',key:' ',windowsVirtualKeyCode:32});
      await sleep(1000);
      const report=await guest.eval('fixture.report()');assert.equal(report.ownsSim,false);
      assert.equal(report.records.latencies.length,5);
      if(!before) {assert.equal(report.maxOnsetFrames,1);assert.equal(report.corrections.snaps,0);}
      results.push({condition,...report});
      await guest.navigate('about:blank');await host.navigate('about:blank');guest.ws.close();
    }
  }
  for(let i=0;i<results.length;i+=2) {
    const before=results[i], after=results[i+1];
    assert.ok(after.reactionP95Ms<=1000/60+1, 'local response exceeds one nominal render frame');
    assert.ok(after.remoteRepeatRatio<before.remoteRepeatRatio*.4, 'remote repeats not substantially reduced');
    assert.ok(after.remoteJumpP95Px<before.remoteJumpP95Px, 'remote p95 jump not improved');
  }
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));
  console.log(JSON.stringify({passed:true,consoleErrors:0,results},null,2));
  if(process.env.ARPG_MULTI_RESULT)await writeFile(process.env.ARPG_MULTI_RESULT,JSON.stringify({passed:true,consoleErrors:0,results},null,2));
} finally {
  for(const c of clients)c.ws.close();chrome.kill('SIGKILL');server.kill('SIGKILL');await sleep(250);await rm(profile,{recursive:true,force:true});
}

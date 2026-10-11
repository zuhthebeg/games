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
  for(let i=0;i<80;i++){
    try{targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();}catch{}
    if(targets?.[0]?.webSocketDebuggerUrl)break;await sleep(100);
  }
  assert.equal(server.exitCode,null);
  const host=new CDP(targets[0].webSocketDebuggerUrl);clients.push(host);
  await host.cmd('Runtime.enable');await host.cmd('Page.enable');await host.cmd('Log.enable');
  const origin=`http://127.0.0.1:${httpPort}`;
  await host.navigate(`${origin}/arpg/test/multi-fixture.html`);await host.wait('window.ready===true');
  const loopback=await host.eval('runCoop()');
  assert.equal(loopback.state,'clear');
  for(const key of ['monsters','companion','telegraph','telegraphExact','guestInput','independentLoot','telegraphRendered'])assert.equal(loopback.evidence[key],true,key);
  assert.equal(loopback.evidence.guestOwnsSim,false);
  for(const r of Object.values(loopback.receipts)){assert.equal(r.terminal,'clear');assert.equal(r.validSave,true);assert.equal(r.persisted,true);assert.ok(r.goldGained>0);}
  assert.ok(loopback.visuals.every(v=>v.players===2));
  // Two actual app documents exercise the inn entry, InputLayer, personal HUD and disconnect UX.
  await host.eval("(async()=>{const {fixtureSave}=await import('./fixtures/multi-round.js');localStorage.setItem('arpg.save.v1',JSON.stringify(fixtureSave('host')));})()");
  const room=`smoke-${Date.now()}`;
  await host.navigate(`${origin}/arpg/?dev=1&room=${room}${relayTest?'&coopRelayTest=1':'&coopTest=host'}`);
  await host.wait("!!window.__arpg && document.querySelector('#boot')?.hidden");
  const second=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin+'/arpg/test/multi-fixture.html')}`,{method:'PUT'})).json();
  const guest=new CDP(second.webSocketDebuggerUrl);clients.push(guest);
  await guest.cmd('Runtime.enable');await guest.cmd('Page.enable');await guest.cmd('Log.enable');
  await guest.wait('window.ready===true');
  await guest.eval("(async()=>{const {fixtureSave}=await import('./fixtures/multi-round.js');localStorage.setItem('arpg.save.v1',JSON.stringify(fixtureSave('guest','bow')));})()");
  await guest.navigate(`${origin}/arpg/?dev=1&room=${room}${relayTest?'&coopRelayTest=1':'&coopTest=guest'}`);
  if(relayTest) {
    await guest.wait("document.querySelectorAll('#mpl-list .mpl-pl').length===2 && !!document.querySelector('#mpl-ready') && getComputedStyle(document.querySelector('#mpl-ready')).display!=='none'");
    await guest.eval("document.querySelector('#mpl-ready').click()");
    await host.wait("!!document.querySelector('#mpl-start') && !document.querySelector('#mpl-start').disabled");
    assert.equal(await host.eval("document.querySelector('#mpl-solo-start')"),null);
    await host.eval("document.querySelector('#arpg-party-stage').value='S2';document.querySelector('#arpg-party-stage').dispatchEvent(new Event('change'));document.querySelector('#mpl-start').click()");
  }
  await guest.wait("window.__arpg?.world?.tick>0 && __arpg.multi?.phase==='running'");
  await host.wait("window.__arpg?.world?.entities.filter(p=>p.kind==='player').length===2");
  assert.equal(await guest.eval('__arpg.multi.ownsSim'),false);
  assert.equal(await host.eval('__arpg.multi.ownsSim'),true);
  const guestUid=await guest.eval('__arpg.multi.uid');
  assert.equal(await guest.eval('__arpg.world.entities[0].pid'),guestUid);
  assert.equal(await guest.eval('__arpg.world.entities[0].weapon'),'bow');
  const guestSelector=`__arpg.world.entities.find(p=>p.pid===${JSON.stringify(guestUid)})`;
  const x=await host.eval(`${guestSelector}.x`);
  await guest.cmd('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyD',key:'d',windowsVirtualKeyCode:68});
  await host.wait(`${guestSelector}.x>${x+30}`);
  await guest.cmd('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyD',key:'d',windowsVirtualKeyCode:68});
  await guest.cmd('Input.dispatchKeyEvent',{type:'keyDown',code:'Space',key:' ',windowsVirtualKeyCode:32});
  await guest.cmd('Input.dispatchKeyEvent',{type:'keyUp',code:'Space',key:' ',windowsVirtualKeyCode:32});
  await host.wait(`${guestSelector}.dodge.cdLeft>0`);
  await guest.wait('__arpg.multi.telegraphs>0',30000);
  assert.ok(await guest.eval('__arpg.world.entities.some(p=>p.kind==="monster")'));
  const hp=await guest.eval('document.querySelector("#hp-text").textContent');
  assert.ok(hp.endsWith('/'+Math.ceil(await guest.eval('__arpg.world.entities[0].maxHp'))));
  const actual={guestInputMoved:true,guestDodgeLatched:true,guestTelegraph:true,ownHud:hp,
    companion:await guest.eval('__arpg.art.visuals.filter(v=>["blade","bow"].includes(v.key)).length'),
    rtt:await guest.eval('__arpg.multi.rtt')};
  assert.equal(actual.companion,2);
  assert.ok(Number.isFinite(actual.rtt) && actual.rtt >= 0);
  // Host departure => honest progress-preserving return receipt, not migrated sim.
  await host.cmd('Page.navigate',{url:'about:blank'});
  await guest.wait("document.querySelector('#meta-screen')?.dataset.page==='receipt' && !document.querySelector('#meta-screen').hidden");
  assert.match(await guest.eval('document.querySelector("#meta-screen").textContent'),/방장.*(나갔다|끊겼다)/);
  assert.equal(await guest.eval('__arpg.save.lastReceipt.terminal'),'return_scroll');
  actual.hostDeparture='return_scroll';
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));
  const result={passed:true,relayTest,consoleErrors:0,loopback,actual};
  console.log(JSON.stringify(result,null,2));
  if(process.env.ARPG_MULTI_RESULT)await writeFile(process.env.ARPG_MULTI_RESULT,JSON.stringify(result,null,2));
} finally {
  for(const c of clients)c.ws.close();chrome.kill('SIGKILL');server.kill('SIGKILL');await sleep(250);await rm(profile,{recursive:true,force:true});
}

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const port=Number(process.env.ARPG_CDP_PORT||19541), httpPort=Number(process.env.ARPG_HTTP_PORT||8984);
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
      const s=trained(createSave({name:'${uid||'QC1 smoke'}',weapon:'blade',answers:[0,0,0,0,0],createdAt:1}),30);
      s.cleared.S20=true;s.flags.chiefPity=true;s.autoUse={potion:${armor},hp:50,mp:50,recall:false};s.stacks.potion=10;
      if(${armor}){s.items.push({...instance('qc1:armor','leather_vest_epic',1,[]),enhance:10});s.equipped.body='qc1:armor';s.items.push({...instance('qc1:weapon','rune_blade',1,[]),enhance:10});s.equipped.weapon='qc1:weapon';}
      new SaveStore(localStorage).save(s);localStorage.setItem('arpg.autoAttack','0');})()`);
    await c.cmd('Page.reload');await c.wait(`document.querySelector('#meta-screen').dataset.page==='inn'`);
    await activate(c,'[data-action="board"]',width<600);await activate(c,'[data-action="map-region"][data-region="throne"]',width<600);
    assert.match(await c.eval(`document.querySelector('.panel-header').textContent`),/1 \/ 20/);
    await activate(c,'[data-action="sortie"][data-stage="M_THRONE_GARGOYLE"]',width<600);
    assert.match(await c.eval(`document.querySelector('#meta-screen').textContent`),/가고일 처치: 0\/1/);
    await activate(c,uid?'[data-action="coop"]':'[data-action="launch"]',width<600);
    if(!uid)await c.wait('__arpg.world?.round.stageId==="M_THRONE_GARGOYLE"');
  };
  // Exact native input to the normal InputLayer. No world writes, teleport, fake completion or debug clear.
  const fight=async(c,mobile=false)=>{
    await c.wait('__arpg.world.entities.some(e=>e.type==="gargoyle")');
    await c.wait('__arpg.art.loaded.includes("gargoyle")');
    const art=await c.eval('JSON.parse(JSON.stringify(__arpg.art))');
    assert.ok(art.visuals.some(v=>v.key==='gargoyle'&&v.mode==='atlas'));
    const targetLabel=await c.eval(`(async()=>{
      const {Container}=await import('./vendor/pixi-8.22.0.min.mjs');const {ArenaRenderer}=await import('./js/render/renderer.js');
      const stage=new Container(),r=new ArenaRenderer({stage,screen:{width:1280,height:800}}),w=JSON.parse(JSON.stringify(__arpg.world));
      r.reset(w);r.render(w,1,1/60);const n=r.questLabels[0],label={text:n.text,visible:n.visible,x:n.x,y:n.y};stage.destroy({children:true});return label;
    })()`);
    assert.equal(targetLabel.text,'대상: 가고일');assert.equal(targetLabel.visible,true);
    // Normal AUTO toggle, native movement and dodge keys/touch only; world is read-only.
    await activate(c,'[data-auto-toggle]',mobile);
    let held=[],touching=false,dodged=false;const deadline=Date.now()+120000;
    while(Date.now()<deadline){
      const state=await c.eval(`(()=>{const w=__arpg.world;return JSON.parse(JSON.stringify({round:w.round,player:w.entities.find(e=>e.kind==='player' && (!__arpg.multi || e.pid===__arpg.multi.uid)),target:w.entities.find(e=>e.id===w.round.objective.targetId)}));})()`);
      if(state.round.state!=='running')break;
      const p=state.player,t=state.target;assert.ok(!p.terminal,'fighter '+p.terminal);
      const dx=t.x-65-p.x,dy=t.y-p.y,d=Math.hypot(dx,dy);
      if(!dodged&&d<130){
        if(mobile){if(touching){await c.cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});touching=false;}await activate(c,'#dodge',true);}
        else{await c.cmd('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space'});await c.cmd('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space'});}
        dodged=true;
      }
      if(mobile){
        if(d>25){if(!touching){await c.cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:90,y:500}]});touching=true;}await c.cmd('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:90+dx/d*42,y:500+dy/d*42}]});}
        else if(touching){await c.cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});touching=false;}
      }else{
        const want=[...(dx>18?['KeyD']:dx<-18?['KeyA']:[]),...(dy>18?['KeyS']:dy<-18?['KeyW']:[])];
        for(const code of held)if(!want.includes(code))await c.cmd('Input.dispatchKeyEvent',{type:'keyUp',code,key:code.slice(3).toLowerCase()});
        for(const code of want)if(!held.includes(code))await c.cmd('Input.dispatchKeyEvent',{type:'keyDown',code,key:code.slice(3).toLowerCase()});held=want;
      }
      await sleep(100);
    }
    if(touching)await c.cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    for(const code of held)await c.cmd('Input.dispatchKeyEvent',{type:'keyUp',code,key:code.slice(3).toLowerCase()});
    await c.wait('__arpg.save.lastReceipt?.stageId==="M_THRONE_GARGOYLE" && __arpg.save.lastReceipt.terminal==="clear"');
    assert.ok(dodged,'native dodge sent');assert.ok(await c.eval(`__arpg.world.entities.find(e=>e.kind==='player' && (!__arpg.multi || e.pid===__arpg.multi.uid)).dodge.startedTick>=0`),'native dodge accepted');
    return {...await c.eval(`JSON.parse(JSON.stringify({state:__arpg.world.round.state,objective:__arpg.world.round.objective,ticks:__arpg.world.round.t,seconds:__arpg.world.round.t/30,monsters:__arpg.world.entities.filter(e=>e.kind==='monster'&&!e.dead).length,receipt:__arpg.save.lastReceipt,goal:document.querySelector('#objective').textContent,art:__arpg.art}))`),nativeDodge:true,targetLabel};
  };
  for(const width of [1280,390]){
    await setup(host,{width,height:width===390?844:800});
    const proof=await fight(host,width===390);assert.equal(proof.receipt.stageXp,2020);assert.equal(proof.objective.state,'complete');assert.equal(proof.monsters,2);assert.equal(proof.goal,'가고일 처치: 1/1');assert.ok(proof.receipt.lootKept.items.length<=2);
    results.push({viewport:[width,width===390?844:800],input:width===390?'native touch joystick/AUTO/dodge':'native keyboard/AUTO/dodge',...proof});
  }
  await setup(host,{uid:'host'});
  const second=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`,{method:'PUT'})).json();const guest=new CDP(second.webSocketDebuggerUrl);clients.push(guest);
  await setup(guest,{uid:'guest'});await host.wait('__arpg.multi?.phase==="running"');await guest.wait('__arpg.multi?.phase==="running"');
  assert.equal(await guest.eval('__arpg.multi.ownsSim'),false);
  await guest.wait('__arpg.world.round.objective.targetId!==null');
  const before=await guest.eval('JSON.parse(JSON.stringify(__arpg.world.round.objective))');assert.equal(before.state,'waiting');
  const proof=await fight(host);
  await guest.wait('__arpg.save.lastReceipt?.terminal==="clear"');assert.equal(await guest.eval('__arpg.world.round.objective.state'),'complete');assert.equal(await guest.eval('__arpg.save.lastReceipt.stageXp'),2020);assert.equal(await guest.eval('document.querySelector("#objective").textContent'),'가고일 처치: 1/1');
  results.push({coop:'two actual app documents / BroadcastChannel',guestOwnsSim:false,guestBefore:before,guestObjective:await guest.eval('JSON.parse(JSON.stringify(__arpg.world.round.objective))'),guestReceipt:await guest.eval('JSON.parse(JSON.stringify(__arpg.save.lastReceipt))'),host:proof});
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));
  console.log(JSON.stringify({ok:true,results,consoleErrors:0,screenshots:0,physicalPhone:false},null,2));
} finally {
  for(const c of clients)c.ws.close();chrome.kill('SIGTERM');server.kill('SIGTERM');await sleep(500);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}

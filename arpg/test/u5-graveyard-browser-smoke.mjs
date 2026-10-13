// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 19961);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8976);
const profile = await mkdtemp(join(tmpdir(), 'arpg-smoke-'));
const server = spawn('python3', ['-m', 'http.server', String(httpPort), '--bind', '127.0.0.1'], {
  cwd: root, stdio: 'ignore',
});
const chrome = spawn('/home/cocy/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
let socket;
let readDiagnostics;
let sequence = 0;
const pending = new Map();
const events = [];

try {
  let targets;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (targets[0]?.webSocketDebuggerUrl) break;
    } catch {
      // Chromium is still starting.
    }
    await sleep(100);
  }
  assert.ok(targets?.[0]?.webSocketDebuggerUrl, 'Chromium CDP unavailable');
  assert.equal(server.exitCode, null, `static server could not bind (${httpPort} already occupied?)`);
  socket = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    socket.onopen = resolveOpen;
    socket.onerror = reject;
  });
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    } else events.push(message);
  };
  const command = (method, params = {}) => new Promise((resolveCommand, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolveCommand(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result.value;
  };
  readDiagnostics=()=>evaluate(`JSON.stringify({url:location.href,ready:document.readyState,hasArpg:!!window.__arpg})`);
  const waitFor = async (expression, timeout = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) return;
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };
  // A reload can expose an empty document; require the actual visible target page.
  const page = (name) => `document.querySelector('#meta-screen')?.dataset.page===${JSON.stringify(name)}
    && document.querySelector('#meta-screen')?.hidden===false`;
  const touch = (type, points) => command('Input.dispatchTouchEvent', { type, touchPoints: points });
  await command('Runtime.enable'); await command('Page.enable'); await command('Log.enable');
  const nativeActivate = async (selector, keyboard = false) => {
    const point = await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||!n.checkVisibility())throw Error('not actionable: '+${JSON.stringify(selector)});n.scrollIntoView({block:'center'});n.focus({preventScroll:true});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    if(keyboard) {
      await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
      await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    } else {
      assert.equal(await evaluate(`document.elementFromPoint(${point.x},${point.y})?.closest(${JSON.stringify(selector)})!==null`),true,selector);
      await touch('touchStart',[{x:point.x,y:point.y}]);await sleep(60);await touch('touchEnd',[]);
    }
    await sleep(350);
  };
  const results=[],stages=['S21','S22','S23'],loaded=new Set();
  const heldKeys=new Set();
  const moveKeys=async(desired=[])=>{
    const next=new Set(desired);
    for(const code of heldKeys)if(!next.has(code))await command('Input.dispatchKeyEvent',{type:'keyUp',code,key:code.slice(3).toLowerCase()});
    for(const code of next)if(!heldKeys.has(code))await command('Input.dispatchKeyEvent',{type:'keyDown',code,key:code.slice(3).toLowerCase()});
    heldKeys.clear();for(const code of next)heldKeys.add(code);
  };
  const seedSave=async(width,eligible=true,prior=[])=>{
    await command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});
    await command('Emulation.setTouchEmulationEnabled',{enabled:width<600,maxTouchPoints:2});
    await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/?debug=0`});await waitFor('window.__arpg');
    await evaluate(`(async()=>{const {throneLateSave}=await import('./test/fixtures/throne-late.js');const {SaveStore}=await import('./js/meta/save.js');const s=throneLateSave('U5 mobile');s.cleared.S20=${eligible};s.stageThreat.S20=${eligible?1:0};for(const id of ${JSON.stringify(prior)}){s.cleared[id]=true;s.stageThreat[id]=1;}s.autoUse={potion:true,hp:50,mp:50,recall:false};s.stacks.potion=20;s.stacks.mana_potion=10;new SaveStore(localStorage).save(s);localStorage.setItem('arpg.autoAttack','0');})()`);
    await command('Page.reload');await waitFor(page('inn'));await nativeActivate('[data-action="board"]',width>600);
  };
  for(const width of [320,390,430,1280])for(const eligible of [false,true]){
    await seedSave(width,eligible);
    const proof=await evaluate(`(()=>{const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}};const map=document.querySelector('.world-map');return {map:rect(map),overflow:document.documentElement.scrollWidth>innerWidth,nodes:[...map.querySelectorAll('.region-node')].map(n=>({id:n.dataset.region,rect:rect(n),clipped:n.scrollWidth>n.clientWidth||n.scrollHeight>n.clientHeight})),edges:[...map.querySelectorAll('line')].map(n=>[+n.getAttribute('x1'),+n.getAttribute('y1'),+n.getAttribute('x2'),+n.getAttribute('y2')])};})()`);
    assert.equal(proof.overflow,false);assert.equal(proof.nodes.length,8);assert.equal(proof.edges.length,8);
    for(const n of proof.nodes){assert.equal(n.clipped,false,n.id);assert.ok(n.rect.x>=proof.map.x+2&&n.rect.right<=proof.map.right-2,n.id);assert.ok(n.rect.y>=proof.map.y+2&&n.rect.bottom<=proof.map.bottom-2,n.id);}
    for(let i=0;i<proof.nodes.length;i++)for(let j=i+1;j<proof.nodes.length;j++){const a=proof.nodes[i].rect,b=proof.nodes[j].rect;assert.ok(a.right+5<=b.x-5||b.right+5<=a.x-5||a.bottom+5<=b.y-5||b.bottom+5<=a.y-5,`${width}:${proof.nodes[i].id}/${proof.nodes[j].id}`);}
    for(const edge of proof.edges)for(let i=0;i<4;i+=2)assert.ok(proof.nodes.some(n=>Math.abs(n.rect.x+n.rect.w/2-(proof.map.x+2+edge[i]/100*(proof.map.w-4)))<1&&Math.abs(n.rect.y+n.rect.h/2-(proof.map.y+2+edge[i+1]/100*(proof.map.h-4)))<1));
    assert.ok(proof.edges.some(e=>JSON.stringify(e)==='[24,74,76,74]'));
    for(const node of proof.nodes){await nativeActivate(`[data-action="map-region"][data-region="${node.id}"]`,width>600);assert.equal(await evaluate(`document.querySelector('.map-quests:not([hidden])').dataset.region`),node.id);}
    await nativeActivate('[data-action="map-region"][data-region="graveyard"]',width>600);
    const gate=await evaluate(`['S21','S22','S23'].map(id=>({id,disabled:document.querySelector('[data-stage="'+id+'"]').disabled}))`);
    assert.deepEqual(gate.map(g=>g.disabled),[!eligible,true,true]);
    results.push({viewport:[width,844],eligible,proof,gate});
  }
  for(const width of [390,1280])for(const [index,stage] of stages.entries()){
    const desktop=width>600;
    await seedSave(width,true,stages.slice(0,index));await nativeActivate('[data-action="map-region"][data-region="graveyard"]',desktop);
    const gates=await evaluate(`['S21','S22','S23'].map(id=>document.querySelector('[data-stage="'+id+'"]').disabled)`);
    assert.deepEqual(gates,stages.map((_,i)=>i>index));
    await nativeActivate(`[data-action="sortie"][data-stage="${stage}"]`,desktop);await waitFor(page('sortie'));await nativeActivate('[data-action="launch"]',desktop);await waitFor(`__arpg.world?.round.stageId==='${stage}'`);
    await nativeActivate('[data-battle-settings]',desktop);await nativeActivate('#battle-auto-on',desktop);await nativeActivate('[data-battle-settings]',desktop);
    let touching=false,dodged=false,observedLoot=false,observedKills=0;const art=new Set(),deadline=Date.now()+180000;
    while(Date.now()<deadline){
      const state=await evaluate(`(()=>{const w=__arpg.world;return JSON.parse(JSON.stringify({round:w.round,p:w.entities.find(e=>e.kind==='player'),targets:w.entities.filter(e=>e.kind==='monster'&&!e.dead&&!e.spawnLeft),dead:w.entities.filter(e=>e.kind==='monster'&&e.dead).length,tracker:__arpg.tracker,art:__arpg.art}));})()`);
      observedKills=Math.max(observedKills,state.dead);observedLoot ||= (state.tracker?.tempLoot.gold||0)>0;
      for(const visual of state.art.visuals)if(visual.mode==='atlas'){art.add(visual.key);loaded.add(visual.key);}
      if(state.round.state!=='running')break;
      assert.ok(!state.p.terminal,'fighter '+state.p.terminal);
      const target=state.targets.sort((a,b)=>Math.hypot(a.x-state.p.x,a.y-state.p.y)-Math.hypot(b.x-state.p.x,b.y-state.p.y))[0];
      if(target){const dx=target.x-55-state.p.x,dy=target.y-state.p.y,d=Math.hypot(dx,dy);
        if(!dodged&&d<130){if(touching){await touch('touchEnd',[]);touching=false;}await moveKeys();await nativeActivate('#dodge',desktop);dodged=true;}
        if(desktop){await moveKeys(d>25?[...(Math.abs(dx)>18?[dx>0?'KeyD':'KeyA']:[]),...(Math.abs(dy)>18?[dy>0?'KeyS':'KeyW']:[])]:[]);}
        else if(d>25){if(!touching){await touch('touchStart',[{x:85,y:500}]);touching=true;}await touch('touchMove',[{x:85+dx/d*42,y:500+dy/d*42}]);}
        else if(touching){await touch('touchEnd',[]);touching=false;}
      }else {await moveKeys();if(touching){await touch('touchEnd',[]);touching=false;}}
      await sleep(100);
    }
    if(touching)await touch('touchEnd',[]);await moveKeys();
    await waitFor(`__arpg.save.lastReceipt?.stageId==='${stage}'&&__arpg.save.lastReceipt.terminal==='clear'`,20000);
    const receipt=await evaluate('JSON.parse(JSON.stringify(__arpg.save.lastReceipt))');assert.ok(receipt.goldGained>0);assert.ok(receipt.lootKept.items.length<=2);assert.ok(observedLoot);assert.ok(observedKills>0);assert.ok(dodged);
    const persisted=await evaluate(`(async()=>{const {SaveStore,validateSave}=await import('./js/meta/save.js');const s=new SaveStore(localStorage).load();return {valid:validateSave(s),clear:s.cleared['${stage}'],receipt:s.lastReceipt.stageId,level:s.level};})()`);assert.ok(persisted.valid&&persisted.clear);assert.equal(persisted.receipt,stage);
    const expectedKills=await evaluate(`(async()=>{const {STAGES}=await import('./js/content/combat.js');return STAGES['${stage}'].spawns.length;})()`);
    assert.equal(observedKills,expectedKills,'every scheduled monster killed');
    results.push({viewport:[width,844],stage,input:desktop?'native keyboard map/sortie/AUTO/WASD/dodge':'native touch map/sortie/AUTO/joystick/dodge',observedKills,expectedKills,observedLoot,art:[...art],receipt,persisted});
    console.error(JSON.stringify({checkpoint:'combat-clear',width,stage,observedKills,gold:receipt.goldGained,gear:receipt.lootKept.items.length}));
  }
  for(const key of ['skeleton_minion','skeleton_warrior','skeleton_rogue','skeleton_mage','ghoul','ghost','bat'])assert.ok(loaded.has(key),'existing art loaded '+key);
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
  assert.equal(errors.length,0,JSON.stringify(errors));console.log(JSON.stringify({ok:true,results,consoleErrors:0,screenshots:0,physicalPhone:false},null,2));
} catch(error) {
  let documentState;
  try { documentState=await readDiagnostics?.(); } catch(diagnosticError) { documentState={error:String(diagnosticError)}; }
  console.error(JSON.stringify({checkpoint:'smoke-failure',error:String(error),documentState,
    browserEvents:events.filter(e=>['Page.frameNavigated','Runtime.executionContextsCleared','Runtime.exceptionThrown','Inspector.targetCrashed'].includes(e.method)).slice(-16)}));
  throw error; // Diagnostics do not turn a failure into a pass or skip any gate.
} finally {
  socket?.close();
  await Promise.all([chrome,server].map(async child=>{if(child.exitCode!==null)return;child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(2500)]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}));
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}

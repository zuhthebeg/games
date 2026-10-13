// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 19921);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8941);
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
  const waitFor = async (expression, timeout = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) return;
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };
  const page = (name) => `document.querySelector('#meta-screen')?.dataset.page===${JSON.stringify(name)}
    && !document.querySelector('#meta-screen').hidden`;
  const touch = (type, points) => command('Input.dispatchTouchEvent', { type, touchPoints: points });
  await command('Network.enable'); await command('Runtime.enable'); await command('Page.enable'); await command('Log.enable');
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

  const common=['revenant_blade','bone_bow','soulfire_wand','gravekeeper_staff','ossuary_maul','shroud_robe','shadow_leather','ossuary_plate'];
  const rare=['dragonfang_blade','dragon_scale_armor'];
  const states=[];
  const snapshot=()=>evaluate('JSON.parse(JSON.stringify(__arpg.save))');
  const audit=async()=>{
    const r=await evaluate(`(()=>{const shell=document.querySelector('.inn-shell'),content=document.querySelector('.inn-shell .content'),dialog=document.querySelector('dialog[open]'),n=dialog||shell,b=n.getBoundingClientRect();return {left:b.left,right:b.right,bottom:b.bottom,overflow:content.scrollWidth>content.clientWidth+1,rows:[...document.querySelectorAll('dialog[open] [data-line]')].map(n=>({key:n.dataset.line,from:+n.dataset.from,to:+n.dataset.to,delta:+n.dataset.delta}))};})()`);
    assert.ok(r.left>=-1&&r.right<=await evaluate('innerWidth')+1&&r.bottom<=await evaluate('innerHeight')+1,JSON.stringify(r));
    assert.equal(r.overflow,false);assert.ok(r.rows.every(r=>r.from!==r.to&&r.delta!==0));return r;
  };
  const decode=async selector=>evaluate(`(async()=>{const images=[...document.querySelectorAll(${JSON.stringify(selector)})];if(!images.length)throw Error('missing image '+${JSON.stringify(selector)});const result=[];for(const im of images){im.loading='eager';await im.decode();if(!im.closest('.item-art').classList.contains('art-ready'))await new Promise(resolve=>im.addEventListener('load',resolve,{once:true}));if(im.naturalWidth!==96||!im.closest('.item-art').classList.contains('art-ready'))throw Error('not ready '+im.src);result.push(im.getAttribute('src'));}return result;})()`);
  for(const [width,height] of [[390,844],[1280,800]]) {
    const keyboard=width>=600;
    const activate=selector=>nativeActivate(selector,keyboard);
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:!keyboard});
    await command('Emulation.setTouchEmulationEnabled',{enabled:!keyboard,maxTouchPoints:5});
    await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/?dev=1`});await waitFor('window.__arpg');
    await evaluate(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');const{statBudget,BASE_STATS,STAT_KEYS}=await import('./js/meta/stats.js');const{instance,rollDrops,RECIPES}=await import('./js/meta/items.js');
      const s=createSave({name:'I1 smoke',weapon:'blade',answers:[0,0,0,0,0],createdAt:123});s.level=30;s.stats={...BASE_STATS,str:100};s.statPoints=statBudget(30)-STAT_KEYS.reduce((n,k)=>n+s.stats[k]-BASE_STATS[k],0);s.gold=100000;
      for(const r of Object.values(RECIPES))for(const k of Object.keys(r))if(k!=='gold')s.stacks[k]=1000;
      for(const id of ${JSON.stringify(rare)}){let item;for(let seed=0;seed<1000&&!item;seed++)item=rollDrops('throne_dragon',seed,{boss:true,huntTier:3}).items.find(i=>i.id===id);if(!item)throw Error(id);s.items.push(item);}
      new SaveStore(localStorage).save(s);})()`);
    await command('Page.reload');await waitFor(page('inn'));
    await activate('[data-action="forge"]');await activate('[data-action="forge-tab"][data-tab="salvage"]');
    assert.match(await evaluate('document.querySelector(".craft-list").textContent'),/수호룡 비늘: 1/);await audit();
    const recipes=await evaluate(`(async()=>{const {RECIPES}=await import('./js/meta/items.js');return RECIPES;})()`);
    const crafted=[];
    for(const id of common){
      await activate('[data-action="forge-tab"][data-tab="salvage"]');
      const path=await decode(`.recipe:has([data-action="craft"][data-id="${id}"]) img`);assert.deepEqual(path,[`assets/items/${id.replaceAll('_','-')}.webp`]);
      const before=await snapshot();await activate(`[data-action="craft"][data-id="${id}"]`);const made=await snapshot();assert.equal(made.items.at(-1).id,id);
      const recipe=recipes[id];assert.equal(made.gold,before.gold-recipe.gold);for(const [k,n]of Object.entries(recipe))if(k!=='gold')assert.equal(made.stacks[k],before.stacks[k]-n);
      crafted.push({id,uid:made.items.at(-1).uid,path:path[0]});
    }
    assert.equal(await evaluate(`document.querySelector('[data-action="craft"][data-id="dragonfang_blade"]')===null&&document.querySelector('[data-action="craft"][data-id="dragon_scale_armor"]')===null`),true);
    await activate('[data-action="inn"]');await activate('[data-action="inventory"]');
    const comparisons=[];
    for(const id of [...common,...rare]){
      const uid=await evaluate(`__arpg.save.items.find(i=>i.id===${JSON.stringify(id)}).uid`);
      assert.equal(await evaluate('document.querySelector(".compare-sheet")===null'),true,'no comparison before selection');
      const images=await decode(`[data-action="open-item"][data-uid="${uid}"] img.item-art-image`);assert.ok(images.includes(`assets/items/${id.replaceAll('_','-')}.webp`));
      await activate(`[data-action="open-item"][data-uid="${uid}"]`);await waitFor('!!document.querySelector("dialog[open] .compare-sheet")');
      const r=await audit();
      assert.doesNotMatch(await evaluate('document.querySelector("dialog[open]").textContent'),/undefined|NaN|가벼울수록|높을수록/);
      await activate(`dialog[open] [data-action="equip"][data-uid="${uid}"]`);
      const slot=await evaluate(`(async()=>{const{ITEMS}=await import('./js/meta/items.js');return ITEMS[${JSON.stringify(id)}].slot;})()`);assert.equal((await snapshot()).equipped[slot],uid);
      assert.equal(await evaluate('document.querySelector("dialog[open]")===null'),true);comparisons.push({id,rows:r.rows.length,noEqualRows:true,decoded:true});
    }
    await activate('[data-action="stash-tab"][data-tab="material"]');
    const scaleRow=await evaluate(`(()=>{const n=[...document.querySelectorAll('.stack-row')].find(n=>n.querySelector('strong').textContent==='수호룡 비늘');n.scrollIntoView({block:'center'});return n.textContent;})()`);
    assert.match(scaleRow,/수호룡 비늘/);assert.deepEqual(await decode('.stack-row:has(img[src="assets/items/dragon-scale.webp"]) img'),['assets/items/dragon-scale.webp']);
    const beforeReload=await snapshot();await command('Page.reload');await waitFor(page('inn'));assert.deepEqual(await snapshot(),beforeReload);
    // Persist only a fixture change; native forge controls must disable every T4 recipe without a scale.
    await evaluate(`(async()=>{const {SaveStore}=await import('./js/meta/save.js');const store=new SaveStore(localStorage),s=store.load();s.stacks.dragon_scale=0;store.save(s);})()`);
    await command('Page.reload');await waitFor(page('inn'));await activate('[data-action="forge"]');await activate('[data-action="forge-tab"][data-tab="salvage"]');
    for(const id of common)assert.equal(await evaluate(`document.querySelector('[data-action="craft"][data-id="${id}"]').disabled`),true);
    states.push({width,height,input:keyboard?'native keyboard Enter':'native touch',crafted,comparisons,scaleRow:true,missingScaleDisabled:8,saveReload:true});
  }
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
  const httpErrors=events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.status>=400);
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));assert.equal(httpErrors.length,0,JSON.stringify(httpErrors.slice(0,3)));
  console.log(JSON.stringify({ok:true,states,consoleErrors:0,httpErrors:0,screenshots:0,physicalDevice:false},null,2));

} finally {
  socket?.close();
  const stopped = [chrome, server].map(async (child) => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolveExit) => child.once('exit', resolveExit)), sleep(2500)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  await Promise.all(stopped);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

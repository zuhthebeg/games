// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 19241);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8841);
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
  const page = (name) => `document.querySelector('#meta-screen').dataset.page===${JSON.stringify(name)}
    && !document.querySelector('#meta-screen').hidden`;
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
  const states=[];
  for(const [width,height] of [[360,640],[390,844],[1280,800]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    for(const fallback of [false,true]) {
      await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/?dev=1${fallback?'&paperdoll=0':''}`});await waitFor('window.__arpg');
      await evaluate(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');const {instance}=await import('./js/meta/items.js');const s=createSave({name:'H1',answers:[0,0,0,0,0],createdAt:1});const armor=instance('h1-head','head_light_common_t1');s.items.push(armor);s.equipped.head=armor.uid;new SaveStore(localStorage).save(s);})()`);
      await command('Page.reload');await sleep(350);await waitFor(page('inn'));
      if(!fallback) await waitFor(`document.querySelector('.p2-hero')?.dataset.paperdollReady`);
      await nativeActivate('.character-portrait');await waitFor(page('character'));
      await nativeActivate('[data-action="inn"]');
      if(!fallback) await waitFor(`document.querySelector('.p2-hero')?.dataset.paperdollReady`);
      const before=await evaluate('JSON.stringify(__arpg.save)');
      const drag=async(mouse,dx)=>{
        const pt=await evaluate(`(()=>{const n=document.querySelector('.character-portrait');n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
        assert.equal(await evaluate(`document.elementFromPoint(${pt.x},${pt.y})?.closest('.character-portrait')!==null`),true);
        const direction=await evaluate(`document.querySelector('.p2-hero').dataset.direction`);
        const pixels=await evaluate(`document.querySelector('.p2-hero canvas')?.toDataURL() || document.querySelector('.p2-hero').style.backgroundPosition`);
        if(mouse){
          await command('Input.dispatchMouseEvent',{type:'mousePressed',...pt,button:'left',clickCount:1});
          await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x+dx,y:pt.y,button:'left',buttons:1});
          await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:pt.x+dx,y:pt.y,button:'left',clickCount:1});
        }else{
          await touch('touchStart',[pt]);await touch('touchMove',[{x:pt.x+dx,y:pt.y}]);await touch('touchEnd',[]);
        }
        await sleep(100);assert.equal(await evaluate(page('inn')),true,'drag must not open character sheet');
        assert.notEqual(await evaluate(`document.querySelector('.p2-hero').dataset.direction`),direction);
        assert.notEqual(await evaluate(`document.querySelector('.p2-hero canvas')?.toDataURL() || document.querySelector('.p2-hero').style.backgroundPosition`),pixels);
      };
      await drag(false,72);await drag(true,-48);
      const directions=[];
      for(let i=0;i<8;i++){await drag(true,24);directions.push(await evaluate(`document.querySelector('.p2-hero').dataset.direction`));}
      assert.equal(new Set(directions).size,8);
      assert.equal(await evaluate('JSON.stringify(__arpg.save)'),before);
      // Foot anchor sits on the lower diamond (SVG y=213), away from hearth y<=145.
      const placement=await evaluate(`(()=>{const room=document.querySelector('.p2-room').getBoundingClientRect(),p=document.querySelector('.p2-hero').getBoundingClientRect();const foot=p.top+p.height*.668;return {foot:foot-room.top,tile:room.height/250*213,top:getComputedStyle(document.querySelector(".character-portrait")).top,heroHeight:p.height,heroTop:p.top,roomTop:room.top,buttonTop:document.querySelector(".character-portrait").getBoundingClientRect().top,transform:getComputedStyle(document.querySelector(".p2-hero")).transform,url:document.querySelector("link[rel=stylesheet]").href};})()`);
      assert.ok(Math.abs(placement.foot-placement.tile)<8,JSON.stringify(placement));
      await nativeActivate('.character-portrait',true);await waitFor(page('character'));
      await nativeActivate('[data-action="inn"]');await nativeActivate('[data-action="socket"][data-slot="head"]');
      const layout=await evaluate(`(()=>{const a=document.querySelector('.socket-actions [data-action="merchant"]').getBoundingClientRect(),b=document.querySelector('[data-action="socket-forge"]').getBoundingClientRect();return {sameRow:Math.abs(a.top-b.top)<1,right:b.right,width:innerWidth};})()`);
      assert.equal(layout.sameRow,true);assert.ok(layout.right<=layout.width);
      await nativeActivate('[data-action="socket-forge"]');await waitFor(page('forge'));
      assert.equal(await evaluate(`document.querySelector('[data-action="select-gear"][aria-pressed="true"]').dataset.uid`),'h1-head');
      assert.equal(await evaluate(`document.querySelector('[data-forge-tab]').dataset.forgeTab`),'enhance');
      assert.equal(await evaluate(`document.querySelector('[data-action="enhance"]').dataset.uid`),'h1-head');
      await nativeActivate('[data-action="inn"]');
      await evaluate(`(async()=>{const {SaveStore}=await import('./js/meta/save.js');const {ENCHANT}=await import('./js/meta/economy.js');const store=new SaveStore(localStorage),s=store.load();s.items.find(i=>i.uid==='h1-head').enhance=ENCHANT.max;store.save(s);})()`);
      await command('Page.reload');await sleep(350);await waitFor(page('inn'));
      await nativeActivate('[data-action="socket"][data-slot="head"]');
      assert.equal(await evaluate(`document.querySelector('[data-action="socket-forge"]').disabled`),true);
      await nativeActivate('[data-action="close-sheet"]');await nativeActivate('[data-action="socket"][data-slot="feet"]');
      assert.equal(await evaluate(`document.querySelector('[data-action="socket-forge"]').disabled`),true);
      await nativeActivate('.socket-actions [data-action="merchant"]');await waitFor(page('merchant'));
      states.push({width,height,fallback,touchRotation:true,mouseRotation:true,directions,tap:true,armorSelection:true,maxDisabled:true,emptyDisabled:true,merchant:true,layout,placement});
    }
  }
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));console.log(JSON.stringify({ok:true,states,consoleErrors:0}));

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

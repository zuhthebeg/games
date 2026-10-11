// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 9368);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8798);
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
  const audit = async () => {
    const result = await evaluate(`(() => {
      const root=document.querySelector('#meta-screen'); const shell=root.querySelector('.inn-shell');
      const content=shell.querySelector('.content'); const footer=shell.querySelector('.action-footer');
      const r=shell.getBoundingClientRect(); const c=content.getBoundingClientRect();
      const dialog=root.querySelector('dialog[open]'); const d=dialog?.getBoundingClientRect();
      const tiny=[...root.querySelectorAll('button')].filter(n=>n.checkVisibility()).filter(n=>{const b=n.getBoundingClientRect();return b.width<43.5||b.height<43.5}).map(n=>n.dataset.action);
      const buttons=[...root.querySelectorAll('button')].filter(n=>n.checkVisibility()&&(!dialog||dialog.contains(n))).map(n=>{const r=n.getBoundingClientRect();const sheetBody=dialog?.querySelector('.p2-sheet-body');const clip=dialog?(sheetBody.contains(n)?sheetBody.getBoundingClientRect():dialog.getBoundingClientRect()):content.contains(n)?c:shell.getBoundingClientRect();return {n,b:{left:Math.max(r.left,clip.left),right:Math.min(r.right,clip.right),top:Math.max(r.top,clip.top),bottom:Math.min(r.bottom,clip.bottom)}};}).filter(({b})=>b.bottom>b.top&&b.right>b.left);
      const overlaps=[];for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=buttons[i].b,b=buttons[j].b;if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)overlaps.push([buttons[i].n.dataset.action,buttons[j].n.dataset.action]);}
      return {overlaps,width:innerWidth,height:innerHeight,right:r.right,left:r.left,bottom:r.bottom,overflow:content.scrollWidth>content.clientWidth+1,tiny,
        footerOverlap:footer ? c.bottom>footer.getBoundingClientRect().top+1:false,dialog:d?{left:d.left,right:d.right,top:d.top,bottom:d.bottom}:null};
    })()`);
    assert.ok(result.left>=-1&&result.right<=result.width+1&&result.bottom<=result.height+1,JSON.stringify(result));
    assert.equal(result.overflow,false,JSON.stringify(result)); assert.equal(result.footerOverlap,false);
    assert.deepEqual(result.tiny,[]); assert.deepEqual(result.overlaps,[]); if(result.dialog) assert.ok(result.dialog.left>=-1&&result.dialog.right<=result.width+1&&result.dialog.top>=-1&&result.dialog.bottom<=result.height+1,JSON.stringify(result));
  };
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
    const desktop=width>600;
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:!desktop});
    await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/?dev=1`});await waitFor('window.__arpg');
    const fixture = async (gold=10000,potion=0) => {
      await evaluate(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');let s=createSave({name:'U0 검수',answers:[0,0,0,0,0],createdAt:1});s.gold=${gold};s.cleared.S1=true;s.stacks={potion:${potion},mana_potion:0,return_scroll:0};s.stash.stacks.potion=50;new SaveStore(localStorage).save(s);})()`);
      await command('Page.reload');await waitFor(page('inn'));
    };
    const depart = async () => {
      await nativeActivate('[data-action="board"]');await nativeActivate('[data-action="sortie"][data-stage="S2"]');
      await nativeActivate('[data-action="launch"]');
    };
    await fixture();await depart();await audit();
    assert.equal(await evaluate('document.querySelector("#meta-screen").hidden'),false);assert.equal(await evaluate('__arpg.world'),null);
    assert.equal(await evaluate(`document.querySelector('dialog[open] h2').textContent`),'물약 없음');
    // Hit-test both warning actions; navigation uses native touch, never node.click().
    assert.equal(await evaluate(`(()=>{const n=document.querySelector('[data-action="launch-without-potion"]'),r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('[data-action="launch-without-potion"]')===n})()`),true);
    await nativeActivate('[data-action="departure-shop"]');await waitFor(page('shop'));await audit();
    await nativeActivate('[data-action="auto-buy-settings"]');await audit();
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-auto-buy-target]')].map(n=>+n.textContent)`),[20,0,1]);
    await nativeActivate('#auto-buy-return_scroll-plus');assert.equal(await evaluate('__arpg.save.autoBuy.return_scroll'),2);
    assert.equal(await evaluate('document.activeElement.id'),'auto-buy-return_scroll-plus');
    await nativeActivate('#auto-buy-return_scroll-minus');await nativeActivate('[data-action="close-sheet"]');
    await nativeActivate('[data-action="auto-buy"]');await audit();
    assert.deepEqual(await evaluate(`['potion','mana_potion','return_scroll'].map(id=>__arpg.save.stacks[id])`),[20,0,1]);
    assert.equal(await evaluate('__arpg.save.stash.stacks.potion'),50);
    const message=await evaluate(`document.querySelector('#meta-screen [role="status"]').textContent`);
    assert.equal(message,'HP 물약 20 · 귀환 주문서 1 구매 · 206 G');
    await nativeActivate('[data-action="auto-buy"]');assert.equal(await evaluate(`document.querySelector('#meta-screen [role="status"]').textContent`),'구매 0 · 0 G');
    await command('Page.reload');await waitFor(page('inn'));assert.equal(await evaluate('__arpg.save.autoBuy.potion'),20);
    await depart();await waitFor('document.querySelector("#meta-screen").hidden && __arpg.world?.round.state==="running"');assert.equal(await evaluate(`document.querySelector('dialog[open]')===null`),true);
    await fixture(120);await nativeActivate('[data-action="shop"]');await nativeActivate('[data-action="auto-buy"]');
    assert.equal(await evaluate('__arpg.save.stacks.potion'),12);assert.match(await evaluate(`document.querySelector('#meta-screen [role="status"]').textContent`),/HP 물약 12\/20.*골드 부족/);await audit();
    await fixture();await depart();await nativeActivate('[data-action="launch-without-potion"]');await waitFor('document.querySelector("#meta-screen").hidden && __arpg.world?.round.state==="running"');
    assert.equal(await evaluate(`document.querySelector('dialog[open]')===null`),true);
    states.push({width,height,warning:true,shopRedirect:true,settingsPersisted:true,autoBuy:[20,0,1],noOp:true,goldPartial:12,normalDeparture:true,bypass:true,elementFromPoint:true,nativeTouch:true,message});
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

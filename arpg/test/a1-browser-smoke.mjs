// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 9391);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8817);
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
  const player = '__arpg.world?.entities.find(e=>e.kind==="player")';
  for(const [width,height] of [[390,844],[1280,800]]) {
    const desktop=width>600;
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:!desktop});
    await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/`});await waitFor('window.__arpg');
    const fixture = async (stacks, autoUse) => {
      await evaluate(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');let s=createSave({name:'A1 검수',answers:[0,0,0,0,0],createdAt:1});s.cleared.S1=true;s.stacks=${JSON.stringify(stacks)};${autoUse?`s.autoUse=${JSON.stringify(autoUse)};`:'delete s.autoUse;'}new SaveStore(localStorage).save(s);})()`);
      await command('Page.reload');await waitFor(page('inn'));
    };
    const depart = async () => {
      await nativeActivate('[data-action="board"]');await nativeActivate('[data-action="sortie"][data-stage="S2"]');
      await nativeActivate('[data-action="launch"]');
      if(await evaluate(`!!document.querySelector('[data-action="launch-without-potion"]')`)) await nativeActivate('[data-action="launch-without-potion"]');
      await waitFor('document.querySelector("#meta-screen").hidden && __arpg.world?.round.state==="running"');
    };
    // Old save without autoUse loads with defaults on.
    await fixture({potion:3,mana_potion:1,return_scroll:1},null);
    assert.deepEqual(await evaluate('({...__arpg.save.autoUse})'),{potion:true,hp:50,mp:50,recall:true});
    await nativeActivate('[data-action="settings"]');await waitFor(page('settings'));await audit();
    const pressed = () => evaluate(`[...document.querySelectorAll('[data-action="auto-use"][aria-pressed="true"]')].map(n=>n.id)`);
    assert.deepEqual(await pressed(),['auto-use-potion-true','auto-use-hp-50','auto-use-mp-50','auto-use-recall-true']);
    const labels=await evaluate(`[...document.querySelectorAll('.auto-use .quantity-row span')].map(n=>n.textContent)`);
    assert.deepEqual(labels,['자동 물약','HP 기준','MP 기준','자동 귀환']);
    await nativeActivate('#auto-use-hp-70');assert.equal(await evaluate('__arpg.save.autoUse.hp'),70);
    await nativeActivate('#auto-use-potion-false');await audit();
    assert.deepEqual(await pressed(),['auto-use-potion-false','auto-use-recall-true']);
    await command('Page.reload');await waitFor(page('inn'));
    assert.deepEqual(await evaluate('({...__arpg.save.autoUse})'),{potion:false,hp:70,mp:50,recall:true});
    await nativeActivate('[data-action="settings"]');await nativeActivate('#auto-use-potion-true');await nativeActivate('#auto-use-hp-50');
    assert.deepEqual(await evaluate('({...__arpg.save.autoUse})'),{potion:true,hp:50,mp:50,recall:true});
    // Real combat: idle until goblins push HP under 50%, then exactly one potion per cooldown.
    await fixture({potion:3,mana_potion:0,return_scroll:1},{potion:true,hp:50,mp:50,recall:true});
    await depart();
    let minBefore=1, used=null;
    for(let i=0;i<500&&used===null;i++){
      const s=await evaluate(`(()=>{const p=${player};return {hp:p.hp/p.maxHp,potions:p.potions,cd:p.potionCd,terminal:p.terminal}})()`);
      assert.equal(s.terminal,null,JSON.stringify(s));
      if(s.potions<3) used=s; else minBefore=Math.min(minBefore,s.hp);
      await sleep(100);
    }
    assert.ok(used,'auto potion never fired');assert.equal(used.potions,2);assert.ok(minBefore<0.5+1e-9||used.hp<0.5+0.4,JSON.stringify({minBefore,used}));
    assert.ok(await evaluate(`${player}.potionCd>0`)||await evaluate(`${player}.potions<=2`));
    // Emergency return with no HP potions: channel starts by itself at HP <= 20%.
    await command('Page.reload');await waitFor(page('inn')).catch(()=>{});
    await fixture({potion:0,mana_potion:0,return_scroll:1},{potion:true,hp:50,mp:50,recall:true});
    await depart();
    let channel=null;
    for(let i=0;i<900&&!channel;i++){
      const s=await evaluate(`(()=>{const p=${player};return p?{hp:p.hp/p.maxHp,channel:p.channel,terminal:p.terminal}:null})()`);
      if(s&&(s.channel>0||s.terminal==='return_scroll')) channel=s;
      else if(s?.terminal==='death') throw new Error('died without auto return');
      await sleep(80);
    }
    assert.ok(channel,'auto return never started');assert.ok(channel.hp<=0.2+1e-9,JSON.stringify(channel));
    states.push({width,height,defaults:true,persisted:true,hiddenLevelsWhenOff:true,autoPotion:{minBefore:+minBefore.toFixed(3),after:used},autoReturn:channel,nativeTouch:true});
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

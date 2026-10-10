// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 19097);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8731);
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
  const click = async (selector) => {
    await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node || node.disabled) throw new Error('missing/disabled: ' + ${JSON.stringify(selector)});
      node.click();
    })()`);
  };
  const page = (name) => `document.querySelector('#meta-screen').dataset.page===${JSON.stringify(name)}
    && !document.querySelector('#meta-screen').hidden`;
  const key = (code, type = 'keyDown') => command('Input.dispatchKeyEvent', {
    type, code,
    key: { KeyD: 'd', KeyJ: 'j', KeyR: 'r', KeyK: 'k', KeyE: 'e', Space: ' ' }[code] || code,
    windowsVirtualKeyCode: { KeyD: 68, KeyJ: 74, KeyR: 82, KeyK: 75, KeyE: 69, Space: 32 }[code] || 0,
  });
  const touch = (type, points) => command('Input.dispatchTouchEvent', { type, touchPoints: points });
  const rectangles = (selector) => evaluate(`(() => {
    const rects = [...document.querySelectorAll(${JSON.stringify(selector)})].map(node => {
      const rect = node.getBoundingClientRect();
      return {id:node.id || node.dataset.action,x:rect.x,y:rect.y,w:rect.width,h:rect.height};
    });
    const buttons=[...root.querySelectorAll('button')].filter(n=>n.checkVisibility()&&(!dialog||dialog.contains(n))).map(n=>{const r=n.getBoundingClientRect();const clip=dialog?dialog.getBoundingClientRect():content.contains(n)?c:shell.getBoundingClientRect();return {n,b:{left:Math.max(r.left,clip.left),right:Math.min(r.right,clip.right),top:Math.max(r.top,clip.top),bottom:Math.min(r.bottom,clip.bottom)}};}).filter(({b})=>b.bottom>b.top&&b.right>b.left);
      const overlaps=[];for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=buttons[i].b,b=buttons[j].b;if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)overlaps.push([buttons[i].n.dataset.action,buttons[j].n.dataset.action]);}
      return {overlaps,width:innerWidth,height:innerHeight,rects};
  })()`);
  const validateRects = (layout) => {
    assert.equal(layout.width, 390);
    assert.equal(layout.height, 844);
    for (const rect of layout.rects) {
      assert.ok(rect.w > 0 && rect.h > 0, `not visible: ${rect.id}`);
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= 390 && rect.y + rect.h <= 844,
        `outside viewport: ${JSON.stringify(rect)}`);
    }
    for (let left = 0; left < layout.rects.length; left++) {
      for (let right = left + 1; right < layout.rects.length; right++) {
        const a = layout.rects[left];
        const b = layout.rects[right];
        assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y,
          `overlap: ${a.id}, ${b.id}`);
      }
    }
  };

  await command('Runtime.enable'); await command('Page.enable'); await command('Log.enable');
  const audit = async () => {
    const result = await evaluate(`(() => {
      const root=document.querySelector('#meta-screen'); const shell=root.querySelector('.inn-shell');
      const content=shell.querySelector('.content'); const footer=shell.querySelector('.action-footer');
      const r=shell.getBoundingClientRect(); const c=content.getBoundingClientRect();
      const dialog=root.querySelector('dialog[open]'); const d=dialog?.getBoundingClientRect();
      const tiny=[...root.querySelectorAll('button')].filter(n=>n.checkVisibility()).filter(n=>{const b=n.getBoundingClientRect();return b.width<43.5||b.height<43.5}).map(n=>n.dataset.action);
      const buttons=[...root.querySelectorAll('button')].filter(n=>n.checkVisibility()&&(!dialog||dialog.contains(n))).map(n=>{const r=n.getBoundingClientRect();const clip=dialog?dialog.getBoundingClientRect():content.contains(n)?c:shell.getBoundingClientRect();return {n,b:{left:Math.max(r.left,clip.left),right:Math.min(r.right,clip.right),top:Math.max(r.top,clip.top),bottom:Math.min(r.bottom,clip.bottom)}};}).filter(({b})=>b.bottom>b.top&&b.right>b.left);
      const overlaps=[];for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=buttons[i].b,b=buttons[j].b;if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)overlaps.push([buttons[i].n.dataset.action,buttons[j].n.dataset.action]);}
      return {overlaps,width:innerWidth,height:innerHeight,right:r.right,left:r.left,bottom:r.bottom,overflow:content.scrollWidth>content.clientWidth+1,tiny,
        footerOverlap:footer ? c.bottom>footer.getBoundingClientRect().top+1:false,dialog:d?{left:d.left,right:d.right,top:d.top,bottom:d.bottom}:null};
    })()`);
    assert.ok(result.left>=-1&&result.right<=result.width+1&&result.bottom<=result.height+1,JSON.stringify(result));
    assert.equal(result.overflow,false,JSON.stringify(result)); assert.equal(result.footerOverlap,false);
    assert.deepEqual(result.tiny,[]); assert.deepEqual(result.overlaps,[]); if(result.dialog) assert.ok(result.dialog.left>=-1&&result.dialog.right<=result.width+1&&result.dialog.top>=-1&&result.dialog.bottom<=result.height+1,JSON.stringify(result));
  };
  const states=[];
  for(const [width,height] of [[360,640],[390,844],[1280,900]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await command('Page.navigate',{url:process.env.ARPG_TEST_URL || `http://127.0.0.1:${httpPort}/arpg/?dev=1`});
    await waitFor('window.__arpg');
    await evaluate(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js'); const {addXp}=await import('./js/meta/progression.js'); const {craft}=await import('./js/meta/items.js');
      let s=addXp(createSave({name:'장비 UI 시험',answers:[0,0,0,0,0],createdAt:1}),451);s={...s,gold:10000,stacks:{...s.stacks,scrap:100,hide:100,fang:100,enhance_stone_1:10}};s=craft(s,'iron_sword');s.cleared=Object.fromEntries(Object.keys(s.cleared).map(k=>[k,true]));new SaveStore(localStorage).save(s);})()`);
    await command('Page.reload'); await waitFor(page('inn')); await audit();
    assert.equal(await evaluate("document.querySelectorAll('.p2-socket').length"),5);
    await click('[data-action="socket"][data-slot="weapon"]'); await audit();
    await click('[data-action="open-item"][data-uid="craft:iron_sword:1"]'); await audit();
    assert.ok(await evaluate("document.querySelectorAll('dialog[open] [data-line]').length>=3"));
    await click('[data-action="equip"][data-uid="craft:iron_sword:1"]');assert.equal(await evaluate('__arpg.save.equipped.weapon'),'craft:iron_sword:1');
    await click('[data-action="inventory"]');await audit();await click('[data-action="filter"][data-slot="weapon"]');await audit();
    await click('[data-action="open-item"][data-uid="starter:weapon"]');await audit();await click('[data-action="close-sheet"]');
    await click('[data-action="inn"]');await click('[data-action="merchant"]');await audit();
    const offer=await evaluate("document.querySelector('[data-action=\"open-item\"]').dataset.uid");await click(`[data-action="open-item"][data-uid="${offer}"]`);await audit();
    const gold=await evaluate('__arpg.save.gold'); await click(`[data-action="buy-gear"][data-uid="${offer}"]`);assert.ok(await evaluate('__arpg.save.gold')<gold);
    await click('[data-action="inn"]');await click('[data-action="forge"]');await audit();
    await click('[data-action="enhance"][data-uid="craft:iron_sword:1"]');assert.equal(await evaluate("__arpg.save.items.find(i=>i.uid==='craft:iron_sword:1').enhance"),1);
    await click('[data-action="select-gear"][data-uid="starter:weapon"]');await click('[data-action="dismantle"][data-uid="starter:weapon"]');await audit();
    await click('[data-action="close-sheet"]');assert.ok(await evaluate("__arpg.save.items.some(i=>i.uid==='starter:weapon')"));
    await click('[data-action="inn"]');await click('[data-action="shop"]');await audit();
    await click('[data-action="inn"]');await click('[data-action="board"]');await audit();assert.equal(await evaluate("document.querySelectorAll('[data-action=\"sortie\"]').length"),20);
    await click('[data-action="sortie"][data-stage="S20"]');await audit();states.push({width,height,ok:true});
  }
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));console.log(JSON.stringify({ok:true,states,equipment:5,stages:20,purchase:true,enhance:true,dismantleCancel:true,consoleErrors:errors.length}));
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

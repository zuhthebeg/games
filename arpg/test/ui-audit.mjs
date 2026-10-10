// Deterministic text and mobile bounds audit; no screenshots: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 19098);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8732);
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
  const rectangles = (selector) => evaluate(`(() => {
    const rects = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(node => node.checkVisibility()).map(node => {
      const rect = node.getBoundingClientRect();
      return {id:node.id || node.dataset.action,x:rect.x,y:rect.y,w:rect.width,h:rect.height};
    });
    return {width:innerWidth,height:innerHeight,rects};
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
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Log.enable');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await command('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const basePath = process.env.ARPG_AUDIT_PATH || '/arpg/';
  await command('Page.navigate', { url: `http://127.0.0.1:${httpPort}${basePath}` });
  await waitFor(page('intro'));
  await evaluate(`(async () => {
    const {HubUI}=await import('./js/ui/hub.js');
    const {createSave}=await import('./js/meta/save.js');
    const {addXp}=await import('./js/meta/progression.js');
    const {craft}=await import('./js/meta/items.js');
    const {settleRound}=await import('./js/meta/run.js');
    let save=addXp(createSave({name:'여관 시험',answers:[0,0,0,0,0],createdAt:1}),451);
    save.gold=3000;
    save.stacks={...save.stacks,scrap:100,hide:100,fang:100};
    save=craft(save,'iron_sword');
    save.cleared.S1=true;
    const outcome=settleRound(save,{stageId:'S2',terminal:'clear',depositedXp:23,
      tempLoot:{gold:12,stacks:{scrap:2,hide:1},items:[]},used:{potions:1}});
    window.auditHub=new HubUI({save,persist:()=>{},startRound:()=>{},resetSave:()=>{},onOverlay:()=>{}});
    auditHub.receipt=outcome.receipt;
    auditHub.pendingReceipt={receipt:outcome.receipt,cause:'고블린 — 고블린의 베기'};
  })()`);
  const counts={};
  const baseline=process.argv.includes('--baseline');
  for(const [name,method] of Object.entries({inn:'showInn()',owner:'showOwner()',shop:'showShop()',
    forge:'showForge()',trainer:'showAllocation()',board:'showBoard()',sortie:"showSortie('S2')",
    receipt:'showReceipt()'})){
    await evaluate(`auditHub.${method}`);
    counts[name]=await evaluate("document.querySelector('#meta-screen').innerText.length");
    if(!baseline){
      validateRects(await rectangles('#meta-screen button'));
      assert.ok(await evaluate("document.querySelector('#meta-screen').scrollWidth<=innerWidth"), name+' overflows');
    }
  }
  await evaluate("auditHub.pendingReceipt.receipt.terminal='death';auditHub.showReceipt()");
  counts.death=await evaluate("document.querySelector('#meta-screen').innerText.length");
  await evaluate("auditHub.pendingReceipt.receipt.terminal='return_scroll';auditHub.showReceipt()");
  counts.return=await evaluate("document.querySelector('#meta-screen').innerText.length");
  if(!baseline){
    // Same fixture measured at origin/main 7f12158, before the rework.
    const before={inn:181,shop:213,forge:619,receipt:125};
    for(const [name,count] of Object.entries(before)) assert.ok(counts[name]<=count/2,name+' text reduction <50%');
    await evaluate("auditHub.showForge();document.querySelector('.craft-list').open=true");
    counts.craftShelf=await evaluate("document.querySelector('#meta-screen').innerText.length");
    validateRects(await rectangles('#meta-screen button'));
    await evaluate("auditHub.showForge();auditHub.action('select-gear',{uid:'craft:iron_sword:1'})");
    counts.forgeSelected=await evaluate("document.querySelector('#meta-screen').innerText.length");
    validateRects(await rectangles('#meta-screen button:not(details button)'));
    await evaluate("auditHub.showReceipt()");
    validateRects(await rectangles('#meta-screen button'));
    await evaluate("auditHub.showShop();auditHub.save.gold=0;auditHub.showShop()");
    assert.ok(await evaluate("document.querySelectorAll('.unaffordable').length===3 && document.querySelector('#shop-buy').disabled"));
    await evaluate("auditHub.name='여관 시험';auditHub.answers=[];auditHub.showQuiz()");
    validateRects(await rectangles('#meta-screen button'));
    assert.ok(await evaluate("[...document.querySelectorAll('.quiz-option')].every(node=>node.clientHeight<65)"), 'quiz choice wrapped');
    assert.ok(await evaluate("matchMedia('(pointer: coarse)').matches && [...document.querySelectorAll('#actions kbd')].every(node=>getComputedStyle(node).display==='none')"));
  }
  await evaluate(`(async () => {
    const {HUD}=await import('./js/ui/hud.js');
    const {createWorld,addPlayer,startStage}=await import('./js/sim/world.js');
    const {buildRoundMods,currentLoad,createTracker}=await import('./js/meta/run.js');
    const world=createWorld({seed:1});
    addPlayer(world,{pid:'local',weapon:'blade',mods:buildRoundMods(auditHub.save)});
    startStage(world,'S2');
    const hud=new HUD();
    hud.begin(world);
    const tracker=createTracker(1);
    hud.meta(currentLoad(auditHub.save,tracker),tracker);
    document.querySelector('#meta-screen').hidden=true;
  })()`);
  counts.hud=await evaluate("document.querySelector('#hud').innerText.length");
  if(!baseline) validateRects(await rectangles('#actions button'));
  const errors=events.filter(event=>event.method==='Runtime.exceptionThrown'
    || event.method==='Runtime.consoleAPICalled' && event.params.type==='error'
    || event.method==='Log.entryAdded' && event.params.entry.level==='error');
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log(JSON.stringify({counts,viewport:{width:390,height:844},consoleErrors:errors.length,
    boundsChecked:!baseline}));
} finally {
  socket?.close();
  const stopped = [chrome, server].map(async (child) => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolveExit) => child.once('exit', resolveExit)), sleep(2500)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  await Promise.all(stopped);
  await rm(profile, { recursive: true, force: true });
}

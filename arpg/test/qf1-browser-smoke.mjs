// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 19461);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8961);
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

  const results=[];
  const layout=()=>evaluate(`(()=>{const c=document.querySelector('.inn-shell>.content'),r=c.getBoundingClientRect();
    const cards=[...document.querySelectorAll('.side-contract')].filter(n=>n.checkVisibility()).map(n=>{const b=n.getBoundingClientRect();return {left:b.left,right:b.right,h:b.height,clipped:n.scrollWidth>n.clientWidth+1}});
    return {overflow:document.documentElement.scrollWidth>innerWidth||c.scrollWidth>c.clientWidth+1,content:{left:r.left,right:r.right},cards};})()`);
  for(const [width,height] of [[390,844],[1280,800]]) {
    const desktop=width>600;
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:!desktop});
    await command('Emulation.setTouchEmulationEnabled',{enabled:!desktop,maxTouchPoints:2});
    await command('Page.navigate',{url:process.env.ARPG_TEST_URL||`http://127.0.0.1:${httpPort}/arpg/?debug=1`});await waitFor('window.__arpg');
    await evaluate(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');const {trained}=await import('./test/fixtures/trained.js');
      const s=trained(createSave({name:'가죽 보급',answers:[0,0,0,0,0],weapon:'blade',createdAt:5}),25);for(const id of ['S1','S2','S3','S4'])s.cleared[id]=true;s.flags.chiefPity=true;const {instance}=await import('./js/meta/items.js');s.items.push(instance('qf1:blade','rune_blade_epic',1,[]),instance('qf1:armor','leather_vest_epic',1,[]));s.equipped.weapon='qf1:blade';s.equipped.body='qf1:armor';s.stacks.potion=10;const {cap}=await import('./js/meta/stats.js');const room=cap(s.level)-s.stats.con;const add=Math.min(room,s.statPoints);s.stats.con+=add;s.statPoints-=add;
      new SaveStore(localStorage).save(s);localStorage.setItem('arpg.autoAttack','1');})()`);
    await command('Page.reload');await waitFor(page('inn'));
    await nativeActivate('[data-action="board"]',desktop);await nativeActivate('[data-action="map-region"][data-region="forest"]',desktop);
    const offer=await layout();assert.equal(offer.overflow,false);assert.equal(offer.cards.length,1);
    for(const card of offer.cards){assert.ok(card.left>=offer.content.left-1&&card.right<=offer.content.right+1);assert.ok(card.h>=44);assert.equal(card.clipped,false);}
    await nativeActivate('[data-action="quest-accept"][data-quest="QF1"]',desktop);
    assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('arpg.save.v1')).quests`),{QF1:{state:'active',progress:0}});
    // Second fixture path: an almost-finished contract proves completion + one-time XP in the same real hunt.
    const start=desktop?140:0;
    if(desktop){await evaluate(`(async()=>{const {SaveStore}=await import('./js/meta/save.js');const store=new SaveStore(localStorage);const s=store.load();s.quests.QF1.progress=140;store.save(s);})()`);await command('Page.reload');await waitFor(page('inn'));await nativeActivate('[data-action="board"]',desktop);await nativeActivate('[data-action="map-region"][data-region="forest"]',desktop);}
    assert.match(await evaluate(`document.querySelector('.side-contract.active').textContent`),new RegExp(`가죽 ${start} / 150`));
    await nativeActivate('[data-action="sortie"][data-stage="S5"]',desktop);await waitFor(page('sortie'));
    assert.match(await evaluate(`document.querySelector('.side-quest-line').textContent`),new RegExp(`사냥꾼의 가죽 보급 ${start} / 150`));
    await nativeActivate('[data-action="launch"]',desktop);await waitFor('__arpg.world?.round?.stageId==="S5"');
    // Debug panel speed only multiplies the real accumulator; the hunt itself is the normal sim + AUTO.
    await evaluate(`(()=>{const n=document.querySelector('#dbg-speed');n.value='4';n.dispatchEvent(new Event('change'));})()`);
    await waitFor(page('receipt'),240000);
    const receipt=await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('arpg.save.v1'));return {line:document.querySelector('.side-quest-receipt')?.textContent||'',quests:s.quests,hide:s.stacks.hide||0,terminal:s.lastReceipt.terminal,kept:s.lastReceipt.lootKept.stacks.hide||0,xp:s.lastReceipt.xpGained}})()`);
    assert.ok(['clear','return_scroll'].includes(receipt.terminal),receipt.terminal);assert.ok(receipt.kept>0,JSON.stringify(receipt));
    const gained=Math.min(150-start,receipt.kept);assert.equal(receipt.quests.QF1.progress,start+gained);assert.equal(receipt.quests.QF1.state,start+gained===150?'done':'active');
    assert.match(receipt.line,new RegExp(`가죽 \\+${gained} · ${start+gained} / 150${start+gained===150?' · 완료 · XP \\+680':''}`));
    await command('Page.reload');await waitFor(page('inn'));
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('arpg.save.v1')).quests.QF1.progress`),receipt.quests.QF1.progress);
    await nativeActivate('[data-action="board"]',desktop);await nativeActivate('[data-action="map-region"][data-region="swamp"]',desktop);
    assert.equal(await evaluate(`document.querySelectorAll('.map-quests:not([hidden]) .side-contract').length`),1);
    const done=receipt.quests.QF1.state==='done';
    assert.match(await evaluate(`document.querySelector('.map-quests:not([hidden]) .side-contract').textContent`),new RegExp(`가죽 ${receipt.quests.QF1.progress} / 150.*${done?'완료':'진행 중'}`));
    const after=await layout();assert.equal(after.overflow,false);
    results.push({viewport:[width,height],input:desktop?'keyboard':'touch',receipt,offer:offer.cards,after:after.cards});
  }
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
  assert.equal(errors.length,0,JSON.stringify(errors));console.log(JSON.stringify({ok:true,results,consoleErrors:0,screenshots:0},null,2));
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

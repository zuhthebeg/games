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
  const metrics = () => evaluate(`(() => {const d=document.querySelector('dialog[open]'),b=d.querySelector('.p2-sheet-body');const rows=[...d.querySelectorAll('.compare-split:first-of-type tbody tr')].filter(n=>n.checkVisibility());return {scrollHeight:b.scrollHeight,clientHeight:b.clientHeight,scrollWidth:b.scrollWidth,clientWidth:b.clientWidth,dialogHeight:Math.round(d.getBoundingClientRect().height),rows:rows.length,aligned:rows.every(row=>{const a=row.children[0].getBoundingClientRect(),c=row.children[1].getBoundingClientRect();return a.top===c.top&&a.height===c.height&&c.left>=a.right-1;})};})()`);
  const close = () => nativeActivate('[data-action="close-sheet"]',false);
  for(const [width,height] of [[360,740],[1280,800]]) {
    const desktop=width>600;
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:!desktop});
    await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/?dev=1`});await waitFor('window.__arpg');
    await evaluate(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');const {instance}=await import('./js/meta/items.js');let s=createSave({name:'아카데미 검수',answers:[0,0,0,0,0],createdAt:1});s.gold=10000;s.items.push(instance('ui2:old','iron_sword_epic',1,[{k:'hp_flat',v:10},{k:'speed_pct',v:3},{k:'capacity_flat',v:3}]),{...instance('ui2:new','rune_blade_epic',1,[{k:'atk_pct',v:6},{k:'mana_pct',v:4},{k:'potion_pct',v:5}]),enhance:2});s.equipped.weapon='ui2:old';new SaveStore(localStorage).save(s);})()`);
    await command('Page.reload');await waitFor(page('inn'));
    await nativeActivate('[data-action="trainer"]',desktop);await audit();
    assert.equal(await evaluate(`document.querySelector('.panel-header h2').textContent`),'아카데미');
    for(const family of ['blade','bow','focus']) {await nativeActivate(`[data-action="academy-tab"][data-family="${family}"]`,desktop);await audit();assert.equal(await evaluate(`document.querySelector('[role="tab"][aria-selected="true"]').dataset.family`),family);assert.deepEqual(await evaluate(`[...document.querySelectorAll('.academy-stage')].map(n=>+n.dataset.grade)`),[0,1,2]);}
    const academyLayout=await evaluate(`(()=>{const content=document.querySelector('.content'),pair=[...document.querySelectorAll('.academy-stage[data-grade="1"] .skill-card')].map(n=>{const r=n.getBoundingClientRect();return {id:n.dataset.skill,x:r.x,y:r.y,w:r.width,h:r.height};});return {scrollHeight:content.scrollHeight,clientHeight:content.clientHeight,pair,cardCount:document.querySelectorAll('.academy-panel .skill-card').length};})()`);
    assert.equal(academyLayout.cardCount,4);assert.equal(academyLayout.pair.length,2);assert.equal(academyLayout.pair[0].y,academyLayout.pair[1].y);
    assert.ok(academyLayout.pair[1].x>=academyLayout.pair[0].x+academyLayout.pair[0].w);
    // Native arrows select adjacent faculty, Home/End anchors, Tab/Enter remain ordinary button navigation.
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home'});
    assert.equal(await evaluate(`document.querySelector('[role="tab"][aria-selected="true"]').dataset.family`),'blade');
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});
    assert.equal(await evaluate(`document.querySelector('[role="tab"][aria-selected="true"]').dataset.family`),'bow');
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End'});
    assert.equal(await evaluate(`document.querySelector('[role="tab"][aria-selected="true"]').dataset.family`),'focus');
    await nativeActivate('[data-action="learn-skill"][data-id="healing_light"]',desktop);assert.ok(await evaluate(`__arpg.save.learned.includes('healing_light')`));
    // K2: learning drops the skill into the first empty slot, so the academy shows it equipped.
    assert.equal(await evaluate(`__arpg.save.loadout.includes('healing_light')`),true);
    assert.equal(await evaluate(`document.querySelector('[data-action="equip-skill"][data-id="healing_light"]').getAttribute('aria-pressed')`),'true');await audit();
    await nativeActivate('[data-action="inn"]',desktop);await nativeActivate('[data-action="character"]',desktop);await nativeActivate('[data-action="character-tab"][data-tab="skills"]',desktop);
    await nativeActivate('[data-action="skill-detail"][data-id="healing_light"]',desktop);await audit();assert.ok(await evaluate(`document.querySelector('dialog[open]').textContent.includes('최대 HP 30%')`));await close();
    await nativeActivate('[data-action="inn"]',desktop);await nativeActivate('[data-action="shop"]',desktop);await audit();
    await nativeActivate('[data-action="shop-select"][data-id="potion"]',desktop);await audit();
    const unit=await evaluate(`+document.querySelector('#shop-total').textContent`),beforeGold=await evaluate('__arpg.save.gold');
    await nativeActivate('[data-action="shop-count"][data-step="1"]',desktop);assert.equal(await evaluate(`+document.querySelector('#shop-count').value`),2);assert.equal(await evaluate(`+document.querySelector('#shop-total').textContent`),unit*2);
    assert.equal(await evaluate(`document.querySelector('#shop-remaining').textContent.trim()`),`${beforeGold-unit*2} G`);
    await nativeActivate('[data-action="shop-max"]',desktop);const max=await evaluate(`+document.querySelector('#shop-count').value`);assert.ok(max>2&&max<=99);await audit();
    // Lighter potions allow 99; the ledger still follows an entered quantity before a two-item purchase.
    await evaluate(`document.querySelector('#shop-count').value=99;document.querySelector('#shop-count').dispatchEvent(new Event('change',{bubbles:true}))`);
    assert.equal(await evaluate(`document.querySelector('#shop-buy').disabled`),false);assert.equal(await evaluate(`+document.querySelector('#shop-total').textContent`),unit*99);
    await evaluate(`document.querySelector('#shop-count').value=2;document.querySelector('#shop-count').dispatchEvent(new Event('change',{bubbles:true}))`);
    const beforePotion=await evaluate('__arpg.save.stacks.potion');await nativeActivate('#shop-buy',desktop);assert.equal(await evaluate('__arpg.save.stacks.potion'),beforePotion+2);assert.equal(await evaluate('__arpg.save.gold'),beforeGold-unit*2);await close();
    assert.equal(await evaluate(`document.activeElement.dataset.id`),'potion','closing returns focus to the source card');
    await nativeActivate('[data-action="shop-select"][data-id="return_scroll"]',desktop);await nativeActivate('#shop-buy',desktop);assert.equal(await evaluate(`document.querySelector('#shop-buy').disabled`),false);await nativeActivate('#shop-buy',desktop);assert.equal(await evaluate('__arpg.save.stacks.return_scroll'),3);await close();
    await nativeActivate('[data-action="inn"]',desktop);await nativeActivate('[data-action="inventory"]',desktop);await nativeActivate('[data-action="open-item"][data-uid="ui2:new"]',desktop);await audit();
    const compare=await metrics();assert.ok(compare.aligned);assert.equal(compare.scrollWidth,compare.clientWidth);assert.ok(compare.scrollHeight-compare.clientHeight<=compare.clientHeight,'comparison must require <= one viewport scroll');
    assert.equal(await evaluate(`document.querySelectorAll('dialog[open] .compare-sheet > .compare-split thead th').length`),2);
    assert.ok(await evaluate(`document.querySelector('dialog[open] [data-line="hp_flat"]').textContent.includes('—')`));
    const more=await evaluate(`document.querySelector('dialog[open] details summary').textContent`);assert.equal(more,'옵션 4개 더');
    const firstSummary='dialog[open] details:first-of-type summary';await nativeActivate(firstSummary,desktop);assert.equal(await evaluate(`document.querySelector('dialog[open] details').open`),true);await audit();const expanded=await metrics();await nativeActivate(firstSummary,desktop);await close();
    await nativeActivate('[data-action="inn"]',desktop);await nativeActivate('[data-action="merchant"]',desktop);await nativeActivate('[data-action="open-item"][data-mode="buy"]',desktop);await audit();const buyCompare=await metrics();
    assert.ok(buyCompare.scrollHeight-buyCompare.clientHeight<=buyCompare.clientHeight);assert.doesNotMatch(await evaluate(`document.querySelector('dialog[open]').textContent`),/창고로 보관|가벼울수록|DEF 수치/);await close();
    // Poor fixture is loaded through the existing SaveStore, not a debug mutation seam.
    await evaluate(`(async()=>{const {SaveStore}=await import('./js/meta/save.js');const store=new SaveStore(localStorage),s=store.load();s.gold=0;store.save(s)})()`);await command('Page.reload');await waitFor(page('inn'));
    await nativeActivate('[data-action="shop"]',desktop);await nativeActivate('[data-action="shop-select"][data-id="potion"]',desktop);assert.equal(await evaluate(`document.querySelector('#shop-buy').disabled`),true);assert.match(await evaluate(`document.querySelector('#purchase-reason').textContent`),/골드 부족/);await audit();
    states.push({width,height,nativeTouch:!desktop,nativeKeyboard:desktop,academy:academyLayout,compare,expanded,buyCompare});
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

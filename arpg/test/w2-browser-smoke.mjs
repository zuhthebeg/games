// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 19212);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8812);
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
  for(const [width,height] of [[360,640],[390,844],[1280,900]]) {
    const desktop=width>600;
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:!desktop});
    await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    await command('Page.navigate',{url:process.env.ARPG_TEST_URL || `http://127.0.0.1:${httpPort}/arpg/?dev=1`});await waitFor('window.__arpg');
    await evaluate(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');const {learnSkill}=await import('./js/meta/skills.js');const {instance}=await import('./js/meta/items.js');let s=(await import('./test/fixtures/trained.js')).trained(createSave({name:'W2 터치',answers:[0,0,0,0,0],createdAt:1}));s.gold=10000;s.items.push(instance('w2:old','iron_sword_epic',1,[{k:'hp_flat',v:12},{k:'speed_pct',v:3},{k:'capacity_flat',v:6}]),instance('w2:inventory','training_sword_rare',1,[{k:'atk_pct',v:6},{k:'mana_pct',v:4}]));s.equipped.weapon='w2:old';s.cleared.S10=true;s.cleared.S17=true;for(const id of ['flame_ring','whirl','heavy_cleave','frost_lance'])s=learnSkill(s,id);new SaveStore(localStorage).save(s);})()`);
    await command('Page.reload');await waitFor(page('inn'));
    await nativeActivate('[data-action="socket"][data-slot="weapon"]',desktop);await audit();
    assert.ok(await evaluate(`document.querySelector('dialog').textContent.includes('공격력')&&!document.querySelector('dialog .compare-sheet')`));
    await nativeActivate('[data-action="open-item"][data-uid="w2:inventory"]',desktop);await audit();
    for(const key of ['hp_flat','speed_pct','capacity_flat']) assert.ok(await evaluate(`document.querySelector('dialog[open] [data-line="${key}"]').querySelector('.compare-delta').getAttribute('aria-label').includes('사라짐')`));
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await waitFor(`!document.querySelector('dialog[open]')`);
    await nativeActivate('[data-action="character"]',desktop);
    await nativeActivate('[data-action="character-tab"][data-tab="skills"]',desktop);await audit();
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.character-skills [data-action="skill-detail"]')].map(n=>n.dataset.id)`),['heavy_cleave','whirl','lunge']);
    await nativeActivate('[data-action="skill-family-tab"][data-family="focus"]',desktop);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.character-skills [data-action="skill-detail"]')].map(n=>n.dataset.id)`),['flame_ring','frost_lance','ember_bolt']);
    await nativeActivate('.character-skills [data-action="skill-detail"][data-id="frost_lance"]',desktop);await audit();
    assert.ok(await evaluate(`document.querySelector('dialog[open]').textContent.includes('620 px')&&document.querySelector('dialog[open]').textContent.includes('12 MP')`));
    await nativeActivate('#skill-slot-1',desktop);assert.equal(await evaluate('__arpg.save.loadout[0]'),'frost_lance');await nativeActivate('[data-action="close-sheet"]',desktop);
    await nativeActivate('[data-action="inn"]',desktop);await nativeActivate('[data-action="inventory"]',desktop);
    await nativeActivate('[data-action="open-item"][data-uid="w2:inventory"]',desktop);await audit();
    assert.ok(await evaluate(`document.querySelector('dialog[open] [data-line="capacity_flat"]').textContent.includes('6 kg')&&document.querySelector('dialog[open] [data-line="capacity_flat"]').querySelector('.compare-delta').getAttribute('aria-label').includes('사라짐')`));
    await nativeActivate('[data-action="close-sheet"]',desktop);
    await nativeActivate('[data-action="inn"]',desktop);await nativeActivate('[data-action="merchant"]',desktop);
    await nativeActivate('[data-action="open-item"][data-mode="buy"]',desktop);await audit();
    for(const key of ['hp_flat','speed_pct','capacity_flat'])assert.ok(await evaluate(`!!document.querySelector('dialog[open] [data-line="${key}"]')`));
    assert.ok(await evaluate(`!/가방 한도를 늘리며|가벼울수록|DEF 수치/.test(document.querySelector('dialog[open]').textContent)`));
    await nativeActivate('[data-action="close-sheet"]',desktop);
    await nativeActivate('[data-action="inn"]',desktop);await nativeActivate('[data-action="board"]',desktop);await audit();
    assert.equal(await evaluate(`document.querySelectorAll('[data-action="sortie"]').length`),27); // legacy24 + U5 three graveyard contracts
    assert.ok(await evaluate(`document.querySelector('.panel-header').textContent.includes('내 레벨 1')`));
    await nativeActivate('[data-action="map-region"][data-region="swamp"]',desktop);await audit();
    assert.equal(await evaluate(`document.querySelector('[data-stage="S11"]').disabled`),false);
    assert.equal(await evaluate(`document.querySelector('[data-stage="S18"]').disabled`),true);
    await nativeActivate('[data-action="map-region"][data-region="castle"]',desktop);await audit();
    assert.equal(await evaluate(`document.querySelector('[data-stage="S14"]').disabled`),false);
    assert.equal(await evaluate(`document.querySelector('[data-stage="S20"]').disabled`),true);
    await nativeActivate('[data-action="sortie"][data-stage="S14"]',desktop);await audit();
    assert.ok(await evaluate(`document.querySelector('.quest-level-comparison').textContent.includes('내 레벨 1')&&document.querySelector('.quest-level-comparison').textContent.includes('추천 레벨')`));
    await nativeActivate('[data-action="launch"]',desktop);await waitFor('__arpg.world?.round?.stageId==="S14"');
    assert.ok(await evaluate(`document.querySelector('#notice').textContent.includes('무너진 성채')`));
    // Reload abandons this local fixture fight (no production storage/authority). Native current-index AUTO and sound taps preserve baseline fix.
    const muted=await evaluate('__arpg.feedback.audio.muted');await nativeActivate('[data-battle-settings]');await nativeActivate(muted?'#battle-sound-on':'#battle-sound-off');assert.notEqual(await evaluate('__arpg.feedback.audio.muted'),muted);
    {const before=await evaluate("document.querySelector('#attack').classList.contains('auto')");await nativeActivate(before?'#battle-auto-off':'#battle-auto-on');assert.equal(await evaluate("document.querySelector('#attack').classList.contains('auto')"),!before);}
    await command('Page.reload');await waitFor(page('inn'));
    // Mount the real HubUI on a fresh root for settled receipt ownership/sale, while retaining actual index/CSS/modules.
    await evaluate(`(async()=>{const {HubUI}=await import('./js/ui/hub.js');const {SaveStore}=await import('./js/meta/save.js');const {settleRound}=await import('./js/meta/run.js');const {instance}=await import('./js/meta/items.js');const store=new SaveStore(localStorage);const settled=settleRound(store.load(),{stageId:'S12',terminal:'return_scroll',tempLoot:{items:[instance('w2:sale','iron_sword_epic',1,[{k:'atk_pct',v:6},{k:'hp_flat',v:10},{k:'mana_pct',v:4}])],stacks:{},gold:0}});store.save(settled.save);const old=document.querySelector('#meta-screen'),root=old.cloneNode(false);old.replaceWith(root);window.w2Hub=new HubUI({save:settled.save,persist:s=>store.save(s),onOverlay:()=>{},startRound:()=>{},resetSave:()=>{}});w2Hub.finish(settled.save,settled.receipt,'');})()`);
    await nativeActivate('[data-action="reveal"]',desktop);await audit();
    await nativeActivate('[data-action="open-item"][data-uid="w2:sale"]',desktop);await audit();
    assert.ok(await evaluate(`document.querySelector('dialog').textContent.includes('+6%')&&document.querySelector('dialog').textContent.includes('+10 HP')&&document.querySelector('dialog').textContent.includes('+4%')`));
    for(const key of ['speed_pct','capacity_flat'])assert.ok(await evaluate(`document.querySelector('dialog[open] [data-line="${key}"]').querySelector('.compare-delta').getAttribute('aria-label').includes('사라짐')`));
    assert.ok(await evaluate(`document.querySelector('dialog[open] [data-line="hp_flat"]').querySelector('.compare-delta').getAttribute('aria-label').includes('감소')`));
    assert.ok(await evaluate(`document.querySelector('dialog[open] [data-line="mana_pct"]').querySelector('.compare-delta').getAttribute('aria-label').includes('새로 추가')`));
    await nativeActivate('[data-action="close-sheet"]',desktop);
    const beforeGold=await evaluate('w2Hub.save.gold');
    const price=await evaluate(`(async()=>{const {gearPrice}=await import('./js/meta/shop.js');const {ECONOMY}=await import('./js/meta/economy.js');return Math.floor(gearPrice(w2Hub.save.items.find(i=>i.uid==='w2:sale'))*ECONOMY.sellFraction);})()`);
    await nativeActivate('[data-action="loot-sell"][data-uid="w2:sale"]',desktop);
    assert.equal(await evaluate('w2Hub.save.gold'),beforeGold+price);assert.ok(await evaluate(`!w2Hub.save.items.some(i=>i.uid==='w2:sale')`));
    assert.equal(await evaluate(`!!document.querySelector('[data-action="loot-sell"][data-uid="w2:sale"]')`),false);
    assert.ok(await evaluate(`document.querySelector('.reveal').textContent.includes('판매함')`));
    await command('Page.reload');await waitFor(page('inn'));
    assert.ok(await evaluate(`!__arpg.save.items.some(i=>i.uid==='w2:sale')`));assert.equal(await evaluate('__arpg.save.gold'),beforeGold+price);
    states.push({width,height,nativeTouch:!desktop,nativeKeyboard:desktop,saleReload:true});
  }
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');
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

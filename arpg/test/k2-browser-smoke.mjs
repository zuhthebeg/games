// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 9393);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8819);
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
  for(const [width,height] of [[390,844],[1280,800]]) {
    const desktop=width>600;
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:!desktop});
    await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/`});await waitFor('window.__arpg');
    // Pre-K2 save: family pick only, two blade books and one magic book learned.
    await evaluate(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');let s=createSave({name:'K2 검수',answers:[0,0,0,0,0],weapon:'blade',createdAt:1});s.cleared.S1=true;s.learned=['whirl','heavy_cleave','frost_lance'];s.skills={blade:'whirl'};delete s.loadout;s.stacks={potion:5,mana_potion:2,return_scroll:1};new SaveStore(localStorage).save(s);})()`);
    await command('Page.reload');await waitFor(page('inn'));
    assert.deepEqual(await evaluate('[...__arpg.save.loadout]'),['whirl','heavy_cleave','lunge']);
    await nativeActivate('[data-action="character"]');await nativeActivate('[data-action="character-tab"][data-tab="skills"]');await audit();
    const slots=()=>evaluate(`[...document.querySelectorAll('.loadout-slot')].map(n=>({id:n.dataset.id||null,blocked:n.classList.contains('blocked'),x:!!n.querySelector('.slot-blocked')}))`);
    assert.deepEqual((await slots()).map(s=>s.id),['whirl','heavy_cleave','lunge']);
    // Put a magic skill into slot 3 from its detail sheet (blade can cast magic at 60%).
    // Learned skills are grouped by family; the tab opens on the equipped weapon's family.
    assert.equal(await evaluate(`document.querySelector('[data-action="skill-family-tab"][aria-selected="true"]').dataset.family`),'blade');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.character-skill')].map(n=>n.dataset.id)`),['heavy_cleave','whirl','lunge']);
    await nativeActivate('[data-action="skill-family-tab"][data-family="focus"]');
    await nativeActivate('.character-skill[data-id="frost_lance"] [data-action="skill-detail"]');await audit();
    await nativeActivate('#skill-slot-3');
    assert.deepEqual(await evaluate('[...__arpg.save.loadout]'),['whirl','heavy_cleave','frost_lance']);
    assert.equal(await evaluate(`document.querySelector('#skill-slot-3').getAttribute('aria-pressed')`),'true');
    await nativeActivate('[data-action="close-sheet"]');
    // A bow skill in slot 2 is blocked for the blade: ✕ in the loadout.
    await nativeActivate('[data-action="skill-family-tab"][data-family="bow"]');
    await nativeActivate('.character-skill[data-id="volley"] [data-action="skill-detail"]');await nativeActivate('#skill-slot-2');await nativeActivate('[data-action="close-sheet"]');
    const withBow=await slots();
    assert.deepEqual(withBow.map(s=>s.id),['whirl','volley','frost_lance']);assert.deepEqual(withBow.map(s=>s.x),[false,true,false]);await audit();
    await command('Page.reload');await waitFor(page('inn'));
    assert.deepEqual(await evaluate('[...__arpg.save.loadout]'),['whirl','volley','frost_lance']);
    // K2b: books need the family stat (숙련 30 / 상급 45); this starter lacks 민첩 30.
    await nativeActivate('[data-action="trainer"]');await nativeActivate('[data-action="academy-tab"][data-family="bow"]');await audit();
    const gate=await evaluate(`(()=>{const c=document.querySelector('[data-skill="pierce_shot"]');return {chip:c.textContent.includes('요구 민첩 30'),disabled:c.querySelector('[data-action="learn-skill"]').disabled,lack:c.querySelector('.loss')?.textContent||''}})()`);
    assert.equal(gate.chip,true);assert.equal(gate.disabled,true);assert.match(gate.lack,/^민첩 \d+\/30( · 골드 부족)?$/);
    assert.match(await evaluate(`document.querySelector('[data-skill="blast_arrow"]').textContent`),/요구 민첩 45/);
    await nativeActivate('[data-action="inn"]');
    await nativeActivate('[data-action="board"]');await nativeActivate('[data-action="sortie"][data-stage="S2"]');await nativeActivate('[data-action="launch"]');
    await waitFor('document.querySelector("#meta-screen").hidden && __arpg.world?.round.state==="running"');
    const hud=await evaluate(`['skill','skill2','skill3'].map(id=>{const n=document.querySelector('#'+id),r=n.getBoundingClientRect();return {hidden:n.hidden,label:n.getAttribute('aria-label'),blocked:n.classList.contains('blocked'),x:!!n.querySelector('.slot-blocked'),disabled:n.disabled,r:[r.left,r.top,r.right,r.bottom]}})`);
    assert.deepEqual(hud.map(h=>h.label),['회전 베기','산개 사격','서리 창']);
    assert.deepEqual(hud.map(h=>h.x),[false,true,false]);assert.equal(hud[1].disabled,true);
    assert.deepEqual(await evaluate('[...__arpg.world.entities[0].skills]'),['whirl',null,'frost_lance']);
    // All HUD action buttons inside the viewport and not overlapping.
    const boxes=await evaluate(`[...document.querySelectorAll('#actions button')].filter(n=>!n.hidden).map(n=>{const r=n.getBoundingClientRect();return {id:n.id,l:r.left,t:r.top,r:r.right,b:r.bottom}})`);
    for(const b of boxes) assert.ok(b.l>=0&&b.t>=0&&b.r<=width&&b.b<=height,JSON.stringify(b));
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],c=boxes[j];assert.ok(!(a.l<c.r-1&&a.r>c.l+1&&a.t<c.b-1&&a.b>c.t+1),JSON.stringify([a,c]));}
    // Slot 3 fires with its own key and cooldown; touch on the slot 3 button works too.
    const key=async(code,key)=>{await command('Input.dispatchKeyEvent',{type:'keyDown',code,key});await sleep(120);await command('Input.dispatchKeyEvent',{type:'keyUp',code,key});};
    await key('Semicolon',';');
    await waitFor(`(__arpg.world.entities[0].cds.frost_lance||0)>0`,4000);
    await waitFor(`!(__arpg.world.entities[0].cds.frost_lance>0) && !__arpg.world.entities[0].act && !document.querySelector('#skill3').disabled`,8000);
    const r=hud[2].r;await touch('touchStart',[{x:(r[0]+r[2])/2,y:(r[1]+r[3])/2}]);await sleep(80);await touch('touchEnd',[]);
    await waitFor(`(__arpg.world.entities[0].cds.frost_lance||0)>0`,4000);
    await key('KeyK','k');await waitFor(`(__arpg.world.entities[0].cds.whirl||0)>0`,4000);
    states.push({width,height,statGate:gate.lack,migrated:true,slotSheet:true,blockedX:true,persisted:true,hud:hud.map(h=>h.label),keyAndTouch:true});
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

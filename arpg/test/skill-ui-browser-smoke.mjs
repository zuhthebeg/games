// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 9427);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8857);
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
  const tapAt=async(selector)=>{const p=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    assert.equal(await evaluate(`document.elementFromPoint(${p.x},${p.y})?.closest(${JSON.stringify(selector)})!==null`),true,selector);
    await touch('touchStart',[{x:p.x,y:p.y}]);await sleep(60);await touch('touchEnd',[]);await sleep(350);};
  const scrollTop=()=>evaluate(`document.querySelector('.inn-shell>.content').scrollTop`);
  for(const [width,height] of [[390,844],[1280,800]]) {
    const desktop=width>600;
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:!desktop});
    await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/`});await waitFor('window.__arpg');
    await evaluate(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');const {statBudget,BASE_STATS,STAT_KEYS}=await import('./js/meta/stats.js');let s=createSave({name:'기술 UI',answers:[0,0,0,0,0],weapon:'blade',createdAt:1});s.cleared.S1=true;s.level=7;s.statPoints=statBudget(7)-STAT_KEYS.reduce((n,k)=>n+s.stats[k]-BASE_STATS[k],0);s.gold=5000;s.learned=['whirl','heavy_cleave','frost_lance'];s.loadout=['whirl','heavy_cleave','lunge'];s.stacks={potion:5,mana_potion:2,return_scroll:1};new SaveStore(localStorage).save(s);})()`);
    await command('Page.reload');await waitFor(page('inn'));
    // 1) Stat +/− re-renders keep the scroll position and the pressed button.
    await nativeActivate('[data-action="character"]');await audit();
    const plus='[data-action="stat-plus"][data-key="luk"]:not([data-step])', minus='[data-action="stat-minus"][data-key="luk"]';
    const room=await evaluate(`(()=>{const c=document.querySelector('.inn-shell>.content');document.querySelector(${JSON.stringify(plus)}).scrollIntoView({block:'center'});return {top:c.scrollTop,max:c.scrollHeight-c.clientHeight}})()`);
    if(room.max>0) assert.ok(room.top>0,JSON.stringify(room));
    const left=()=>evaluate(`Number(document.querySelector('#allocation-left b').textContent)`);const start=await left();assert.ok(start>=2,String(start));
    await tapAt(plus);
    assert.equal(await scrollTop(),room.top);assert.equal(await left(),start-1);
    assert.equal(await evaluate(`document.activeElement.matches(${JSON.stringify(plus)})`),true);
    await tapAt(plus);await tapAt(minus);
    assert.equal(await scrollTop(),room.top);assert.equal(await left(),start-1);await audit();
    // 2) Skills tab: grouped by family like the academy, opening on the weapon's family.
    await nativeActivate('[data-action="character-tab"][data-tab="skills"]');await audit();
    const cards=()=>evaluate(`[...document.querySelectorAll('.character-skill')].map(n=>n.dataset.id)`);
    assert.equal(await evaluate(`document.querySelector('[data-action="skill-family-tab"][aria-selected="true"]').dataset.family`),'blade');
    assert.deepEqual(await cards(),['heavy_cleave','whirl','lunge']);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-action="skill-family-tab"]')].map(n=>n.textContent.trim())`),['검술 3','궁술 1','마법 2']);
    await nativeActivate('[data-action="skill-family-tab"][data-family="focus"]');await audit();
    assert.deepEqual(await cards(),['frost_lance','ember_bolt']);
    // 3) Direct slot buttons on each card; no sheet needed. Tap the lit number again to take it out.
    const pick=(id,slot)=>`.character-skill[data-id="${id}"] [data-action="skill-slot"][data-slot="${slot}"]`;
    await tapAt(pick('frost_lance',2));
    assert.deepEqual(await evaluate('[...__arpg.save.loadout]'),['whirl','heavy_cleave','frost_lance']);
    assert.equal(await evaluate(`!!document.querySelector('dialog[open]')`),false);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(pick('frost_lance',2))}).getAttribute('aria-pressed')`),'true');
    assert.equal(await evaluate(`document.querySelector('#loadout-slot-3').dataset.id`),'frost_lance');await audit();
    await tapAt(pick('frost_lance',2));
    assert.deepEqual(await evaluate('[...__arpg.save.loadout]'),['whirl','heavy_cleave',null]);
    assert.match(await evaluate(`document.querySelector('#loadout-slot-3').textContent`),/비어 있음/);
    // Weapon mismatch: coloured card + small warning button with the details; equipping stays allowed.
    const warn=id=>evaluate(`(()=>{const c=document.querySelector('.character-skill[data-id="${id}"]');return {weak:c.classList.contains('use-weak'),blocked:c.classList.contains('use-blocked'),label:c.querySelector('[data-action="skill-warn"]')?.textContent||null}})()`);
    assert.deepEqual(await warn('frost_lance'),{weak:true,blocked:false,label:'60%'});
    await tapAt('.character-skill[data-id="frost_lance"] [data-action="skill-warn"]');await audit();
    assert.match(await evaluate(`document.querySelector('dialog[open]').textContent`),/현재 무기검[\s\S]*위력60%[\s\S]*지팡이 100%/);
    await nativeActivate('[data-action="close-sheet"]');
    await nativeActivate('[data-action="skill-family-tab"][data-family="bow"]');
    assert.deepEqual(await warn('volley'),{weak:false,blocked:true,label:'✕'});
    await tapAt('.character-skill[data-id="volley"] [data-action="skill-warn"]');
    assert.match(await evaluate(`document.querySelector('dialog[open]').textContent`),/사냥 중 사용불가/);await nativeActivate('[data-action="close-sheet"]');
    await tapAt(pick('volley',2));
    assert.equal(await evaluate('__arpg.save.loadout[2]'),'volley');
    assert.equal(await evaluate(`document.querySelector('#loadout-slot-3').classList.contains('blocked')`),true);
    await tapAt(pick('volley',2));
    await nativeActivate('[data-action="skill-family-tab"][data-family="blade"]');
    assert.deepEqual(await warn('whirl'),{weak:false,blocked:false,label:null});
    // Moving an equipped skill to another slot swaps with the occupant.
    await nativeActivate('[data-action="skill-family-tab"][data-family="blade"]');
    await tapAt(pick('whirl',1));
    assert.deepEqual(await evaluate('[...__arpg.save.loadout]'),['heavy_cleave','whirl',null]);await audit();
    // 4) Academy: same slot buttons on learned cards, with the loadout shown on top.
    await nativeActivate('[data-action="inn"]');await nativeActivate('[data-action="trainer"]');await audit();
    assert.equal(await evaluate(`document.querySelectorAll('#academy-panel ~ * .loadout-slot, .content > .loadout .loadout-slot').length`),3);
    await nativeActivate('[data-action="academy-tab"][data-family="focus"]');await audit();
    const academyPick=(id,slot)=>`[data-skill="${id}"] [data-action="skill-slot"][data-slot="${slot}"]`;
    const before=await evaluate(`(()=>{const c=document.querySelector('.inn-shell>.content');document.querySelector(${JSON.stringify(academyPick('frost_lance',2))}).scrollIntoView({block:'center'});return c.scrollTop})()`);
    await tapAt(academyPick('frost_lance',2));
    assert.deepEqual(await evaluate('[...__arpg.save.loadout]'),['heavy_cleave','whirl','frost_lance']);
    assert.equal(await scrollTop(),before);assert.equal(await evaluate(`document.querySelector('#loadout-slot-3').dataset.id`),'frost_lance');
    assert.equal(await evaluate(`!!document.querySelector('[data-skill="pierce_shot"] [data-action="skill-slot"]')`),false);await audit();
    await command('Page.reload');await waitFor(page('inn'));
    assert.deepEqual(await evaluate('[...__arpg.save.loadout]'),['heavy_cleave','whirl','frost_lance']);
    states.push({width,height,statScroll:room,groupedTabs:true,inlineSlots:true,academySlots:true});
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

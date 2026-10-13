// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 9457);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8887);
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
  // Reload may briefly expose a new document before #meta-screen exists; keep waiting.
  const page = (name) => `document.querySelector('#meta-screen')?.dataset.page===${JSON.stringify(name)}
    && document.querySelector('#meta-screen')?.hidden===false`;
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

  for(const [width,height] of [[320,844],[390,844],[430,844],[1280,800]]) {
    const desktop=width>600;
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:!desktop});
    await command('Emulation.setTouchEmulationEnabled',{enabled:!desktop,maxTouchPoints:2});
    await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/`});await waitFor('window.__arpg');
    for(const state of ['locked','legacy','eligible']) {
      await evaluate(`(async()=>{const {throneLateSave}=await import('./test/fixtures/throne-late.js');const {SaveStore}=await import('./js/meta/save.js');const s=throneLateSave('host');s.cleared.S20=${state==='eligible'};s.stageThreat.S20=${state==='eligible'?1:0};s.cleared.TD1=${state==='legacy'};s.stageThreat.TD1=${state==='legacy'?2:0};new SaveStore(localStorage).save(s);})()`);
      await command('Page.reload');await waitFor(page('inn'));await nativeActivate('[data-action="board"]',desktop);
      const proof=await evaluate(`(()=>{
        const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}};
        const map=document.querySelector('.world-map'),content=document.querySelector('.inn-shell>.content');
        return {map:rect(map),content:rect(content),scroll:{h:content.scrollHeight,client:content.clientHeight},overflow:document.documentElement.scrollWidth>innerWidth,
          nodes:[...map.querySelectorAll('.region-node')].map(n=>({id:n.dataset.region,rect:rect(n),label:rect(n.querySelector('span')),text:n.textContent,clipped:n.scrollWidth>n.clientWidth||n.scrollHeight>n.clientHeight})),
          edges:[...map.querySelectorAll('line')].map(n=>[+n.getAttribute('x1'),+n.getAttribute('y1'),+n.getAttribute('x2'),+n.getAttribute('y2')]),footer:!!document.querySelector('.action-footer')};})()`);
      assert.equal(proof.overflow,false);assert.equal(proof.nodes.length,8);assert.equal(proof.edges.length,8);
      for(const n of proof.nodes){assert.equal(n.clipped,false,n.id);assert.ok(n.rect.x>=proof.map.x+2&&n.rect.right<=proof.map.right-2,n.id);assert.ok(n.rect.y>=proof.map.y+2&&n.rect.bottom<=proof.map.bottom-2,n.id);assert.ok(n.label.x>=n.rect.x&&n.label.right<=n.rect.right&&n.label.y>=n.rect.y&&n.label.bottom<=n.rect.bottom,n.id);}
      for(let i=0;i<proof.nodes.length;i++)for(let j=i+1;j<proof.nodes.length;j++){
        const a=proof.nodes[i].rect,b=proof.nodes[j].rect;
        assert.ok(a.right+5<=b.x-5||b.right+5<=a.x-5||a.bottom+5<=b.y-5||b.bottom+5<=a.y-5,`${width}: ${proof.nodes[i].id}/${proof.nodes[j].id}`);
      }
      assert.ok(proof.edges.some(e=>JSON.stringify(e)==='[24,74,50,92]'));
      // Every connected line uses actual card centers; endpoints stay within parchment.
      for(const edge of proof.edges)for(let i=0;i<4;i+=2)assert.ok(proof.nodes.some(n=>Math.abs(n.rect.x+n.rect.w/2-(proof.map.x+2+edge[i]/100*(proof.map.w-4)))<1&&Math.abs(n.rect.y+n.rect.h/2-(proof.map.y+2+edge[i+1]/100*(proof.map.h-4)))<1));
      for(const n of proof.nodes){await nativeActivate(`[data-action="map-region"][data-region="${n.id}"]`,desktop);
        assert.equal(await evaluate(`document.querySelector('.map-quests:not([hidden])').dataset.region`),n.id);
        assert.equal(await evaluate(`document.querySelector('[data-region="${n.id}"].region-node').getAttribute('aria-pressed')`),'true');}
      await nativeActivate('[data-action="map-region"][data-region="throne"]',desktop);
      const gate=await evaluate(`({disabled:document.querySelector('[data-stage="TD1"]').disabled,text:document.querySelector('.map-quests[data-region="throne"]').textContent,header:document.querySelector('.panel-header').textContent})`);
      assert.equal(gate.disabled,state!=='eligible');assert.doesNotMatch(gate.text,/시험|잠정|균형/);assert.match(gate.header,new RegExp(state==='eligible'?'2 / 20':'1 / 20'));
      const bottom=await evaluate(`(()=>{const c=document.querySelector('.inn-shell>.content');c.scrollTop=c.scrollHeight;const r=c.getBoundingClientRect(),q=document.querySelector('.map-quests:not([hidden])').getBoundingClientRect();return {scrollTop:c.scrollTop,max:c.scrollHeight-c.clientHeight,questBottom:q.bottom,contentBottom:r.bottom}})()`);
      assert.ok(Math.abs(bottom.scrollTop-bottom.max)<1);assert.ok(bottom.questBottom<=bottom.contentBottom);
      if(state==='eligible'){
        await nativeActivate('[data-action="sortie"][data-stage="TD1"]',desktop);await waitFor(page('sortie'));
        const footer=await evaluate(`(()=>{const f=document.querySelector('.action-footer').getBoundingClientRect(),c=document.querySelector('.inn-shell>.content').getBoundingClientRect();return {footerTop:f.y,footerBottom:f.bottom,contentBottom:c.bottom,viewport:innerHeight,copy:document.querySelector('#meta-screen').textContent}})()`);
        assert.ok(footer.contentBottom<=footer.footerTop+1);assert.ok(footer.footerBottom<=height);assert.doesNotMatch(footer.copy,/시험|잠정|균형/);
        proof.sortieFooter=footer;
      }
      results.push({viewport:[width,height],state,proof,gate,bottom});
    }
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

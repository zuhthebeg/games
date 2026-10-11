// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 19127);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8753);
const profile = await mkdtemp(join(tmpdir(), 'arpg-enchant-'));
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
  await command('Runtime.enable'); await command('Page.enable'); await command('Log.enable');
  const url = `http://127.0.0.1:${httpPort}/arpg/?dev=1&debug=1`;
  const connect = async () => {
    await waitFor('window.__arpg && document.querySelector("#arpg-debug-toggle")');
    await evaluate(`(async()=>{const {registerDebugAction}=await import('./js/debug/index.js');
      registerDebugAction({group:'FX test',label:'context',run(ctx){window.__fxContext=ctx;}});
      document.querySelector('#arpg-debug-toggle').click();
      [...document.querySelectorAll('#dbg-extensions button')].find(n=>n.textContent==='FX test · context').click();})()`);
    await waitFor('window.__fxContext');
    await evaluate("window.__fxSounds=[];document.addEventListener('arpg:presentation-sound',e=>__fxSounds.push(e.detail));");
    await click('[data-debug="close"]');
  };
  const fixture = async (level, outcome = null) => evaluate(`(async()=>{
    const {createSave}=await import('./js/meta/save.js'); const {enchant}=await import('./js/meta/enchant.js');
    let s,expected;
    for(let seed=1;seed<200;seed++) {
      s=createSave({name:'강화 연출 시험',answers:[0,0,0,0,0],createdAt:seed});
      s.items.find(i=>i.uid===s.equipped.weapon).enhance=${level};
      s.stacks.scroll_enchant_weapon=20;s.stacks.scroll_blessed_weapon=2;s.stacks.scroll_enchant_armor=20;s.stacks.enhance_stone_3=2;
      expected=${level}<10?enchant(s,s.equipped.weapon,'scroll_enchant_weapon').result:null;
      if(!${JSON.stringify(outcome)}||expected.outcome===${JSON.stringify(outcome)})break;
    }
    __fxContext.persistSave(s);__fxContext.hub.showForge();return {expected,seed:s.createdAt,uid:s.equipped.weapon};
  })()`);
  const audit = async () => {
    const result=await evaluate(`(()=>{
      const root=document.querySelector('#meta-screen'),shell=root.querySelector('.inn-shell'),content=shell.querySelector('.content'),dialog=root.querySelector('dialog[open]');
      const clip=dialog||content,r=clip.getBoundingClientRect(),buttons=[...clip.querySelectorAll('button')].filter(n=>n.checkVisibility()).map(n=>{const b=n.getBoundingClientRect();return {action:n.dataset.action,left:Math.max(b.left,r.left),right:Math.min(b.right,r.right),top:Math.max(b.top,r.top),bottom:Math.min(b.bottom,r.bottom)};}).filter(b=>b.bottom>b.top&&b.right>b.left);
      const overlaps=[];for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=buttons[i],b=buttons[j];if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)overlaps.push([a.action,b.action]);}
      return {overlaps,overflow:clip.scrollWidth>clip.clientWidth+1,contained:r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1};
    })()`);
    assert.deepEqual(result.overlaps,[],JSON.stringify(result));assert.equal(result.overflow,false,JSON.stringify(result));assert.equal(result.contained,true,JSON.stringify(result));
  };
  const tapFx = async () => {
    const p=await evaluate(`(()=>{const r=document.querySelector('.enchant-stage').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await touch('touchStart',[{...p,radiusX:1,radiusY:1,force:1,id:1}]);await touch('touchEnd',[]);
  };
  const scenarios=[];
  for(const [width,height] of [[360,640],[390,844],[1280,900]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await command('Page.navigate',{url});await connect();
    let f=await fixture(5);await audit();
    await click('[data-action="enhance"]');
    assert.equal(await evaluate("document.querySelector('[data-enchant-fx]').dataset.phase"),'charge');
    assert.equal(await evaluate('__arpg.save.items[0].enhance'),6);
    const saved=await evaluate('JSON.stringify(__arpg.save)');
    assert.equal(await evaluate('localStorage.getItem("arpg.save.v1")'),saved,'save precedes animation');
    await evaluate(`__fxContext.hub.action('enhance',{uid:'starter:weapon',scroll:'scroll_enchant_weapon'})`);
    assert.equal(await evaluate('JSON.stringify(__arpg.save)'),saved,'double spending blocked');
    await tapFx();await waitFor("document.querySelector('[data-enchant-fx]')?.dataset.phase==='result'");
    assert.equal(await evaluate("document.querySelector('.enchant-result').textContent"),'+6');await audit();
    await tapFx();await waitFor("!document.querySelector('[data-enchant-fx]')");
    assert.equal(await evaluate('__fxSounds.at(-1)'), 'level-up');
    scenarios.push({width,height,kind:'safe',touchSkip:true,persistBeforeAnimation:true});
    if(width===390) {
      await fixture(0);const started=Date.now();await click('[data-action="enhance"]');
      await waitFor("document.querySelector('[data-enchant-fx]')?.dataset.phase==='result'");
      const chargeMs=Date.now()-started;assert.ok(chargeMs>=90&&chargeMs<500,chargeMs);
      await waitFor("!document.querySelector('[data-enchant-fx]')");
      const totalMs=Date.now()-started;assert.ok(totalMs>=280&&totalMs<800,totalMs);
      scenarios.push({width,height,kind:'safe-natural',chargeMs,totalMs});
    }
    for(const outcome of ['success','destroyed']) {
      f=await fixture(6,outcome);await audit();
      assert.ok(await evaluate("document.querySelector('.forge-work.risky') && document.querySelector('.primary.danger') && document.querySelector('.forge-odds').textContent.includes('50%')"));
      await click('[data-action="pick-scroll"][data-id="scroll_blessed_weapon"]');
      assert.equal(await evaluate("document.querySelector('[data-id=\"scroll_blessed_weapon\"]').getAttribute('aria-pressed')"),'true');
      await click('[data-action="pick-scroll"][data-id="scroll_enchant_weapon"]');
      const start=Date.now();await click('[data-action="enhance"]');
      assert.equal(await evaluate("document.querySelector('[data-enchant-fx]').dataset.enchantFx"),outcome);
      const committed=await evaluate('JSON.stringify(__arpg.save)');await audit();
      await waitFor("document.querySelector('[data-enchant-fx]')?.dataset.phase==='result'");
      const chargeMs=Date.now()-start;assert.ok(chargeMs>=1100&&chargeMs<2200,chargeMs);
      const text=await evaluate("document.querySelector('.enchant-result').textContent+' / '+document.querySelector('.enchant-detail').textContent");
      assert.ok(outcome==='success'?text.includes('+7 성공'):text.includes('장비가 산산조각 났다')&&text.includes('남은 강화석 '+f.expected.refund.enhance_stone_1+'개'));
      await waitFor("!document.querySelector('[data-enchant-fx]')");
      assert.equal(await evaluate('JSON.stringify(__arpg.save)'),committed,'animation cannot change state');
      assert.equal(await evaluate('__fxSounds.at(-1)'),outcome==='destroyed'?'kill':'level-up');
      scenarios.push({width,height,kind:outcome,seed:f.seed,chargeMs,text});
    }
    await fixture(0);
    await evaluate("window.__fxCounts=[];window.__countObserver=new MutationObserver(()=>{const n=document.querySelector('.enchant-fx.crack .enchant-result');if(n?.textContent&&!__fxCounts.includes(n.textContent))__fxCounts.push(n.textContent);});__countObserver.observe(document.querySelector('#meta-screen'),{childList:true,subtree:true,characterData:true});");
    await click('[data-action="crack-greater"][data-family="weapon"]');
    assert.equal(await evaluate("document.querySelector('[data-enchant-fx]').dataset.enchantFx"),'crack');
    const crack=await evaluate('JSON.parse(JSON.stringify(__fxContext.hub.lastCrack))');
    await waitFor("document.querySelector('[data-enchant-fx]')?.dataset.phase==='result'");
    assert.equal(await evaluate("document.querySelector('.enchant-result').textContent"),`주문서 ${crack.count}장`);
    await waitFor("!document.querySelector('[data-enchant-fx]')");
    const counts=await evaluate('__countObserver.disconnect();__fxCounts');assert.ok(counts.length>=3,JSON.stringify(counts));
    scenarios.push({width,height,kind:'crack',count:crack.count,countup:counts});
  }
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await fixture(6,'destroyed');await click('[data-action="enhance"]');
  await waitFor("document.querySelector('.enchant-fx.reduced')?.dataset.phase==='result'");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.enchant-gear')).animationName"),'none');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.enchant-shards')).display"),'none');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await waitFor("!document.querySelector('[data-enchant-fx]')");
  await command('Emulation.setEmulatedMedia',{features:[]});
  // Reload during the risky charge: no reroll or replay, only the committed save.
  await fixture(6,'success');await click('[data-action="enhance"]');
  const persisted=await evaluate('JSON.stringify(__arpg.save)');await command('Page.reload');await waitFor(page('inn'));
  assert.equal(await evaluate('JSON.stringify(__arpg.save)'),persisted);assert.equal(await evaluate("!!document.querySelector('[data-enchant-fx]')"),false);
  const combat=[];
  for(const level of [6,7,8,9,10]) {
    await command('Page.navigate',{url});await connect();await fixture(level);
    await click('[data-action="inn"]');
    assert.equal(await evaluate("document.querySelector('.portrait-weapon-glow').dataset.enhance"),String(level));
    await click('[data-action="board"]');await click('[data-action="sortie"][data-stage="S1"]');await click('#sortie-confirm');
    await waitFor(`__arpg.art.visuals.some(v=>v.weaponGlow?.level===${level}&&v.mode==='paperdoll')`,20000);
    const pixels=await evaluate(`(()=>{
      const renderer=__fxContext.renderer,app=renderer.app,visual=[...renderer.views.values()].find(v=>v.visual.debug.weaponGlow).visual;
      const before=JSON.stringify(__arpg.world);app.render();const a=app.renderer.extract.pixels({target:renderer.root}).pixels;
      visual.container.children[1].visible=false;app.render();const b=app.renderer.extract.pixels({target:renderer.root}).pixels;
      visual.container.children[1].visible=true;app.render();let changed=0;for(let p=0;p<a.length;p+=4)if(a[p]!==b[p]||a[p+1]!==b[p+1]||a[p+2]!==b[p+2])changed++;
      return {level:${level},changedPixels:changed,glow:visual.debug.weaponGlow,worldUnchanged:before===JSON.stringify(__arpg.world),sameSize:a.length===b.length};
    })()`);
    assert.ok(pixels.changedPixels>10,JSON.stringify(pixels));assert.equal(pixels.sameSize,true);assert.equal(pixels.worldUnchanged,true);combat.push(pixels);
  }
  // Isolated provider pixel/direction and reduced-motion tests, all three kits.
  const kitPixels=await evaluate(`(async()=>{
    const {Application,RenderTexture}=await import('./vendor/pixi-8.22.0.min.mjs');const {VisualProvider}=await import('./js/render/visual-provider.js');
    const app=new Application();await app.init({width:192,height:192,preference:'webgl',backgroundAlpha:0,autoStart:false});const target=RenderTexture.create({width:192,height:192}),rows=[];
    for(const kit of ['blade','bow','focus'])for(const level of [6,7,8,9,10]) {
      const s=JSON.parse(JSON.stringify(__arpg.save));s.items.find(i=>i.uid===s.equipped.weapon).enhance=level;
      const provider=new VisualProvider({atlases:false}),entity=Object.freeze({kind:'player',weapon:kit,r:18,facing:Math.PI/4,hp:100,maxHp:100});
      provider.beginRound([entity],s);const v=provider.createVisual(entity);v.container.position.set(96,112);app.stage.addChild(v.container);
      v.update(entity,{age:0,deadAge:0,flash:0,frozen:false,reduced:false},1/60);app.renderer.render({container:app.stage,target,clear:true});
      const glow=v.container.children[1];const withGlow=app.renderer.extract.pixels({target}).pixels;glow.visible=false;app.renderer.render({container:app.stage,target,clear:true});const without=app.renderer.extract.pixels({target}).pixels;
      if(withGlow.length!==without.length)throw Error('pixel buffers must have identical dimensions');
      let changed=0;for(let p=0;p<withGlow.length;p++)if(withGlow[p]!==without[p])changed++;
      v.update(entity,{age:0,deadAge:0,flash:0,frozen:false,reduced:true},1/60);app.render();
      rows.push({kit,level,changed,particlesReduced:v.debug.weaponGlow.particles,reduced:v.debug.weaponGlow.reduced});v.destroy();
    }
    target.destroy(true);app.destroy(true,{children:true});return rows;
  })()`);
  assert.ok(kitPixels.every(r=>r.changed>10&&r.particlesReduced===0&&r.reduced));
  await command('Emulation.setCPUThrottlingRate',{rate:6});
  const performanceSample=await evaluate(`(async()=>{
    const {Container}=await import('./vendor/pixi-8.22.0.min.mjs');const {withWeaponGlow}=await import('./js/render/weapon-glow.js');
    const base={container:new Container(),update(){},destroy(){this.container.destroy();}};const v=withWeaponGlow(base,10,'blade'),entity=Object.freeze({facing:0,dead:false}),anim={reduced:false,frozen:false},samples=[];
    const nodes=v.container.children[1].children.length;
    for(let batch=0;batch<80;batch++){const start=performance.now();for(let i=0;i<100;i++)v.update(entity,anim,1/60);samples.push((performance.now()-start)/100);}
    samples.sort((a,b)=>a-b);const result={sixXCPU:true,updates:8000,p95Ms:samples[Math.ceil(samples.length*.95)-1],maxMs:samples.at(-1),nodes,nodeCountStable:nodes===v.container.children[1].children.length,phoneEvidence:false};v.destroy();return result;
  })()`);
  await command('Emulation.setCPUThrottlingRate',{rate:1});
  assert.equal(performanceSample.nodeCountStable,true);assert.ok(performanceSample.p95Ms<1,JSON.stringify(performanceSample));
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));
  const report={ok:true,scenarios,reducedMotion:true,reloadAntiReroll:true,combat,kitPixels,performanceSample,consoleErrors:0,screenshots:0};
  if(process.env.ARPG_REPORT)await writeFile(process.env.ARPG_REPORT,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
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

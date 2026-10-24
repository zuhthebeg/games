// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {ENCHANT} from '../js/meta/economy.js';

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
    }, 30000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolveCommand(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    let response;
    try {response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });}
    catch(error) {throw new Error(`${error.message}: ${expression.slice(0,180)}`);}
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
  const fixture = async (level, outcome = null, stoneId = 'enhance_stone_1', target = null) => evaluate(`(async()=>{
    const {createSave}=await import('./js/meta/save.js'); const {enchant,enchantPreview}=await import('./js/meta/enchant.js');const {ENCHANT}=await import('./js/meta/economy.js');
    let s,expected;
    for(let seed=1;seed<10000;seed++) {
      s=createSave({name:'강화 연출 시험',answers:[0,0,0,0,0],createdAt:seed});
      s.items.find(i=>i.uid===s.equipped.weapon).enhance=${level};
      s.stacks.enhance_stone_1=100;s.stacks.enhance_stone_blessed=100;s.stacks.enhance_stone_cursed=100;
      expected=${level}<ENCHANT.max?enchant(s,s.equipped.weapon,${JSON.stringify(stoneId)}).result:null;
      if((!${JSON.stringify(outcome)}||expected.outcome===${JSON.stringify(outcome)})
        && (${target}===null||expected.to===${target}))break;
    }
    __fxContext.persistSave(s);__fxContext.hub.forgeTab='enhance';__fxContext.hub.selectedUid=null;__fxContext.hub.forgeStone='enhance_stone_1';__fxContext.hub.showForge();return {expected,seed:s.createdAt,uid:s.equipped.weapon,preview:enchantPreview(s,s.equipped.weapon,${JSON.stringify(stoneId)})};
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
  let screenshotCount=0;
  const capture = async name => {
    if(!process.env.ARPG_SCREENSHOT_PREFIX)return;
    const image=await command('Page.captureScreenshot',{format:'png'});
    await writeFile(`${process.env.ARPG_SCREENSHOT_PREFIX}-${name}.png`,Buffer.from(image.data,'base64'));screenshotCount++;
  };
  const cleaned = async () => {
    assert.deepEqual(await evaluate(`({nodes:document.querySelectorAll('.enchant-fx,.enchant-particles,.enchant-cards').length,active:__fxContext.hub.enchantFx.active,cleaned:__fxContext.hub.enchantFx.stats.cleaned})`),{nodes:0,active:false,cleaned:true});
  };
  const tabsAudit = async () => {
    assert.equal(await evaluate("document.querySelector('[data-forge-tab]').dataset.forgeTab"),'enhance');
    assert.ok(await evaluate("(()=>{const n=document.querySelector('.forge-hero-art'),r=n.getBoundingClientRect();return r.width>=96&&r.width<=192&&r.height===r.width;})()"),'responsive ritual art remains square and legible');
    assert.equal(await evaluate("!!document.querySelector('[data-action=\"craft-scroll\"],[data-action=\"dismantle\"],[data-action=\"sell\"],[data-action=\"craft\"]')"),false);
    assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-action=forge-tab]")].map(n=>n.dataset.tab)'),['enhance','craft','salvage']);
    assert.equal(await evaluate('!!document.querySelector("[data-action=crack-greater]")'),false);
    await click('[data-action="forge-tab"][data-tab="craft"]');await audit();assert.equal(await evaluate('!!document.querySelector(".craft-list")'),true);
    await click('[data-action="forge-tab"][data-tab="salvage"]');await audit();
    for(const action of ['dismantle','sell'])assert.equal(await evaluate(`!!document.querySelector('[data-action="${action}"]')`),true);
    for(const action of ['equip','craft'])assert.equal(await evaluate(`!!document.querySelector('[data-action="${action}"]')`),false);
    await click('[data-action="forge-tab"][data-tab="enhance"]');await audit();
  };
  for(const [width,height] of [[360,640],[390,844],[1280,900]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await command('Page.navigate',{url});await connect();
    let f=await fixture(5);await audit();await tabsAudit();if(width===390)await capture('forge');
    await click('[data-action="enhance"]');
    assert.equal(await evaluate("document.querySelector('[data-enchant-fx]').dataset.phase"),'charge');
    assert.equal(await evaluate('__arpg.save.items[0].enhance'),6);
    const saved=await evaluate('JSON.stringify(__arpg.save)');
    assert.equal(await evaluate('localStorage.getItem("arpg.save.v1")'),saved,'save precedes animation');
    await evaluate(`__fxContext.hub.action('enhance',{uid:'starter:weapon',stone:'enhance_stone_1'});__fxContext.hub.action('forge-tab',{tab:'salvage'});__fxContext.hub.action('inn',{})`);
    assert.equal(await evaluate("document.querySelector('[data-forge-tab]').dataset.forgeTab"),'enhance');
    assert.equal(await evaluate('JSON.stringify(__arpg.save)'),saved,'double spending blocked');
    await tapFx();await waitFor("document.querySelector('[data-enchant-fx]')?.dataset.phase==='result'");
    assert.equal(await evaluate("document.querySelector('.enchant-result').textContent"),'+6');await audit();
    await tapFx();await waitFor("!document.querySelector('[data-enchant-fx]')");
    assert.equal(await evaluate('__fxSounds.at(-1)'), 'level-up');await cleaned();
    assert.equal(await evaluate('__fxContext.hub.selectedUid'),f.uid);
    assert.equal(await evaluate("document.activeElement.dataset.action"),'enhance');
    scenarios.push({width,height,kind:'safe',touchSkip:true,persistBeforeAnimation:true});
    if(width===390) {
      await fixture(0);const started=Date.now();await click('[data-action="enhance"]');
      await waitFor("document.querySelector('[data-enchant-fx]')?.dataset.phase==='result'");
      const chargeMs=Date.now()-started;assert.ok(chargeMs>=160&&chargeMs<600,chargeMs);
      await waitFor("!document.querySelector('[data-enchant-fx]')");
      const totalMs=Date.now()-started;assert.ok(totalMs>=570&&totalMs<1000,totalMs);
      scenarios.push({width,height,kind:'safe-natural',chargeMs,totalMs});
      // Same gear stays selected and the next ritual can start immediately after a skipped result.
      const chain=await fixture(0),beforeStones=await evaluate('__arpg.save.stacks.enhance_stone_1');
      for(let level=1;level<=6;level++) {
        await click('[data-action="enhance"]');
        assert.equal(await evaluate('__arpg.save.items[0].enhance'),level);
        assert.equal(await evaluate('__arpg.save.stacks.enhance_stone_1'),beforeStones-level*5);
        const savedStep=await evaluate('JSON.stringify(__arpg.save)');assert.equal(await evaluate('localStorage.getItem("arpg.save.v1")'),savedStep);
        await tapFx();await tapFx();await waitFor("!document.querySelector('[data-enchant-fx]')");await cleaned();
        assert.equal(await evaluate('__fxContext.hub.selectedUid'),chain.uid);
      }
      assert.equal(await evaluate("document.querySelector('.forge-hero-art').dataset.enhance"),'6');
      assert.equal(await evaluate("!!document.querySelector('[data-action=\"enhance\"].danger')"),true);
      scenarios.push({width,height,kind:'safe-repeat',levels:6,persistEachStep:true,sameSelection:true});
      // Native horizontal rack pan, not just programmatic clicks offscreen.
      await evaluate(`(()=>{const s=JSON.parse(JSON.stringify(__arpg.save));for(let i=0;i<8;i++)s.items.push({...s.items[1],uid:'rack:'+i});__fxContext.hub.commit(s);__fxContext.hub.showForge();document.querySelector('.forge-picker').scrollIntoView({block:'center'});})()`);
      const rack=await evaluate(`(()=>{const n=document.querySelector('.forge-picker'),r=n.getBoundingClientRect();return {x:r.left+r.width*.8,y:r.top+r.height/2,endX:r.left+r.width*.2,overflow:n.scrollWidth>n.clientWidth};})()`);
      assert.equal(rack.overflow,true);
      await touch('touchStart',[{x:rack.x,y:rack.y,radiusX:1,radiusY:1,force:1,id:2}]);
      await touch('touchMove',[{x:(rack.x+rack.endX)/2,y:rack.y,radiusX:1,radiusY:1,force:1,id:2}]);
      await touch('touchMove',[{x:rack.endX,y:rack.y,radiusX:1,radiusY:1,force:1,id:2}]);await touch('touchEnd',[]);
      await waitFor("document.querySelector('.forge-picker').scrollLeft>20");await audit();
      scenarios.push({width,height,kind:'rack-native-pan',scrollLeft:await evaluate("document.querySelector('.forge-picker').scrollLeft")});
    }
    for(const outcome of ['success','destroyed']) {
      f=await fixture(6,outcome);await audit();
      assert.ok(await evaluate("document.querySelector('.forge-work.risky') && document.querySelector('.primary.danger') && document.querySelector('.forge-odds').textContent.includes('50%')"));
      await click('[data-action="pick-stone"][data-id="enhance_stone_blessed"]');
      assert.equal(await evaluate("document.querySelector('[data-id=\"enhance_stone_blessed\"]').getAttribute('aria-pressed')"),'true');
      await click('[data-action="pick-stone"][data-id="enhance_stone_1"]');
      const start=Date.now();await click('[data-action="enhance"]');
      assert.equal(await evaluate("document.querySelector('[data-enchant-fx]').dataset.enchantFx"),outcome);
      const committed=await evaluate('JSON.stringify(__arpg.save)');await audit();
      await waitFor("document.querySelector('[data-enchant-fx]')?.dataset.phase==='result'");
      const chargeMs=Date.now()-start;assert.ok(chargeMs>=1100&&chargeMs<2200,chargeMs);
      if(width===390)await capture(outcome);
      const text=await evaluate("document.querySelector('.enchant-result').textContent+' / '+document.querySelector('.enchant-detail').textContent");
      assert.ok(outcome==='success'?text.includes('+7 강화 성공!'):text.includes('장비가 산산조각 났다')&&text.includes('남은 강화석 '+f.expected.refund.enhance_stone_1+'개'));
      await waitFor("!document.querySelector('[data-enchant-fx]')");
      assert.equal(await evaluate('JSON.stringify(__arpg.save)'),committed,'animation cannot change state');
      assert.equal(await evaluate('__fxSounds.at(-1)'),outcome==='destroyed'?'kill':'level-up');
      await cleaned();scenarios.push({width,height,kind:outcome,seed:f.seed,chargeMs,text});
    }
    await fixture(0);assert.equal(await evaluate('!!document.querySelector(".enchant-fx.crack,[data-action=crack-greater]")'),false);scenarios.push({width,height,kind:'removed-greater-no-crack'});
    // E1: actual blessed selection, candidates, preview, committed result and max lock.
    for (const [from,to] of [[5,7],[9,11],[10,11],[11,12],[ENCHANT.max-1,ENCHANT.max]]) {
      const f=await fixture(from,'success','enhance_stone_blessed',to);
      assert.equal(f.expected.to,to);
      await click('[data-action="pick-stone"][data-id="enhance_stone_blessed"]');
      const view=await evaluate(`(()=>{const work=document.querySelector('.forge-work');return {effects:[...work.querySelectorAll('.stone-effect')].map(n=>n.textContent),targets:work.querySelector('.forge-progress strong').textContent,probabilities:work.querySelector('.forge-probabilities').textContent,odds:work.querySelector('.forge-odds')?.textContent||'',unchanged:work.querySelectorAll('[data-delta="0"]').length};})()`);
      assert.equal(view.unchanged,0);assert.ok(view.effects.some(t=>t.includes('+1 / +2')||t.includes('+1')));
      assert.equal(view.targets,f.preview.outcomes.map(n=>'+'+n).join(' / '));
      for(const row of f.preview.probabilities.filter(r=>r.chance>0))assert.ok(view.probabilities.includes((row.to===null?'파괴':'+'+row.to)+' '+Number((row.chance*100).toFixed(3))+'%'));
      await audit();await click('[data-action="enhance"]');
      assert.equal(await evaluate('__arpg.save.items[0].enhance'),to);
      await tapFx();assert.equal(await evaluate("document.querySelector('.enchant-result').textContent"),`+${to}${from>=6?' 강화 성공!':''}`);
      await tapFx();await waitFor("!document.querySelector('[data-enchant-fx]')");await cleaned();
      assert.equal(await evaluate("document.querySelector('[data-action=\"enhance\"]').disabled"),to===ENCHANT.max);
      scenarios.push({width,height,kind:'E1-blessed',from,to,seed:f.seed,view});
    }
  }
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await fixture(6,'destroyed');await click('[data-action="enhance"]');
  await waitFor("document.querySelector('.enchant-fx.reduced')?.dataset.phase==='result'");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.enchant-gear')).animationName"),'none');
  assert.equal(await evaluate("document.querySelectorAll('.enchant-particles').length"),0);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.enchant-shards')).display"),'none');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await waitFor("!document.querySelector('[data-enchant-fx]')");
  await cleaned();await command('Emulation.setEmulatedMedia',{features:[]});
  // Explicit keyboard skip on a blessed ritual; repeat closes it, not another attempt.
  await fixture(6,'success');await click('[data-action="pick-stone"][data-id="enhance_stone_blessed"]');await click('[data-action="enhance"]');
  assert.equal(await evaluate("document.querySelector('.enchant-fx').classList.contains('blessed')"),true);
  assert.equal(await evaluate("document.querySelector('.enchant-fx').style.getPropertyValue('--fx-color')"),'#ffd36f');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await evaluate("document.querySelector('.enchant-fx').dataset.phase"),'result');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await waitFor("!document.querySelector('[data-enchant-fx]')");await cleaned();
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
  const ritualPerformance=[];
  // Measure the actual risky ritual (not merely the separate weapon glow update).
  await command('Emulation.setCPUThrottlingRate',{rate:1});
  await command('Page.navigate',{url});await connect();
  await command('Emulation.setCPUThrottlingRate',{rate:6});
  for(const [width,height] of [[390,844],[1280,900]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    for(const outcome of ['success','destroyed']) {
      await fixture(6,outcome);
      await evaluate("window.__fxFractureSeen=false;window.__fxFracturePaused=false;window.__fxBeatObserver=new MutationObserver(rows=>{if(rows.some(r=>r.target.dataset.beat==='fracture')){__fxFractureSeen=true;__fxFracturePaused=getComputedStyle(document.querySelector('.enchant-fx .ritual-runes')).animationPlayState==='paused';}});__fxBeatObserver.observe(document.querySelector('#meta-screen'),{subtree:true,attributes:true,attributeFilter:['data-beat']});");
      await click('[data-action="enhance"]');
      await waitFor("!document.querySelector('[data-enchant-fx]')");await cleaned();
      assert.equal(await evaluate('__fxBeatObserver.disconnect();__fxFractureSeen'),outcome==='destroyed');
      assert.equal(await evaluate('__fxFracturePaused'),outcome==='destroyed');
      const perf=await evaluate(`(()=>{const s=__fxContext.hub.enchantFx.stats,p95=a=>[...a].sort((a,b)=>a-b)[Math.ceil(a.length*.95)-1];return {width:${width},height:${height},outcome:${JSON.stringify(outcome)},sixXCPU:true,fractureObserved:__fxFractureSeen,fullHitstop:__fxFracturePaused,frames:s.frames,drawP95Ms:p95(s.drawMs),rafP95Ms:p95(s.frameMs),rafMaxMs:Math.max(...s.frameMs),shards:s.shards,particleLimit:s.particleLimit,cleaned:s.cleaned,residualNodes:document.querySelectorAll('.enchant-fx,.enchant-particles').length};})()`);
      assert.ok(perf.frames>30,JSON.stringify(perf));assert.ok(perf.drawP95Ms<16.7,JSON.stringify(perf));
      assert.equal(perf.shards,outcome==='destroyed'?48:0);assert.equal(perf.residualNodes,0);ritualPerformance.push(perf);
    }
  }
  await command('Emulation.setCPUThrottlingRate',{rate:1});
  assert.equal(performanceSample.nodeCountStable,true);assert.ok(performanceSample.p95Ms<1,JSON.stringify(performanceSample));
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));
  const report={ok:true,scenarios,reducedMotion:true,reloadAntiReroll:true,combat,kitPixels,performanceSample,ritualPerformance,consoleErrors:0,screenshots:screenshotCount};
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

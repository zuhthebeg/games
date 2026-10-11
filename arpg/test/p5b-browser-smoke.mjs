// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 19117);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8743);
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
const consoleErrors = [];
const unexpectedLogErrors = [];
const expectedBlockedNetworkErrors = [];
let deliberateMissingAssets = false;

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
    } else {
      events.push(message);
      if (message.method === 'Runtime.exceptionThrown'
        || message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrors.push(message);
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        if (deliberateMissingAssets && message.params.entry.source === 'network'
          && message.params.entry.text.includes('ERR_BLOCKED_BY_CLIENT')) expectedBlockedNetworkErrors.push(message);
        else unexpectedLogErrors.push(message);
      }
    }
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

  const samples=[],liveSwaps=[];
  const configurations=[
    ['iron_sword','head_heavy_common_t1'],['chief_maul',null],
    ['short_bow','head_light_common_t1'],['hunter_bow','head_medium_common_t1'],
    ['apprentice_wand','head_heavy_common_t1'],['altar_staff','head_light_common_t1'],
  ];
  const url=`http://127.0.0.1:${httpPort}/arpg/?dev=1`;
  await command('Network.enable');
  for(let i=0;i<configurations.length;i++) {
    const [width,height]=[[360,640],[390,844],[1280,900]][i%3];
    const [weapon,head]=configurations[i];
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await command('Page.navigate',{url}); await waitFor('window.__arpg');
    await evaluate(`(async()=>{const {createSave,SaveStore,validateSave}=await import('./js/meta/save.js');const {addXp}=await import('./js/meta/progression.js');const {instance,ITEMS}=await import('./js/meta/items.js');
      const s=addXp(createSave({name:'P5 외형 시험',answers:[0,0,0,0,0],createdAt:1}),851);
      for(const id of ${JSON.stringify([weapon,head,'leather_vest','hands_medium_fine_t1','feet_heavy_fine_t1'].filter(Boolean))}) {s.items.push(instance('test:'+id,id));s.equipped[ITEMS[id].slot]='test:'+id;}
      if(${i}===0)s.items.push(instance('test:spare-head','head_medium_common_t1'));
      if(!validateSave(s))throw Error('invalid P5 fixture: '+${JSON.stringify(weapon)});
      new SaveStore(localStorage).save(s);})()`);
    events.length=0;await command('Page.reload');await waitFor(page('inn'));
    await waitFor("document.querySelector('[data-paperdoll-ready]')",20000);await audit();
    const portrait=await evaluate(`(()=>{const n=document.querySelector('[data-paperdoll-ready]'),c=n.querySelector('canvas');const a=c.getContext('2d').getImageData(0,0,128,128).data;
      return {key:n.dataset.paperdollReady,alphaPixels:Array.from(a).filter((v,i)=>i%4===3&&v>0).length,canvasVisible:!c.hidden,bg:n.style.backgroundImage};})()`);
    assert.ok(portrait.alphaPixels>200);assert.equal(portrait.canvasVisible,true);assert.equal(portrait.bg,'none');
    if(i===0) {
      await evaluate("window.__p5HeadAlpha=Array.from(document.querySelector('[data-paperdoll-ready] canvas').getContext('2d').getImageData(0,0,128,128).data).filter((v,i)=>i%4===3)");
      await click('[data-action="socket"][data-slot="head"]');
      await click('[data-action="open-item"][data-uid="test:spare-head"]');
      await click('[data-action="equip"][data-uid="test:spare-head"]');
      await waitFor("document.querySelector('[data-paperdoll-ready]')");
      const changed=await evaluate(`(()=>{const n=document.querySelector('[data-paperdoll-ready]');const alpha=Array.from(n.querySelector('canvas').getContext('2d').getImageData(0,0,128,128).data).filter((v,i)=>i%4===3);return {key:n.dataset.paperdollReady,alphaChanges:alpha.filter((v,i)=>v!==__p5HeadAlpha[i]).length};})()`);
      assert.notEqual(changed.key,portrait.key);assert.ok(changed.alphaChanges>10,'head swap must change silhouette, not just colour');
      await click('[data-action="socket"][data-slot="head"]');
      await click(`[data-action="open-item"][data-uid="test:${head}"]`);
      await click(`[data-action="equip"][data-uid="test:${head}"]`);
      await waitFor(`document.querySelector('[data-paperdoll-ready]')?.dataset.paperdollReady===${JSON.stringify(portrait.key)}`);
      liveSwaps.push({from:head,to:'head_medium_common_t1',...changed,restored:true});
    }
    await click('[data-action="board"]');await click('[data-action="sortie"][data-stage="S1"]');await click('#sortie-confirm');
    await waitFor("__arpg.art.visuals.some(v=>v.mode==='paperdoll'&&v.textureLoaded)",20000);
    const combat=await evaluate("JSON.parse(JSON.stringify(__arpg.art.visuals.find(v=>v.mode==='paperdoll')))");
    assert.equal(combat.equipment.key,portrait.key);assert.equal(combat.tint,0xffffff);
    const before=await evaluate('JSON.stringify(__arpg.save)');await key('KeyD');await key('KeyJ');await sleep(350);await key('KeyD','keyUp');await key('KeyJ','keyUp');
    assert.equal(await evaluate('JSON.stringify(__arpg.save)'),before);
    const network=events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request.url);
    const otherKits=['blade','bow','focus'].filter(k=>k!==combat.equipment.kit);
    assert.ok(!network.some(u=>otherKits.some(k=>u.includes(`/paperdoll/${k}/`))), 'non-equipped kit fetched');
    assert.ok(!network.some(u=>/\/hero-(sword|bow|focus)\/atlas-[0-9]+\.json/.test(u)), 'original hero atlas downloaded on successful B combat');
    samples.push({width,height,weapon,head,portrait,combat,phoneEvidence:false});events.length=0;
  }
  // Actual Pixi rendering contract, synthetic immutable inputs: 48 clips per kit.
  const animations=await evaluate(`(async()=>{
    const {Application}=await import('./vendor/pixi-8.22.0.min.mjs');const {VisualProvider}=await import('./js/render/visual-provider.js');
    const {paperdolls}=await import('./js/render/paperdoll-library.js');
    const app=new Application();await app.init({width:192,height:192,preference:'webgl',backgroundAlpha:0});
    const results=[];
    for(const kit of ['blade','bow','focus']) {
      const provider=new VisualProvider();const entity={id:1,kind:'player',weapon:kit,r:18,facing:0,hp:100,maxHp:100};
      provider.beginRound([entity],__arpg.save);const visual=provider.createVisual(entity);app.stage.addChild(visual.container);visual.container.position.set(96,112);
      const started=performance.now();while(visual.debug.mode!=='paperdoll') {if(performance.now()-started>20000)throw Error('paperdoll load timeout');await new Promise(r=>setTimeout(r,30));}
      const rows=[];
      for(const [index,direction] of ['E','SE','S','SW','W','NW','N','NE'].entries()) for(const state of ['idle','run','attack','dodge','hit','death']) {
        const input=Object.freeze({...entity,facing:index*Math.PI/4,moving:state==='run',dead:state==='death',staggerLeft:state==='hit'?1:0,
          dodge:state==='dodge'?Object.freeze({dashLeft:1,startedTick:1}):null,
          act:state==='attack'?Object.freeze({elapsed:2,def:Object.freeze({windupMs:100,activeMs:100,recoveryMs:200})}):null});
        const before=JSON.stringify(input), anim={age:0,deadAge:0,hurt:state==='hit'?1:0,flash:0,frozen:false,reduced:false};
        visual.update(input,anim,.01);app.render();const pixels=app.renderer.extract.pixels({target:app.stage}).pixels;
        if(JSON.stringify(input)!==before)throw Error('simulation mutated');if(visual.debug.state!==state||visual.debug.direction!==direction)throw Error('wrong clip');
        const alpha=Array.from(pixels).filter((v,i)=>i%4===3&&v>0).length;if(alpha<200)throw Error('empty rendered clip');
        rows.push({state,direction,frame:visual.debug.frame,alpha});
      }
      results.push({kit,clips:rows.length,rows});visual.destroy();provider.atlases.beginRound([]);
    }
    app.destroy(true,{children:true});return {results,cache:paperdolls.status(),phoneEvidence:false};
  })()`);
  assert.ok(animations.results.every(r=>r.clips===48));assert.ok(animations.cache.peakOutputs<=2);
  const tintRegions=await evaluate(`(async()=>{
    const {paperdolls}=await import('./js/render/paperdoll-library.js');const {equipmentVisual}=await import('./js/render/paperdoll-state.js');
    const results=[];
    for(const kit of ['blade','bow','focus']) {
    const original=equipmentVisual(__arpg.save,kit),base={...original,colours:[null,null,null]},name='idle_S_000';
    const pixels=asset=>{const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');const {rect,trim}=asset.manifest.layout.frames[name];ctx.drawImage(asset.canvas,...rect,...trim);return ctx.getImageData(0,0,128,128).data;};
    const lease=await paperdolls.acquire({...base,key:kit+':tint-baseline'});const raw=pixels(lease.asset),m=lease.asset.manifest;
    const layer=m.layers.mask,f=layer.frames[name],rect=layer.rects[f.index];
    const bitmap=await createImageBitmap(await (await fetch('./assets/sprites/paperdoll/'+m.kit+'/'+layer.image)).blob());
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.drawImage(bitmap,...rect,...f.offset,rect[2],rect[3]);bitmap.close();const mask=ctx.getImageData(0,0,128,128).data;lease.release();
    for(let slot=0;slot<3;slot++) {
      const colours=[null,null,null];colours[slot]=[125,205,135];const next=await paperdolls.acquire({...base,colours,key:kit+':tint-slot-'+slot});const rgb=pixels(next.asset);next.release();let changed=0,outside=0;
      for(let p=0;p<rgb.length;p+=4) if(rgb[p+3]&&[0,1,2].some(i=>rgb[p+i]!==raw[p+i])) {changed++;if(mask[p+slot]<=128)outside++;}
      if(changed<4||outside)throw Error('tint escaped material region '+slot+': '+changed+'/'+outside);
      results.push({kit,slot,changedPixels:changed,outsidePixels:outside});
    }
    }
    return results;
  })()`);
  // 6x CPU slowdown is explicitly a desktop approximation, never phone evidence.
  await command('Emulation.setCPUThrottlingRate',{rate:6});
  const performanceSamples=await evaluate(`(async()=>{
    const {paperdolls}=await import('./js/render/paperdoll-library.js');const {equipmentVisual}=await import('./js/render/paperdoll-state.js');
    const d=equipmentVisual(__arpg.save),runs=[];
    for(let i=0;i<10;i++) {const lease=await paperdolls.acquire({...d,key:d.key+':benchmark:'+i});runs.push(lease.asset.metrics);lease.release();}
    return {runs,cache:paperdolls.status(),phoneEvidence:false};
  })()`);
  await command('Emulation.setCPUThrottlingRate',{rate:1});
  const failures=[];
  // Intentional blocked-network diagnostics are expected; JS errors never are.
  deliberateMissingAssets=true;
  // Missing assets must restore the original combat atlas, not freeze the boot.
  await command('Network.setBlockedURLs',{urls:['*assets/sprites/paperdoll/*']});
  await command('Page.navigate',{url});await waitFor(page('inn'));await waitFor("document.querySelector('[data-paperdoll-failed]')",10000);
  await click('[data-action="board"]');await click('[data-action="sortie"][data-stage="S1"]');await click('#sortie-confirm');
  await waitFor("__arpg.art.visuals.some(v=>v.key==='focus'&&v.mode==='atlas'&&v.textureLoaded)",20000);
  failures.push('missing paperdoll => original atlas');
  await command('Network.setBlockedURLs',{urls:[]});events.length=0;deliberateMissingAssets=false;
  await command('Page.navigate',{url:url+'&paperdoll=0'});await waitFor(page('inn'));
  assert.equal(await evaluate("document.querySelectorAll('[data-paperdoll]').length"),0);
  await click('[data-action="board"]');await click('[data-action="sortie"][data-stage="S1"]');await click('#sortie-confirm');
  await waitFor("__arpg.art.visuals.some(v=>v.key==='focus'&&v.mode==='atlas'&&v.textureLoaded)",20000);
  assert.ok(!events.some(e=>e.method==='Network.requestWillBeSent'&&e.params.request.url.includes('/sprites/paperdoll/')));
  failures.push('paperdoll=0 => no B requests, original atlas');
  assert.equal(consoleErrors.length,0,JSON.stringify(consoleErrors));
  assert.equal(unexpectedLogErrors.length,0,JSON.stringify(unexpectedLogErrors));
  const report={ok:true,samples,liveSwaps,animations,tintRegions,performanceSamples,failures,consoleErrors:consoleErrors.length,unexpectedLogErrors:unexpectedLogErrors.length,expectedBlockedNetworkErrors:expectedBlockedNetworkErrors.length,phoneEvidence:false,screenshots:0};
  const values=performanceSamples.runs.map(r=>r.composeMs).sort((a,b)=>a-b);report.composeP95SixX=values[Math.ceil(values.length*.95)-1];
  await writeFile(new URL('../tools/art/p5b/browser-validation.json',import.meta.url),JSON.stringify(report,null,2));
  console.log(JSON.stringify({ok:true,combatCases:samples.length,clips:144,composeP95SixX:report.composeP95SixX,cache:performanceSamples.cache,failures,consoleErrors:consoleErrors.length,unexpectedLogErrors:unexpectedLogErrors.length,phoneEvidence:false,screenshots:0}));
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

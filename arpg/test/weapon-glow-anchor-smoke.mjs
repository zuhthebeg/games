// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 19131);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8757);
const profile = await mkdtemp(join(tmpdir(), 'arpg-glow-anchor-'));
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
  await command('Page.navigate',{url});await connect();
  // In-game: glow pixels must centre on the drawn weapon for every direction and pose.
  const combat = await evaluate(`(async()=>{
    const {Application,RenderTexture}=await import('./vendor/pixi-8.22.0.min.mjs');
    const {VisualProvider}=await import('./js/render/visual-provider.js');const {createSave}=await import('./js/meta/save.js');
    const app=new Application();await app.init({width:256,height:256,preference:'webgl',backgroundAlpha:0,autoStart:false});
    const target=RenderTexture.create({width:256,height:256}),rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms));
    const def={windupMs:150,lockMs:0,activeMs:150,recoveryMs:150};
    const poses=[['idle',{}],['run',{moving:true}],['attack-early',{act:{def,elapsed:2,phase:'windup'}}],['attack-mid',{act:{def,elapsed:7,phase:'active'}}],['attack-late',{act:{def,elapsed:12,phase:'recovery'}}]];
    for(const kit of ['blade','bow','focus'])for(const level of [7,10]) {
      const s=createSave({name:'글로우 정렬',answers:[0,0,0,0,0],createdAt:1});s.items.find(i=>i.uid===s.equipped.weapon).enhance=level;
      const provider=new VisualProvider(),base={kind:'player',weapon:kit,r:18,facing:0,hp:100,maxHp:100,dead:false};
      provider.beginRound([base],s);const v=provider.createVisual(base);
      for(let i=0;i<200&&v.debug.mode!=='paperdoll';i++)await wait(50);
      if(v.debug.mode!=='paperdoll')throw Error('paperdoll did not load for '+kit);
      v.container.position.set(128,170);app.stage.addChild(v.container);
      for(let d=0;d<8;d++)for(const [pose,extra] of poses) {
        const facing=d*Math.PI/4,entity={...base,facing,...extra};
        for(let t=0;t<3;t++)v.update(entity,{age:0,deadAge:0,flash:0,hurt:0,frozen:false,reduced:true},1/60);
        const p=v.weaponPose(),body=v.container.children[0];body.visible=false;
        app.renderer.render({container:app.stage,target,clear:true});const px=app.renderer.extract.pixels({target}).pixels;body.visible=true;
        let minX=1e9,minY=1e9,maxX=-1,maxY=-1,n=0;
        for(let y=0;y<256;y++)for(let x=0;x<256;x++){const a=(y*256+x)*4;if(px[a]+px[a+1]+px[a+2]>30){n++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
        if(p.hidden){rows.push({kit,level,d,pose,hidden:true,glowPixels:n});continue;}
        const gx=(minX+maxX)/2,gy=(minY+maxY)/2,wx=128+p.x,wy=170+p.y;
        const legacy=Math.hypot(128+Math.cos(facing)*15-wx,170-25+Math.sin(facing)*6-wy);
        rows.push({kit,level,d,pose,glowPixels:n,offset:+Math.hypot(gx-wx,gy-wy).toFixed(2),legacyOffset:+legacy.toFixed(1),anchored:v.debug.weaponGlow.anchored});
      }
      v.destroy();
    }
    target.destroy(true);app.destroy(true,{children:true});return rows;
  })()`);
  const shown = combat.filter(r=>!r.hidden);
  assert.ok(shown.length > 200, `too few anchored samples ${shown.length}`);
  assert.ok(shown.every(r=>r.anchored && r.glowPixels > 15 && r.offset <= 3), JSON.stringify(shown.filter(r=>!(r.anchored&&r.glowPixels>15&&r.offset<=3)).slice(0,5)));
  assert.ok(combat.filter(r=>r.hidden).every(r=>r.glowPixels===0), 'hidden weapon frames must draw no glow');

  // Inn portrait: glow canvas centre = weapon frame centre in all 8 directions.
  await command('Page.navigate',{url});await connect();
  await evaluate(`(async()=>{const {createSave}=await import('./js/meta/save.js');const s=createSave({name:'글로우 정렬',answers:[0,0,0,0,0],createdAt:1});
    s.items.find(i=>i.uid===s.equipped.weapon).enhance=8;__fxContext.persistSave(s);__fxContext.hub.showForge();})()`);
  await click('[data-action="inn"]');
  await waitFor("document.querySelector('.p2-hero .portrait-weapon-glow[data-anchored]')",20000);
  const portrait = await evaluate(`(async()=>{
    const {setPortraitDirection,PORTRAIT_DIRECTIONS}=await import('./js/render/paperdoll-portrait.js');
    const node=document.querySelector('.p2-hero'),glow=node.querySelector('.portrait-weapon-glow'),c=glow.querySelector('canvas'),rows=[];
    for(const dir of PORTRAIT_DIRECTIONS){setPortraitDirection(node,dir);
      const px=c.getContext('2d').getImageData(0,0,128,128).data;let minX=1e9,minY=1e9,maxX=-1,maxY=-1,n=0;
      for(let y=0;y<128;y++)for(let x=0;x<128;x++)if(px[(y*128+x)*4+3]>10){n++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
      const cx=parseFloat(glow.style.getPropertyValue('--cx'))*1.28,cy=parseFloat(glow.style.getPropertyValue('--cy'))*1.28;
      const r=glow.getBoundingClientRect(),h=node.getBoundingClientRect();
      rows.push({dir,hidden:glow.hidden,pixels:n,offset:n?+Math.hypot((minX+maxX)/2-cx,(minY+maxY)/2-cy).toFixed(2):null,
        coversPortrait:Math.abs(r.width-h.width)<1&&Math.abs(r.height-h.height)<1,display:getComputedStyle(glow).display});}
    return rows;})()`);
  assert.ok(portrait.filter(r=>!r.hidden).length >= 6, JSON.stringify(portrait));
  assert.ok(portrait.every(r=>r.hidden || (r.pixels>20 && r.offset<=1.5 && r.coversPortrait && r.display!=='none')), JSON.stringify(portrait));
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));
  const worst=Math.max(...shown.map(r=>r.offset)), legacyMean=shown.reduce((s,r)=>s+r.legacyOffset,0)/shown.length;
  console.log(JSON.stringify({ok:true,samples:combat.length,anchored:shown.length,hiddenFrames:combat.length-shown.length,worstOffsetPx:worst,legacyMeanOffsetPx:+legacyMean.toFixed(1),portrait,consoleErrors:0}));
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

// Run with ARPG_HTTP_PORT=8795 ARPG_CDP_PORT=19195; writes metrics and eight PNGs.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const evidence = resolve(process.env.ARPG_BIOME_EVIDENCE || '/home/cocy/.openclaw/workspace/tmp/arpg-biome-evidence');
await mkdir(evidence, {recursive:true});
const port = Number(process.env.ARPG_CDP_PORT || 19107);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8741);
const profile = await mkdtemp(join(tmpdir(), 'arpg-feel-budget-'));
const server = spawn('python3', ['-m', 'http.server', String(httpPort), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const chrome = spawn('/home/cocy/bin/chromium', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
let socket, sequence = 0;
const pending = new Map(), errors = [];
try {
  let targets;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* Booting. */ }
    if (targets?.[0]?.webSocketDebuggerUrl) break;
    await sleep(100);
  }
  assert.ok(targets?.[0]?.webSocketDebuggerUrl);
  assert.equal(server.exitCode, null);
  socket = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise(resolveOpen => { socket.onopen = resolveOpen; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    else if (message.method === 'Runtime.exceptionThrown'
      || message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error'
      || message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message);
  };
  const command = (method, params = {}) => new Promise((resolveCommand, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 240000);
    pending.set(id, message => {
      clearTimeout(timer);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolveCommand(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await command('Runtime.enable');
  await command('Log.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1400, height: 860, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: `http://127.0.0.1:${httpPort}/arpg/test/feel-fixture.html` });
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await evaluate('document.readyState==="complete" && document.title==="ARPG render fixture"')) break;
    await sleep(100);
  }
  await evaluate(`(async()=>{
    const {Application}=await import('../vendor/pixi-8.22.0.min.mjs');
    const {ArenaRenderer}=await import('../js/render/renderer.js');
    const {createWorld,addPlayer,startStage,spawnMonster}=await import('../js/sim/world.js');
    const {contrast,allowedProp}=await import('../js/render/biome-layout.js');
    const {BIOMES,STAGE_BIOMES}=await import('../js/content/biomes.js');
    const {ABILITIES}=await import('../js/content/combat.js');
    const {DANGER_COLORS}=await import('../js/content/monsters.js');
    const {encodeSnapshot,decodeSnapshot}=await import('../js/net/protocol.js');
    const app=new Application();
    await app.init({width:1400,height:860,resolution:1,preference:'webgl',antialias:false,autoStart:false});
    document.body.appendChild(app.canvas);
    const world=createWorld({seed:11});addPlayer(world,{pid:'host'});addPlayer(world,{pid:'guest'});
    const renderer=new ArenaRenderer(app);
    await renderer.provider.atlases.load('blade');
    window.fixture={app,world,renderer,startStage,spawnMonster,ABILITIES,contrast,allowedProp,BIOMES,STAGE_BIOMES,DANGER_COLORS,encodeSnapshot,decodeSnapshot};
  })()`);
  const maps = [];
  const seen = new Set();
  for (let n=1;n<=20;n++) {
    const result=await evaluate(`(()=>{
      const {app,world,renderer,startStage,contrast,allowedProp,STAGE_BIOMES,DANGER_COLORS,ABILITIES,encodeSnapshot,decodeSnapshot}=fixture;
      const stageId='S${n}';startStage(world,stageId);
      const before=JSON.stringify(world), old=renderer.biomeMap?.texture;
      renderer.reset(world);
      if(old && !old.destroyed)throw Error('old texture retained');
      if(before!==JSON.stringify(world))throw Error('reset mutated sim');
      const map=renderer.biomeMap;
      const pixels=app.renderer.extract.pixels(map.sprite).pixels;
      let minContrast=Infinity,minPreparation=Infinity;const sum=[0,0,0];let count=0;
      for(let y=30;y<830;y+=3)for(let x=30;x<1370;x+=3){
        const i=(y*1400+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2],c=(r<<16)|(g<<8)|b;
        sum[0]+=r;sum[1]+=g;sum[2]+=b;count++;
        minContrast=Math.min(minContrast,contrast(c,DANGER_COLORS.active));
        minPreparation=Math.min(minPreparation,contrast(c,DANGER_COLORS.preparation));
      }
      if(minContrast<3 || minPreparation<3)throw Error('pixel danger contrast: '+minContrast+'/'+minPreparation);
      const violations=map.layout.props.filter(p=>!allowedProp(p,map.layout.zones,1400,860)).length;
      if(violations)throw Error('prop exclusion violation');
      const hostLayout=JSON.stringify(map.layout);
      renderer.reset(decodeSnapshot(encodeSnapshot(world),'guest'));
      if(hostLayout!==JSON.stringify(renderer.biomeMap.layout))throw Error('guest layout differs');
      // Render actual danger/poison/projectile shapes over the baked map for representative evidence.
      world.telegraphs=[{ox:730,oy:420,facing:0,phase:'active',progress:1,major:true,shape:{type:'circle',radius:64}},
        {ox:890,oy:520,facing:0,phase:'windup',progress:.65,shape:{type:'circle',radius:52}},
        {ox:825,oy:295,facing:0,phase:'active',progress:1,major:true,shape:ABILITIES.spider_puddle.shape}];
      world.projectiles=[{id:101,abilityId:'arrow',x:600,y:380,r:6,vx:200,vy:0},
        {id:102,abilityId:'fireball',x:620,y:340,r:8,vx:200,vy:0}];
      renderer.reset(world);
      renderer.render(world,1,1/60);renderer.warning.visible=false;renderer.root.scale.set(1);renderer.root.position.set(0,0);app.render();
      return {stageId,id:STAGE_BIOMES[stageId],seed:map.layout.seed,props:map.layout.props.length,
        kinds:[...new Set(map.layout.props.map(p=>p.kind))].length,violations,minContrast,minPreparation,
        meanRGB:sum.map(v=>v/count),textureBytes:map.bytes,guestEqual:true,readOnly:true};
    })()`);
    maps.push(result);
    if (!seen.has(result.id)) {
      seen.add(result.id);
      const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile(join(evidence,`${result.id}.png`),Buffer.from(shot.data,'base64'));
    }
  }
  const representatives=maps.filter((m,i)=>maps.findIndex(v=>v.id===m.id)===i);
  const distances=[];
  for(let i=0;i<representatives.length;i++)for(let j=i+1;j<representatives.length;j++){
    const a=representatives[i],b=representatives[j];
    distances.push({a:a.id,b:b.id,rgbDistance:Math.hypot(...a.meanRGB.map((v,k)=>v-b.meanRGB[k]))});
  }
  assert.ok(Math.min(...distances.map(d=>d.rgbDistance))>=8,'mean floor colors insufficiently distinct');
  await evaluate(`(async()=>{
    const {world,renderer,spawnMonster,ABILITIES}=fixture;
    world.entities[0].x=700;
    for(const [i,type]of ['goblin_grunt','goblin_slinger','goblin_chief'].entries()){
      const enemy=spawnMonster(world,type,660+i*60,410+i*28);enemy.spawnLeft=0;
    }
    await Promise.all(['goblin_grunt','goblin_slinger','goblin_chief'].map(k=>renderer.provider.atlases.load(k)));
    fixture.combatTelegraphs=[{ox:730,oy:420,facing:0,phase:'windup',progress:.6,shape:ABILITIES.goblin_slash.shape},
      {ox:850,oy:400,facing:0,phase:'active',progress:1,major:true,shape:ABILITIES.spider_puddle.shape}];
    fixture.combatProjectiles=Array.from({length:6},(_,i)=>({id:200+i,abilityId:i%2?'arrow':'focus_pulse',x:620+i*32,y:470,r:7,vx:560,vy:0}));
  })()`);
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command('Emulation.setCPUThrottlingRate',{rate:6});
  const runs=[];
  // Alternating A/B order, same fixture, old checker path verbatim, CPU throttled 6x.
  // Fixed simulation: measure frame presentation, not stochastic combat/spawn differences.
  for(const rep of representatives.filter(rep=>!process.env.ARPG_BIOME_PERF_IDS || process.env.ARPG_BIOME_PERF_IDS.split(',').includes(rep.id))) {
    for(const legacy of [true,false,false,true]) {
      const run=await evaluate(`(async()=>{
        const {app,world,renderer,startStage}=fixture;
        app.renderer.resize(390,844);
        history.replaceState(null,'','?biome=${legacy ? '0' : '1'}');
        startStage(world,${JSON.stringify(rep.stageId)});
        world.telegraphs=fixture.combatTelegraphs;world.projectiles=fixture.combatProjectiles;renderer.reset(world);
        await renderer.provider.atlases.load('blade');
        const texture=renderer.biomeMap?.texture;
        const samples=[];
        for(let frame=0;frame<240;frame++){
          await new Promise(requestAnimationFrame);
          const start=performance.now();
          renderer.render(world,1,1/60);app.render();app.renderer.gl.finish();
          const elapsed=performance.now()-start;
          if(frame>=40)samples.push(elapsed);
        }
        if(texture && renderer.biomeMap.texture!==texture)throw Error('per-frame texture rebuild');
        samples.sort((a,b)=>a-b);
        return {stageId:${JSON.stringify(rep.stageId)},legacy:${legacy},frames:samples.length,
          meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p95Ms:samples[Math.floor(samples.length*.95)],samples};
      })()`);
      runs.push(run);
    }
  }
  const budgets=representatives.filter(rep=>runs.some(r=>r.stageId===rep.stageId)).map(rep=>{
    const stats=legacy=>{
      const samples=runs.filter(r=>r.stageId===rep.stageId && r.legacy===legacy).flatMap(r=>r.samples).sort((a,b)=>a-b);
      return {frames:samples.length,p95Ms:samples[Math.floor(samples.length*.95)],meanMs:samples.reduce((a,b)=>a+b,0)/samples.length};
    };
    const baseline=stats(true),current=stats(false);
    return {id:rep.id,stageId:rep.stageId,baseline,current,p95IncreaseMs:current.p95Ms-baseline.p95Ms};
  });
  const summary={maps,distances,minRGBDistance:Math.min(...distances.map(d=>d.rgbDistance)),
    backend:'software WebGL gl.finish; 390x844 @1x; CDP CPU 6x; paced rAF; 2 heroes + 3 monsters + 6 projectiles + melee/puddle telegraphs',budgets,
    consoleErrors:errors.length,externalAssetDownloadBytes:0,peakTextureBytes:Math.max(...maps.map(m=>m.textureBytes)),
    screenshots:[...seen].map(id=>`${id}.png`),
    rawRuns:runs};
  await writeFile(join(evidence,'metrics.json'),JSON.stringify(summary,null,2));
  assert.equal(errors.length,0,JSON.stringify(errors));
  for(const b of budgets)assert.ok(b.p95IncreaseMs<=.5,JSON.stringify(b));
  console.log(JSON.stringify({ok:true,...summary}));
} finally {
  socket?.close();
  await Promise.all([chrome,server].map(async child=>{
    if(child.exitCode!==null)return;
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolveExit=>child.once('exit',resolveExit)),sleep(2500)]);
    if(child.exitCode===null && child.signalCode===null)child.kill('SIGKILL');
  }));
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:150});
}

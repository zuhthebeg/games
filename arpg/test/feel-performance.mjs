// Paired mobile-viewport render budget probe, no screenshots. Materialize baseline first:
// mkdir -p .local-baseline; git archive origin/main arpg | tar -x -C .local-baseline
// ARPG_HTTP_PORT=8751 ARPG_CDP_PORT=19117 node arpg/test/feel-performance.mjs
// Software WebGL is a regression probe, NOT a physical-phone 60fps certification.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
await access(join(root, '.local-baseline/arpg/js/render/renderer.js'));
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 120000);
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
  const runs = [];
  // Alternate order to reduce warm-up/order bias; independent documents and atlas caches.
  for (const base of ['/.local-baseline/arpg', '/arpg', '/arpg', '/.local-baseline/arpg']) {
    await command('Page.navigate', { url: `http://127.0.0.1:${httpPort}/arpg/test/feel-fixture.html` });
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await evaluate('document.readyState==="complete" && document.title==="ARPG render fixture"')) break;
      await sleep(100);
    }
    const result = await evaluate(`(async () => {
      const base=${JSON.stringify(base)};
      const {Application}=await import(base+'/vendor/pixi-8.22.0.min.mjs');
      const {ArenaRenderer}=await import(base+'/js/render/renderer.js');
      const {createWorld,addPlayer,spawnMonster,startStage}=await import(base+'/js/sim/world.js');
      const {ABILITIES}=await import(base+'/js/content/combat.js');
      const app=new Application();
      await app.init({width:390,height:844,resolution:1,preference:'webgl',antialias:false,autoStart:false,background:0x0b1010});
      document.body.appendChild(app.canvas);
      const world=createWorld({seed:11});
      const player=addPlayer(world,{pid:'local',x:700,y:430});
      startStage(world,'S4');
      const enemies=['goblin_grunt','goblin_slinger','goblin_chief'].map((type,index)=>spawnMonster(world,type,650+index*60,410+index*28));
      for(const enemy of enemies)enemy.spawnLeft=0;
      player.act={def:ABILITIES.slash,id:'slash',phase:'active',elapsed:5,facing:0};
      enemies[0].act={def:ABILITIES.goblin_slash,id:'goblin_slash',phase:'windup',elapsed:4,phaseElapsed:4,facing:0,ox:650,oy:410};
      for(let index=0;index<6;index++)world.projectiles.push({id:100+index,abilityId:index%2?'arrow':'focus_pulse',x:600+index*32,y:480,r:7,vx:560,vy:0});
      const renderer=new ArenaRenderer(app);
      renderer.reset(world);
      await Promise.all(['blade','goblin_grunt','goblin_slinger','goblin_chief'].map(key=>renderer.provider.atlases.load(key)));
      await new Promise(resolve=>setTimeout(resolve,100));
      let checks=null;
      if(base==='/arpg'){
        renderer.render(world,1,1/60);
        const target=renderer.views.get(enemies[0].id), attacker=renderer.views.get(player.id);
        const tint=target.visual.container.children[0].children[0].tint;
        const frame=attacker.visual.debug.frame;
        const hit={type:'hit',src:player.id,dst:enemies[0].id,dmg:14,x:enemies[0].x,y:enemies[0].y};
        renderer.events(world,[hit]);
        renderer.render(world,1,1/60);
        world.tick++;
        player.act.elapsed+=3;
        const before=JSON.stringify(world);
        renderer.render(world,1,1/60);
        if(attacker.visual.debug.frame!==frame || !attacker.anim.frozen || !target.anim.frozen)throw Error('atlas hit-stop did not freeze both clips');
        if(target.visual.container.children[0].children[0].tint!==tint)throw Error('hit changed base tint');
        if(!target.visual.container.children[0].children[1].visible)throw Error('additive flash missing');
        if(before!==JSON.stringify(world))throw Error('hit-stop changed simulation');
        renderer.reset(world,true);
        await Promise.resolve();
        renderer.events(world,[hit,{type:'perfectDodge',id:player.id}]);
        renderer.render(world,1,1/60);
        if(renderer.trauma || renderer.slowLeft || renderer.views.get(enemies[0].id).anim.flash)throw Error('reduced effects ignored');
        checks={atlasFreeze:true,baseTintUnchanged:true,additiveFlash:true,readOnly:true,reduced:true};
        renderer.reset(world,false);
        await Promise.resolve();
      }
      const samples=[];
      let before;
      for(let frame=0;frame<420;frame++){
        // Mutate only the owned fixture before presentation; renderer must not write any state.
        world.tick=frame>>1;
        player.x=700+Math.sin(frame*.02)*15;
        player.act.elapsed=frame%12;
        enemies[0].act.elapsed=frame%20;
        enemies[0].act.phaseElapsed=frame%16;
        for(const projectile of world.projectiles)projectile.x=600+((frame*8+projectile.id*32)%250);
        if(frame===120)before=JSON.stringify(world);
        const start=performance.now();
        if(frame%2===0){
          renderer.snapshot(world);
          const hit=frame%24===0?enemies.map(enemy=>({type:'hit',src:player.id,dst:enemy.id,dmg:14,x:enemy.x,y:enemy.y,exposed:false})):[];
          renderer.events(world,hit);
        }
        renderer.render(world,.5,1/60);
        app.render();
        app.renderer.gl.finish(); // Include completion, not merely CPU command submission.
        const elapsed=performance.now()-start;
        if(frame===120 && before!==JSON.stringify(world))throw Error('renderer changed fixture');
        if(frame>=120)samples.push(elapsed);
      }
      const sorted=[...samples].sort((a,b)=>a-b);
      const gpuInfo=app.renderer.gl.getExtension('WEBGL_debug_renderer_info');
      const gpu=gpuInfo?app.renderer.gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL):'unavailable';
      const stats={base,checks,frames:samples.length,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,
        p95Ms:sorted[Math.floor(sorted.length*.95)],overBudget:samples.filter(value=>value>1000/60).length,
        gpu,
        pools:{particles:renderer.particles?.length||0,numbers:renderer.numbers.length,effects:renderer.effects.length},
        atlasModes:[...renderer.views.values()].map(view=>view.visual.debug.mode)};
      app.destroy({removeView:true},{children:true});
      return stats;
    })()`);
    runs.push(result);
  }
  const summary = name => {
    const selected = runs.filter(run => run.base === name);
    return { frames: selected.reduce((n, run) => n + run.frames, 0),
      meanMs: selected.reduce((n, run) => n + run.meanMs, 0) / selected.length,
      p95Ms: Math.max(...selected.map(run => run.p95Ms)),
      overBudget: selected.reduce((n, run) => n + run.overBudget, 0) };
  };
  const baseline = summary('/.local-baseline/arpg'), current = summary('/arpg');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.ok(current.overBudget <= baseline.overBudget, JSON.stringify({ baseline, current }));
  // Report exact paired counts without claiming physical-phone certification.
  console.log(JSON.stringify({ ok: true, viewport: '390x844 @1x', backend: 'software WebGL, gl.finish',
    fixture: 'hero + 3 atlas monsters + 6 projectiles + 3 hits/400ms', baseline, current,
    budgetRegression: current.overBudget > baseline.overBudget, runs, consoleErrors: errors.length }));
} finally {
  socket?.close();
  await Promise.all([chrome, server].map(async child => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolveExit => child.once('exit', resolveExit)), sleep(2500)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }));
  await rm(profile, { recursive: true, force: true });
}

// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 9368);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8798);
const width = Number(process.env.ARPG_WIDTH || 390), height = Number(process.env.ARPG_HEIGHT || 844);
const mobile = width < 600;
const profile = await mkdtemp(join(tmpdir(), 'arpg-vfx-'));
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
    }, method === 'Runtime.evaluate' ? 120000 : 15000);
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
  await command('Runtime.enable'); await command('Log.enable');
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await command('Page.navigate', { url: `http://127.0.0.1:${httpPort}/arpg/test/feel-fixture.html` });
  await waitFor('document.readyState==="complete" && document.title==="ARPG render fixture"');
  const result = await evaluate(`(async () => {
    const { Application } = await import('../vendor/pixi-8.22.0.min.mjs');
    const { ArenaRenderer } = await import('../js/render/renderer.js');
    const { VisualProvider } = await import('../js/render/visual-provider.js');
    const { SKILL_VFX, VFX_CAPS } = await import('../js/render/skill-vfx.js');
    const { ABILITIES } = await import('../js/content/combat.js');
    const { FEEL, impactTier } = await import('../js/render/feel.js');
    const { createWorld, addPlayer, startStage, step, spawnMonster, emptyInput } = await import('../js/sim/world.js');
    const { encodeSnapshot, decodeSnapshot } = await import('../js/net/protocol.js');
    const check = (ok, why) => { if (!ok) throw Error(why); };
    const app = new Application();
    await app.init({ width: ${width}, height: ${height}, preference: 'webgl', antialias: false, autoStart: false });
    document.body.appendChild(app.canvas);
    const world = createWorld({ seed: 11 });
    for (let i = 0; i < 4; i++) addPlayer(world, { pid: 'p'+i, x: 700+i*20, y: 430 });
    startStage(world, 'S2'); step(world, {});
    const renderer = new ArenaRenderer(app, new VisualProvider({ atlases: false }));
    renderer.reset(world);
    const checks = [], timings = [], renderCpu = [];
    for (const reduced of [false, true]) for (const ability of Object.keys(SKILL_VFX)) {
      renderer.reset(world, reduced);
      world.tick = 100;
      for (const p of world.entities.filter(p => p.kind === 'player')) p.act = {
        id: ability, def: ABILITIES[ability], phase: 'windup', elapsed: 8, total: 18, facing: 0 };
      renderer.render(world, 1, .016); app.render();
      check(renderer.skillVfx.actors.filter(p => p.node.visible).length === 4, ability+' windup');
      const profile = SKILL_VFX[ability];
      if (ability !== 'heavy_cleave') check(renderer.skillVfx.actors[0].motes.filter(n => n.visible).length === (reduced?2:8), 'reduced charge');
      for (const p of world.entities.filter(p => p.kind === 'player')) { p.act.phase = 'active'; p.act.elapsed = 18; }
      world.tick = 110;
      const projectile = ABILITIES[ability].projectile;
      world.projectiles = projectile ? Array.from({length:projectile.count},(_,i)=>{
        const a=projectile.count>1?(i/(projectile.count-1)-.5)*projectile.spreadDeg*Math.PI/180:0;
        return {id:999+i,abilityId:ability,x:760,y:430,r:projectile.radius,vx:Math.cos(a)*projectile.speed,vy:Math.sin(a)*projectile.speed};
      }) : [];
      const events = world.entities.filter(p => p.kind === 'player').flatMap(p => profile.style === 'cleave' || profile.style === 'ring' || profile.style === 'dash' || profile.projectile ?
        [{ type: 'hit', src: p.id, dst: world.entities[4].id, ability, x: 760, y: 430, dmg: 96 }] :
        profile.style === 'ember' ? [{ type: 'explode', ability, x: 760, y: 430, radius: profile.radius }] :
        [{ type: 'healCast', id: p.id, ability, x: p.x, y: p.y, radius: profile.radius },
        { type: 'heal', src: p.id, dst: p.id, ability, x: p.x, y: p.y, heal: 10 }]);
      renderer.events(world, events); renderer.render(world, 1, .016); app.render();
      check(profile.style === 'dash' ? renderer.skillVfx.actors.every(p => p.id===null || p.node.visible) :
        renderer.skillVfx.effects.some(p => p.left > 0), ability+' activation');
      if (projectile) {
        check(renderer.skillVfx.projectiles.filter(p=>p.id!==null).length===projectile.count,'projectile count');
        check(renderer.projectiles.size===0,'no duplicate legacy projectile');
      }
      check(renderer.skillVfx.particles.some(p => p.left > 0), ability+' impact');
      if (ability === 'healing_light') check(renderer.numbers.some(p => p.node.text === '+10'), 'green heal number');
      const count = renderer.skillVfx.effects.filter(p => p.left > 0).length;
      renderer.render(decodeSnapshot(encodeSnapshot(world), 'p0'), 1, .016); app.render();
      check(renderer.skillVfx.effects.filter(p => p.left > 0).length === count, 'guest replay');
      check(renderer.root.getChildIndex(renderer.layers.skillFx) < renderer.root.getChildIndex(renderer.layers.telegraphs), 'danger priority');
      if (profile.style === 'cleave') {
        const arc = renderer.skillVfx.effects.find(p => p.kind === 'wave').node.context.instructions[0].data.path.instructions.find(p => p.action === 'arc');
        check(arc.data[2] === 168.75, 'cleave exact expanded boundary');
      }
      if (profile.style === 'dash') {
        const actor=world.entities.find(p=>p.kind==='player'),slot=renderer.skillVfx.actors[0];
        const arc=slot.node.context.instructions[0].data.path.instructions.find(p=>p.action==='arc');
        check(arc.data[2]===actor.r+ABILITIES.lunge.dash.bodyPad,'exact current dash body boundary');
        check(slot.node.position.x===actor.x && slot.node.position.y===actor.y,'dash follows caster');
      } else if (profile.style !== 'cleave') check(renderer.skillVfx.effects.find(p => p.left > 0).radius ===
        (profile.radius ?? projectile.radius), 'exact radius');
      for (const p of world.entities.filter(p=>p.kind==='player')) p.act=null;
      for (let frame = 0; frame < 60; frame++) {
        const t = performance.now(); renderer.render(world, 1, 1/60); renderCpu.push(performance.now()-t);
        app.render(); app.renderer.gl.finish(); timings.push(performance.now()-t);
      }
      check(renderer.skillVfx.effects.every(p => !p.node.visible && !p.wave.visible), 'effect lifetime');
      check(renderer.skillVfx.particles.every(p => !p.node.visible), 'particle lifetime');
      checks.push({ ability, reduced, windup: true, active: true, impact: true, lifetime: true, guestReplay: false });
      world.projectiles = [];
    }
    // Drive the new profiles with accepted sim casts, not only synthetic render states.
    const nativeCasts=[];
    for (const ability of ['lunge','volley','pierce_shot','frost_lance']) for (const reduced of [false,true]) {
      const native=createWorld({seed:19}),def=ABILITIES[ability];
      const caster=addPlayer(native,{pid:'native',weapon:def.family,x:400,y:430,mods:{skills:[ability],maxMp:200}});
      startStage(native,'S2');native.round.pending=[];
      const targets=ability==='volley'?Array.from({length:def.projectile.count},(_,i)=>{
        const angle=(i/(def.projectile.count-1)-.5)*def.projectile.spreadDeg*Math.PI/180;
        return {x:400+Math.cos(angle)*180,y:430+Math.sin(angle)*180};
      }):[{x:520,y:430},{x:610,y:430}];
      for (const {x,y} of targets) { const m=spawnMonster(native,'goblin_grunt',x,y);m.thinkLeft=99999;m.spawnLeft=0;m.hp=m.maxHp=10000; }
      renderer.reset(native,reduced);
      let hits=0,charged=false,active=false,projectilePeak=0;const hitTargets=new Set();
      for (let tick=0;tick<60;tick++) {
        renderer.snapshot(native);
        const journal=step(native,{native:{...emptyInput(),skillEdge:tick===0,aimX:1,aimY:0}});
        hits+=journal.filter(e=>e.type==='hit'&&e.ability===ability).length;
        for(const e of journal) if(e.type==='hit'&&e.ability===ability) hitTargets.add(e.dst);
        const before=JSON.stringify(native);
        renderer.events(native,journal);renderer.render(native,1,1/30);app.render();
        check(JSON.stringify(native)===before,'native sim state remains read-only');
        charged ||= renderer.skillVfx.actors.some(p=>p.node.visible)&&caster.act?.phase==='windup';
        active ||= ability==='lunge' ? caster.act?.phase==='active'&&renderer.skillVfx.actors.some(p=>p.node.visible) :
          renderer.skillVfx.effects.some(p=>p.left>0);
        projectilePeak=Math.max(projectilePeak,renderer.skillVfx.projectiles.filter(p=>p.id!==null).length);
      }
      check(charged&&active&&hitTargets.size>=2,ability+' actual cast/2 distinct target hits: '+JSON.stringify({charged,active,hits,targets:hitTargets.size}));
      check(renderer.skillVfx.effects.every(p=>!p.node.visible&&!p.wave.visible)&&renderer.skillVfx.particles.every(p=>!p.node.visible),ability+' native cleanup');
      check(renderer.skillVfx.projectiles.every(p=>p.id===null),ability+' native projectile expiry');
      nativeCasts.push({ability,reduced,hits,distinctTargets:hitTargets.size,charged,active,projectilePeak});
    }
    renderer.reset(world);
    // R1 multi-enemy impact in real WebGL, including reduced motion and danger layering.
    const enemies = [world.entities.find(e => e.kind === 'monster'), spawnMonster(world, 'goblin_grunt', 800, 430)];
    const caster = world.entities.find(e => e.kind === 'player'), areaChecks = [];
    enemies[0].act = { id:'goblin_slash', def:ABILITIES.goblin_slash, phase:'lock', elapsed:8, total:20, facing:0 };
    for (const ability of ['whirl','heavy_cleave','blast_arrow','flame_ring']) for (const reduced of [false,true]) {
      renderer.reset(world,reduced);
      const hits = enemies.map(e => ({ type:'hit', ability, src:caster.id, dst:e.id, x:e.x, y:e.y, dmg:ABILITIES[ability].damage }));
      renderer.events(world,hits);
      for (const e of [caster,...enemies]) check(renderer.views.get(e.id).stopLeft === (reduced ? 0 : impactTier(hits[0]).stop+FEEL.area.stop),'multi-hit +1 frame');
      check(renderer.trauma === (reduced ? 0 : 2*(impactTier(hits[0]).trauma+FEEL.area.trauma)), 'multi-hit shake/reduced zero');
      renderer.render(world,1,1/60);app.render();
      check(renderer.telegraphViews.some(g=>g.visible),'enemy danger remains visible');
      check(renderer.root.getChildIndex(renderer.layers.skillFx)<renderer.root.getChildIndex(renderer.layers.telegraphs),'area danger priority');
      areaChecks.push({ability,reduced,stopBonus:reduced?0:FEEL.area.stop,shakeZero:reduced});
    }
    // Saturate the fixed pools without allocation growth.
    renderer.reset(world);
    for (let i = 0; i < 100; i++) renderer.events(world, [
      { type: 'explode', ability: 'ember_bolt', x: 760, y: 430, radius: 78 },
      { type: 'healCast', ability: 'healing_light', x: 700, y: 430, radius: 160 },
      { type: 'heal', ability: 'healing_light', x: 700, y: 430, heal: 1 },
      { type: 'hit', ability: 'heavy_cleave', x: 760, y: 430, dmg: 96 }]);
    renderer.render(world, 1, .016); app.render(); app.renderer.gl.finish();
    check(renderer.skillVfx.effects.length === VFX_CAPS.effects && renderer.skillVfx.particles.length === VFX_CAPS.particles, 'pool growth');
    const stressTimings = [], players = world.entities.filter(p => p.kind === 'player');
    let peakEffects = 0, peakParticles = 0, peakProjectiles = 0;
    const initialChildren=renderer.layers.skillFx.children.length, stressCpu=[];
    const startPositions=players.map(p=>({x:p.x,y:p.y}));
    renderer.reset(world);
    for (let frame = 0; frame < Object.keys(SKILL_VFX).length*60; frame++) {
      const t = performance.now(), ability = Object.keys(SKILL_VFX)[Math.floor(frame/60)%Object.keys(SKILL_VFX).length], profile = SKILL_VFX[ability];
      world.tick = 1000 + frame;
      for (const [i,p] of players.entries()) {
        const distance=profile.style==='dash'?profile.dash.distance*Math.max(0,Math.min(1,(frame%60-18)/10)):0;
        p.x=startPositions[i].x+Math.cos(.2)*distance;p.y=startPositions[i].y+Math.sin(.2)*distance;
        p.act = { id: ability, def: ABILITIES[ability], phase: frame%60<18 ? 'windup' : frame%60<30?'active':'recovery',
          elapsed: frame%60, total: 18, facing: .2 };
      }
      const pr=ABILITIES[ability].projectile;
      world.projectiles = pr ? players.flatMap((p,i)=>Array.from({length:pr.count},(_,j)=>{
        const a=.2+(pr.count>1?(j/(pr.count-1)-.5)*pr.spreadDeg*Math.PI/180:0);
        return {id:900+Math.floor(frame/60)*100+i*pr.count+j,abilityId:ability,r:pr.radius,
          x:p.x+Math.cos(a)*(frame%60)*pr.speed/60,y:p.y+Math.sin(a)*(frame%60)*pr.speed/60,
          vx:Math.cos(a)*pr.speed,vy:Math.sin(a)*pr.speed};
      })) : [];
      if (frame%12 === 0) for (const p of players) renderer.events(world, profile.style === 'heal' ? [
        { type:'healCast', ability, x:p.x, y:p.y, radius:profile.radius },
        { type:'heal', ability, x:p.x, y:p.y, heal:1 }] : profile.style === 'ember' ? [
        { type:'explode', ability, x:p.x+45, y:p.y, radius:profile.radius }] : [
        { type:'hit', ability, src:p.id, dst:enemies[0].id, x:p.x+45, y:p.y, dmg:ABILITIES[ability].damage }]);
      renderer.render(world,1,1/60); stressCpu.push(performance.now()-t); app.render(); app.renderer.gl.finish();
      stressTimings.push(performance.now()-t);
      peakEffects = Math.max(peakEffects, renderer.skillVfx.effects.filter(p=>p.left>0).length);
      peakParticles = Math.max(peakParticles, renderer.skillVfx.particles.filter(p=>p.left>0).length);
      peakProjectiles = Math.max(peakProjectiles, renderer.skillVfx.projectiles.filter(p=>p.id!==null).length);
    }
    check(peakEffects<=VFX_CAPS.effects && peakParticles<=VFX_CAPS.particles,'stress cap');
    check(peakProjectiles<=VFX_CAPS.projectiles && renderer.layers.skillFx.children.length===initialChildren,'fixed projectile/graphics allocation');
    const stats = values => { const sorted=values.slice().sort((a,b)=>a-b); return {
      frames:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,p95Ms:sorted[Math.floor(sorted.length*.95)],
      over16ms:values.filter(t=>t>1000/60).length }; };
    app.destroy({ removeView: true }, { children: true });
    return { checks, nativeCasts, areaChecks, fourPlayers: true, saturatedPools: VFX_CAPS, softwareWebGL: stats(timings),renderCpu:stats(renderCpu),
      continuousFourPlayerStress:{...stats(stressTimings),renderCpu:stats(stressCpu),peakEffects,peakParticles,peakProjectiles,
        fixedGraphics:initialChildren,casts:'4 players, rotating all 10 profiles; impact every 200ms; 20 volley arrows/4 other projectiles'} };
  })()`);
  const errors = events.filter(e => e.method === 'Runtime.exceptionThrown'
    || e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'
    || e.method === 'Log.entryAdded' && e.params.entry.level === 'error');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(JSON.stringify({ ok: true, viewport:{width,height,mobile}, ...result, consoleErrors: 0 }, null, 2));
} finally {
  socket?.close();
  await Promise.all([chrome, server].map(async child => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolveExit => child.once('exit', resolveExit)), sleep(2500)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

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
  await command('Runtime.enable'); await command('Log.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command('Page.navigate', { url: `http://127.0.0.1:${httpPort}/arpg/test/feel-fixture.html` });
  await waitFor('document.readyState==="complete" && document.title==="ARPG render fixture"');
  const result = await evaluate(`(async () => {
    const { Application } = await import('../vendor/pixi-8.22.0.min.mjs');
    const { ArenaRenderer } = await import('../js/render/renderer.js');
    const { VisualProvider } = await import('../js/render/visual-provider.js');
    const { SKILL_VFX, VFX_CAPS } = await import('../js/render/skill-vfx.js');
    const { ABILITIES } = await import('../js/content/combat.js');
    const { createWorld, addPlayer, startStage, step } = await import('../js/sim/world.js');
    const { encodeSnapshot, decodeSnapshot } = await import('../js/net/protocol.js');
    const check = (ok, why) => { if (!ok) throw Error(why); };
    const app = new Application();
    await app.init({ width: 390, height: 844, preference: 'webgl', antialias: false, autoStart: false });
    document.body.appendChild(app.canvas);
    const world = createWorld({ seed: 11 });
    for (let i = 0; i < 4; i++) addPlayer(world, { pid: 'p'+i, x: 700+i*20, y: 430 });
    startStage(world, 'S2'); step(world, {});
    const renderer = new ArenaRenderer(app, new VisualProvider({ atlases: false }));
    renderer.reset(world);
    const checks = [], timings = [];
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
      world.projectiles = ability === 'ember_bolt' ? [{ id: 999, abilityId: ability, x: 760, y: 430, r: 12, vx: 520, vy: 0 }] : [];
      const events = world.entities.filter(p => p.kind === 'player').flatMap(p => ability === 'heavy_cleave' ?
        [{ type: 'hit', src: p.id, dst: world.entities[4].id, ability, x: 760, y: 430, dmg: 96 }] :
        ability === 'ember_bolt' ? [{ type: 'explode', ability, x: 760, y: 430, radius: profile.radius }] :
        [{ type: 'healCast', id: p.id, ability, x: p.x, y: p.y, radius: profile.radius },
        { type: 'heal', src: p.id, dst: p.id, ability, x: p.x, y: p.y, heal: 10 }]);
      renderer.events(world, events); renderer.render(world, 1, .016); app.render();
      check(renderer.skillVfx.effects.some(p => p.left > 0), ability+' activation');
      check(renderer.skillVfx.particles.some(p => p.left > 0), ability+' impact');
      if (ability === 'healing_light') check(renderer.numbers.some(p => p.node.text === '+10'), 'green heal number');
      const count = renderer.skillVfx.effects.filter(p => p.left > 0).length;
      renderer.render(decodeSnapshot(encodeSnapshot(world), 'p0'), 1, .016); app.render();
      check(renderer.skillVfx.effects.filter(p => p.left > 0).length === count, 'guest replay');
      check(renderer.root.getChildIndex(renderer.layers.skillFx) < renderer.root.getChildIndex(renderer.layers.telegraphs), 'danger priority');
      if (ability !== 'heavy_cleave') check(renderer.skillVfx.effects.find(p => p.left > 0).radius === profile.radius, 'exact radius');
      for (let frame = 0; frame < 60; frame++) {
        const t = performance.now(); renderer.render(world, 1, 1/60); app.render(); app.renderer.gl.finish(); timings.push(performance.now()-t);
      }
      check(renderer.skillVfx.effects.every(p => !p.node.visible && !p.wave.visible), 'effect lifetime');
      check(renderer.skillVfx.particles.every(p => !p.node.visible), 'particle lifetime');
      checks.push({ ability, reduced, windup: true, active: true, impact: true, lifetime: true, guestReplay: false });
      world.projectiles = [];
    }
    // Twelve simultaneous casts (four players x three profiles), intentionally saturating the fixed pools.
    renderer.reset(world);
    for (let i = 0; i < 100; i++) renderer.events(world, [
      { type: 'explode', ability: 'ember_bolt', x: 760, y: 430, radius: 78 },
      { type: 'healCast', ability: 'healing_light', x: 700, y: 430, radius: 160 },
      { type: 'heal', ability: 'healing_light', x: 700, y: 430, heal: 1 },
      { type: 'hit', ability: 'heavy_cleave', x: 760, y: 430, dmg: 96 }]);
    renderer.render(world, 1, .016); app.render(); app.renderer.gl.finish();
    check(renderer.skillVfx.effects.length === VFX_CAPS.effects && renderer.skillVfx.particles.length === VFX_CAPS.particles, 'pool growth');
    const stressTimings = [], players = world.entities.filter(p => p.kind === 'player');
    let peakEffects = 0, peakParticles = 0;
    renderer.reset(world);
    for (let frame = 0; frame < 360; frame++) {
      const t = performance.now(), ability = Object.keys(SKILL_VFX)[Math.floor(frame/60)%3];
      world.tick = 1000 + frame;
      for (const p of players) p.act = { id: ability, def: ABILITIES[ability], phase: frame%60<18 ? 'windup' : 'active',
        elapsed: frame%60, total: 18, facing: .2 };
      world.projectiles = ability === 'ember_bolt' ? players.map((p,i)=>({ id: 900+i, abilityId: ability, r: 12, x: 720+i*20+(frame%60)*3, y: 430, vx: 520, vy: 0 })) : [];
      if (frame%12 === 0) for (const p of players) renderer.events(world, [
        { type:'explode', ability:'ember_bolt', x:p.x+45, y:p.y, radius:78 },
        { type:'healCast', ability:'healing_light', x:p.x, y:p.y, radius:160 },
        { type:'heal', ability:'healing_light', x:p.x, y:p.y, heal:1 },
        { type:'hit', ability:'heavy_cleave', x:p.x+45, y:p.y, dmg:96 }]);
      renderer.render(world,1,1/60); app.render(); app.renderer.gl.finish();
      stressTimings.push(performance.now()-t);
      peakEffects = Math.max(peakEffects, renderer.skillVfx.effects.filter(p=>p.left>0).length);
      peakParticles = Math.max(peakParticles, renderer.skillVfx.particles.filter(p=>p.left>0).length);
    }
    check(peakEffects<=VFX_CAPS.effects && peakParticles<=VFX_CAPS.particles,'stress cap');
    const stats = values => { const sorted=values.slice().sort((a,b)=>a-b); return {
      frames:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,p95Ms:sorted[Math.floor(sorted.length*.95)],
      over16ms:values.filter(t=>t>1000/60).length }; };
    app.destroy({ removeView: true }, { children: true });
    return { checks, fourPlayers: true, saturatedPools: VFX_CAPS, softwareWebGL: stats(timings),
      continuousFourPlayerStress:{...stats(stressTimings),peakEffects,peakParticles,casts:'4 players x 3 profiles every 200ms; 4 fire projectiles'} };
  })()`);
  const errors = events.filter(e => e.method === 'Runtime.exceptionThrown'
    || e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'
    || e.method === 'Log.entryAdded' && e.params.entry.level === 'error');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(JSON.stringify({ ok: true, ...result, consoleErrors: 0 }, null, 2));
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

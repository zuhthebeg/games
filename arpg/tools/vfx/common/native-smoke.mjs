// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 9462);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8832);
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
  const results=[];
  for(const width of (process.env.ARPG_WIDTH_ONLY ? [Number(process.env.ARPG_WIDTH_ONLY)] : [390,1280])) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});
    await command('Emulation.setTouchEmulationEnabled',{enabled:width<600,maxTouchPoints:5});
    await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/?dev=1`});
    await waitFor('window.__arpg');
    const bootLazy=await evaluate(`performance.getEntriesByType('resource').filter(e=>e.name.includes('/assets/vfx/')).length===0`);
    assert.equal(bootLazy,true,'game eagerly loaded skill atlas');
    for(const flag of ['?fx=classic','']) {
      await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/test/feel-fixture.html${flag}`});
      await waitFor('document.readyState==="complete" && document.title==="ARPG render fixture"');
      const initial=await evaluate(`(async()=>{window.fx2Probe=await import('/arpg/tools/vfx/common/probe.mjs');return await fx2Probe.setup();})()`);
      assert.equal(initial.requested,!flag);assert.equal(initial.initialLoads,0);
      if(width<600){await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:60,y:445}]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
      else{await command('Input.dispatchMouseEvent',{type:'mousePressed',x:60,y:445,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:60,y:445,button:'left',clickCount:1});}
      await waitFor('!!window.fx2.result');
      const proof=await evaluate('fx2.result');
      assert.ok(!proof.error,proof.error);assert.equal(proof.clicks,1);
      assert.equal(proof.proof.length,10);
      const resources=proof.nativeResources;
      if(!flag){assert.equal(new Set(resources).size,10);assert.equal(proof.decoded.length,10);}else assert.equal(resources.length,0);
      let perf=null;
      if(!flag){perf=await evaluate('fx2Probe.benchmark()');assert.equal(perf.canvas[0],width,'fixture canvas does not match the emulated viewport');}
      results.push({width,flag:flag||'default',nativeInput:width<600?'touch':'mouse',bootLazy,...initial,...proof,resources,perf});
    }
  }
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log(JSON.stringify({ok:true,results,consoleErrors:0,physicalMobile:false}));
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

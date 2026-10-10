// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const port = 19097;
const profile = await mkdtemp(join(tmpdir(), 'arpg-smoke-'));
const server = spawn('python3', ['-m', 'http.server', '8731', '--bind', '127.0.0.1'], {
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
  assert.equal(server.exitCode, null, 'static server could not bind (8731 already occupied?)');
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
  const rectangles = (selector) => evaluate(`(() => {
    const rects = [...document.querySelectorAll(${JSON.stringify(selector)})].map(node => {
      const rect = node.getBoundingClientRect();
      return {id:node.id || node.dataset.action,x:rect.x,y:rect.y,w:rect.width,h:rect.height};
    });
    return {width:innerWidth,height:innerHeight,rects};
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
  const devStart = async (stage, weapon = 'blade') => {
    await waitFor(page('inn'));
    await evaluate(`document.querySelector('#dev-stage').value=${JSON.stringify(stage)};
      document.querySelector('#dev-weapon').value=${JSON.stringify(weapon)}`);
    await click('[data-action="dev-start"]');
    await waitFor(page('sortie'));
    await click('#sortie-confirm');
    await waitFor('__arpg.world.tick>0 && __arpg.world.round.state==="running"');
  };
  const backToInn = async () => {
    await waitFor(page('receipt'));
    await click('#result-back');
    await waitFor(page('inn'));
  };

  await command('Runtime.enable');
  await command('Page.enable');
  await command('Log.enable');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await command('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await command('Page.navigate', { url: 'http://127.0.0.1:8731/arpg/' });
  await waitFor(page('intro'));
  assert.equal(await evaluate("document.querySelector('#boot-error').textContent"), '');
  assert.ok(await evaluate("!!document.querySelector('canvas')"));
  await click('[data-action="name"]');
  await evaluate("document.querySelector('#hero-name').value='테스트 용사'");
  await click('#name-next');
  for (let question = 0; question < 5; question++) {
    await waitFor(page('quiz'));
    await click('[data-action="answer"][data-choice="0"]');
  }
  await waitFor(page('quiz-result'));
  assert.equal(await evaluate('__arpg.save'), null);
  await click('#quiz-start');
  await waitFor('__arpg.world?.round.stageId==="S1" && __arpg.world.tick>0');
  const roundMobile = await rectangles('#actions button');
  validateRects(roundMobile);
  assert.equal(roundMobile.rects.length, 6);
  await waitFor(page('level-up'), 38000);
  assert.equal(await evaluate('__arpg.world.round.t'), 900);
  assert.equal(await evaluate('__arpg.save.level'), 2);
  assert.equal(await evaluate('__arpg.save.statPoints'), 3);
  assert.ok(await evaluate("document.querySelector('#allocation-confirm').disabled"));
  for (let point = 0; point < 3; point++) await click('[data-action="stat-plus"][data-key="agi"]');
  await click('#allocation-confirm');
  await backToInn();
  const innMobile = await rectangles('.hotspot');
  validateRects(innMobile);
  assert.equal(innMobile.rects.length, 5);
  assert.ok(await evaluate("!document.querySelector('.dev-menu')"), 'dev menu leaked without query flag');
  await click('[data-action="shop"]');
  assert.ok(await evaluate("document.querySelector('#shop-total').textContent.includes('10 G')"));
  await click('#shop-buy');
  const beforeReload = await evaluate(`({
    gold:__arpg.save.gold,potions:__arpg.save.stacks.potion,level:__arpg.save.level,
  })`);
  assert.deepEqual(beforeReload, { gold: 20, potions: 4, level: 2 });
  const entireSave = await evaluate('JSON.stringify(__arpg.save)');
  await click('[data-action="inn"]');
  await click('[data-action="board"]');
  assert.ok(await evaluate("document.querySelector('[data-stage=\"S3\"]').disabled"));
  await click('[data-action="sortie"][data-stage="S2"]');
  await waitFor(page('sortie'));
  assert.equal(await evaluate('__arpg.world.round.stageId'), 'S1', 'sortie started before confirmation');
  await click('#sortie-confirm');
  await waitFor('__arpg.world.round.stageId==="S2" && __arpg.world.tick>0');
  await command('Page.reload');
  await waitFor(page('inn'));
  const persisted = await evaluate(`({
    gold:__arpg.save.gold,potions:__arpg.save.stacks.potion,level:__arpg.save.level,
  })`);
  assert.deepEqual(persisted, beforeReload);
  assert.equal(await evaluate('JSON.stringify(__arpg.save)'), entireSave);
  assert.equal(await evaluate('__arpg.world'), null);
  await click('[data-action="owner"]');
  assert.ok(await evaluate("document.querySelector('.receipt').textContent.includes('XP +50')"),
    'innkeeper lost the persisted last-run summary');
  await click('[data-action="inn"]');

  // Preserve M0 movement/hit/dodge/touch/death/scroll/weapon/visibility regression checks behind dev menu.
  await command('Page.navigate', { url: 'http://127.0.0.1:8731/arpg/?dev=1' });
  await waitFor(page('inn'));
  await devStart('S2');
  await evaluate(`window.smokeHits={tick:-1,hits:0,playerHits:0};
    window.watchHits=()=>{
      const world=__arpg.world;
      if(world && smokeHits.tick!==world.tick){
        smokeHits.tick=world.tick;
        for(const event of world.events) if(event.type==='hit'){
          smokeHits.hits++;
          if(event.src===world.entities[0].id)smokeHits.playerHits++;
        }
      }
      requestAnimationFrame(watchHits);
    };
    requestAnimationFrame(watchHits);`);
  await key('KeyD');
  await key('KeyJ');
  await sleep(2200);
  await key('Space');
  await sleep(5);
  await key('Space', 'keyUp');
  await sleep(2800);
  await key('KeyD', 'keyUp');
  await key('KeyJ', 'keyUp');
  const combat = await evaluate(`(() => {
    const world=__arpg.world;
    const player=world.entities[0];
    return {tick:world.tick,hp:player.hp,dodgeTick:player.dodge.startedTick,
      hits:smokeHits.hits,playerHits:smokeHits.playerHits};
  })()`);
  assert.ok(combat.tick >= 100 && combat.hits > 0 && combat.playerHits > 0, JSON.stringify(combat));
  assert.ok(combat.dodgeTick >= 0, '5ms dodge tap lost');
  assert.ok(await evaluate(`(() => {
    try {__arpg.world.entities[0].hp=999;return false;}catch{return true;}
  })()`), 'debug world writable');
  assert.ok(await evaluate(`(() => {
    try {__arpg.save.gold=999;return false;}catch{return true;}
  })()`), 'debug save writable');
  const attack = roundMobile.rects.find((rect) => rect.id === 'attack');
  const left = { x: 65, y: 680, id: 1 };
  const right = { x: attack.x + attack.w / 2, y: attack.y + attack.h / 2, id: 2 };
  const beforeTouch = await evaluate('__arpg.world.entities[0].x');
  await touch('touchStart', [left, right]);
  await touch('touchMove', [{ ...left, x: 100 }, right]);
  await sleep(700);
  await touch('touchEnd', []);
  assert.ok(await evaluate(`__arpg.world.entities[0].x>${beforeTouch}`), 'touch joystick did not move');
  await waitFor('__arpg.world.round.state==="failed"', 120000);
  assert.ok(await evaluate("document.querySelector('#cause').textContent.includes('회피 가능했던 공격')"));
  await backToInn();
  await devStart('S1');
  const scroll = roundMobile.rects.find((rect) => rect.id === 'scroll');
  await touch('touchStart', [{ x: scroll.x + scroll.w / 2, y: scroll.y + scroll.h / 2, id: 3 }]);
  await touch('touchEnd', []);
  await waitFor('__arpg.world.entities[0].channel>0');
  await sleep(450);
  const progress = await evaluate("parseFloat(document.querySelector('#scroll').style.getPropertyValue('--progress'))");
  assert.ok(progress > 0 && progress < 100);
  await waitFor('__arpg.world.round.state==="returned"', 5000);
  await backToInn();
  for (const weapon of ['bow', 'focus']) {
    await devStart('S1', weapon);
    const hitsBefore = await evaluate('smokeHits.playerHits');
    await key('KeyD');
    await key('KeyJ');
    await sleep(1300);
    await key('KeyD', 'keyUp');
    await key('KeyK');
    await sleep(5);
    await key('KeyK', 'keyUp');
    await sleep(1800);
    await key('KeyJ', 'keyUp');
    assert.ok(await evaluate(`smokeHits.playerHits>${hitsBefore}`), `${weapon} failed to hit scarecrow`);
    if (weapon === 'focus') {
      assert.ok(await evaluate('__arpg.world.entities[0].mp<100'), 'focus skill did not consume mana');
      const initialMana = await evaluate('__arpg.world.entities[0].manaPotions');
      await key('KeyE');
      await key('KeyE', 'keyUp');
      await waitFor(`__arpg.world.entities[0].manaPotions===${initialMana - 1}`);
    }
    await waitFor('!__arpg.world.entities[0].act');
    await key('KeyR');
    await key('KeyR', 'keyUp');
    await waitFor('__arpg.world.round.state==="returned"', 6000);
    await backToInn();
  }
  await devStart('S1');
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'))`);
  const pausedTick = await evaluate('__arpg.world.tick');
  await sleep(250);
  assert.equal(await evaluate('__arpg.world.tick'), pausedTick);
  assert.ok(await evaluate("!document.querySelector('#pause').hidden"));
  await evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");
  await waitFor(`__arpg.world.tick>${pausedTick}`);

  // An isolated rich fixture exercises real forge DOM actions without altering the sim.
  await evaluate(`(async () => {
    const {createSave,SaveStore}=await import('./js/meta/save.js');
    const {addXp}=await import('./js/meta/progression.js');
    const base=addXp(createSave({name:'대장장이 시험',answers:[0,0,0,0,0],createdAt:1}),451);
    const fixture={...base,gold:3000,stacks:{...base.stacks,scrap:100,hide:100,fang:100}};
    new SaveStore(localStorage).save(fixture);
  })()`);
  await command('Page.reload');
  await waitFor(page('inn'));
  await click('[data-action="forge"]');
  await click('[data-action="craft"][data-id="iron_sword"]');
  await click('[data-action="enhance"][data-uid="craft:iron_sword:1"]');
  await click('[data-action="equip"][data-uid="craft:iron_sword:1"]');
  assert.equal(await evaluate('__arpg.save.equipped.weapon'), 'craft:iron_sword:1');
  assert.ok(await evaluate(
    "document.querySelector('[data-action=\"dismantle\"][data-uid=\"craft:iron_sword:1\"]').disabled"));
  await click('[data-action="equip"][data-uid="starter:weapon"]');
  await click('[data-action="dismantle"][data-uid="craft:iron_sword:1"]');
  assert.equal(await evaluate('__arpg.save.stacks.scrap'), 90);
  assert.equal(await evaluate('__arpg.save.gold'), 2880);
  await command('Page.reload');
  await waitFor(page('inn'));
  assert.equal(await evaluate('__arpg.save.gold'), 2880);
  assert.equal(await evaluate('__arpg.save.stacks.scrap'), 90);
  await click('[data-action="settings"]');
  await click('[data-action="reset-first"]');
  assert.ok(await evaluate("localStorage.getItem('arpg.save.v1')!==null"));
  await click('[data-action="reset-second"]');
  assert.ok(await evaluate("localStorage.getItem('arpg.save.v1')!==null"));
  await click('[data-action="reset-final"]');
  await waitFor(page('intro'));
  assert.equal(await evaluate("localStorage.getItem('arpg.save.v1')"), null);
  await evaluate("localStorage.setItem('arpg.save.v1','{bad')");
  await command('Page.reload');
  await waitFor(page('intro'));
  assert.ok(await evaluate(`Object.keys(localStorage).some(key=>key.startsWith('arpg.save.v1.corrupt.'))`));

  const errors = events.filter((event) => event.method === 'Runtime.exceptionThrown'
    || event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error'
    || event.method === 'Log.entryAdded' && event.params.entry.level === 'error');
  assert.equal(errors.length, 0, JSON.stringify(errors.slice(0, 3)));
  console.log(JSON.stringify({
    ok: true, canvas: true,
    onboarding: 'name → 5 answers → S1 clear@900 → allocate 3 → inn',
    shop: 'potion +1, gold −10',
    S2: 'sortie confirmed → reload → inn',
    persisted, fullSaveRestored: true, lastReceiptRestored: true,
    mobile: { width: 390, height: 844, hotspots: 5, buttons: 6, inside: true, noOverlap: true },
    combat, touch: true, edgeLatch: true, readonlyDebug: true,
    weapons: ['blade', 'bow', 'focus'], manaPotionE: true,
    deathCause: true, scroll: 'progress → returned', visibilityPause: true,
    forge: 'craft → enhance → equip → unequip → dismantle → reload',
    resetDoubleConfirm: true, corruptBackup: true, consoleErrors: errors.length,
  }));
} finally {
  socket?.close();
  const stopped = [chrome, server].map(async (child) => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolveExit) => child.once('exit', resolveExit)), sleep(2500)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  await Promise.all(stopped);
  await rm(profile, { recursive: true, force: true });
}

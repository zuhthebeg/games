// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 19097);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8731);
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
  const artEvidence = { playerKits: [], monsters: [], procedural: [], rendererReadonly: false, fallback: false };
  const atlasReady = async (key) => {
    await waitFor(`__arpg.art.visuals.some(v=>v.key===${JSON.stringify(key)} && v.mode==='atlas' && v.textureLoaded)`, 20000);
    return evaluate(`JSON.parse(JSON.stringify(__arpg.art.visuals.find(v=>v.key===${JSON.stringify(key)} && v.mode==='atlas')))`);
  };
  const requestedArt = () => events.filter(event => event.method === 'Network.requestWillBeSent')
    .map(event => event.params.request.url).filter(url => url.includes('/assets/sprites/'));
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
    assert.ok(await evaluate('__arpg.world.entities[0].hp===__arpg.world.entities[0].maxHp'
      + ' && __arpg.world.entities[0].mp===__arpg.world.entities[0].maxMp'), 'inn did not auto-heal');
    assert.ok(await evaluate("!!document.querySelector('.inn-recovery') && !document.querySelector('[data-action=rest]')"));
  };

  await command('Runtime.enable');
  await command('Page.enable');
  await command('Log.enable');
  await command('Network.enable');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await command('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await command('Page.navigate', { url: `http://127.0.0.1:${httpPort}/arpg/` });
  await waitFor(page('intro'));
  assert.equal(await evaluate("document.querySelector('#arpg-debug-toggle')"), null);
  assert.equal(events.some(event => event.method === 'Network.requestWillBeSent' && event.params.request.url.includes('/js/debug/')), false);
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
  const firstArt = await atlasReady('blade');
  assert.equal(firstArt.id, 'hero-sword');
  artEvidence.playerKits.push(firstArt.id);
  assert.ok(await evaluate("__arpg.art.visuals.some(v=>v.key==='scarecrow' && v.mode==='procedural')"));
  assert.ok(requestedArt().every(url => url.includes('manifest.json') || url.includes('/hero-sword/')),
    'S1 fetched an unequipped kit or future monster');
  const initialFrame = await evaluate('__arpg.art.visuals.find(v=>v.key===\"blade\").frame');
  await waitFor(`__arpg.art.visuals.find(v=>v.key==='blade').frame!==${initialFrame}`);

  // Exercise the full atlas renderer on frozen state, plus the real lazy failure factory.
  // Deliberately fail an injected loader rather than creating HTTP console errors.
  const rendererChecks = await evaluate(`(async () => {
    const {Container}=await import('./vendor/pixi-8.22.0.min.mjs');
    const {ArenaRenderer}=await import('./js/render/renderer.js');
    const {VisualProvider}=await import('./js/render/visual-provider.js');
    const freeze=value=>{if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
    const frozen=freeze(JSON.parse(JSON.stringify(__arpg.world)));
    const before=JSON.stringify(frozen);
    const stage=new Container();
    const atlasProvider=new VisualProvider();
    const renderer=new ArenaRenderer({stage,screen:{width:390,height:844}},atlasProvider);
    renderer.reset(frozen);
    await atlasProvider.atlases.load(frozen.entities[0].weapon);
    const spriteReadonly=renderer.views.get(frozen.entities[0].id).visual.debug.mode==='atlas';
    renderer.events(frozen,frozen.events);
    renderer.render(frozen,.5,1/60);
    const provider=new VisualProvider();
    provider.atlases.fetchManifest=async()=>{throw new Error('smoke offline');};
    const view=provider.createVisual(frozen.entities[0]);
    await provider.atlases.load(frozen.entities[0].weapon);
    view.update(frozen.entities[0],{age:0,deadAge:0,hurt:0,reduced:false},1/60);
    const fallback=view.debug.mode==='procedural' && Object.keys(provider.atlases.status().failed).length===1;
    view.destroy();
    for(const item of renderer.views.values()){item.visual.destroy();item.shadow.destroy();item.portal.destroy();}
    renderer.root.destroy({children:true});renderer.warning.destroy();stage.destroy({children:true});
    return {readonly:before===JSON.stringify(frozen),spriteReadonly,fallback};
  })()`);
  assert.deepEqual(rendererChecks,{readonly:true,spriteReadonly:true,fallback:true});
  artEvidence.rendererReadonly=rendererChecks.readonly;
  artEvidence.fallback=rendererChecks.fallback;
  const roundMobile = await rectangles('#actions button');
  validateRects(roundMobile);
  assert.equal(roundMobile.rects.length, 6);
  await waitFor(page('level-up'), 38000);
  assert.equal(await evaluate('__arpg.world.round.t'), 900);
  assert.equal(await evaluate('__arpg.save.level'), 2);
  assert.equal(await evaluate('__arpg.save.statPoints'), 1);
  assert.ok(await evaluate("document.querySelector('#allocation-confirm').disabled"));
  for (let point = 0; point < 1; point++) await click('[data-action="stat-plus"][data-key="agi"]');
  await click('#allocation-confirm');
  await backToInn();
  const innMobile = await rectangles('.hotspot');
  validateRects(innMobile);
  assert.equal(innMobile.rects.length, 5);
  assert.ok(await evaluate("!document.querySelector('.dev-menu')"), 'dev menu leaked without query flag');
  await click('[data-action="shop"]');
  assert.ok(await evaluate("document.querySelector('#shop-total').textContent.trim()==='10'"));
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
  assert.ok(await evaluate(`document.querySelector('.receipt [aria-label="획득 경험치"]').textContent.includes('+50')`),
    'innkeeper lost the persisted last-run summary');
  await click('[data-action="inn"]');

  // Preserve M0 movement/hit/dodge/touch/death/scroll/weapon/visibility regression checks behind dev menu.
  await command('Page.navigate', { url: `http://127.0.0.1:${httpPort}/arpg/?dev=1` });
  await waitFor(page('inn'));
  await devStart('S2');
  const gruntArt=await atlasReady('goblin_grunt');
  assert.equal(gruntArt.id,'goblin-grunt');
  artEvidence.monsters.push(gruntArt.id);
  assert.ok(!requestedArt().some(url=>/goblin-archer|goblin-chief/.test(url)), 'future monster loaded before spawning');
  await evaluate(`window.smokeHits={tick:-1,hits:0,playerHits:0,maxFrozen:0,maxParticles:0,maxVoices:0};
    window.watchHits=()=>{
      const world=__arpg.world;
      const feedback=__arpg.feedback;
      smokeHits.maxFrozen=Math.max(smokeHits.maxFrozen,feedback.frozen.length);
      smokeHits.maxParticles=Math.max(smokeHits.maxParticles,feedback.particles);
      smokeHits.maxVoices=Math.max(smokeHits.maxVoices,feedback.audio.voices);
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
  await waitFor('__arpg.feedback.audio.state==="running" && __arpg.feedback.audio.loaded.length===7');
  const combat = await evaluate(`(() => {
    const world=__arpg.world;
    const player=world.entities[0];
    return {tick:world.tick,hp:player.hp,dodgeTick:player.dodge.startedTick,
      hits:smokeHits.hits,playerHits:smokeHits.playerHits};
  })()`);
  assert.ok(combat.tick >= 100 && combat.hits > 0 && combat.playerHits > 0, JSON.stringify(combat));
  assert.ok(combat.dodgeTick >= 0, '5ms dodge tap lost');
  const feedback = await evaluate(`({...smokeHits,pools:{...__arpg.feedback.pools},
    audio:{...__arpg.feedback.audio,loaded:[...__arpg.feedback.audio.loaded]}})`);
  assert.ok(feedback.maxFrozen >= 2 && feedback.maxParticles > 0 && feedback.maxVoices > 0, JSON.stringify(feedback));
  assert.deepEqual(feedback.pools, { particles: 56, numbers: 32, effects: 40 });
  assert.ok(feedback.maxVoices <= 6);
  await click('#hud [data-sound-toggle]');
  assert.equal(await evaluate('__arpg.feedback.audio.muted'), true);
  assert.equal(await evaluate('localStorage.getItem("arpg.audio.muted")'), '1');
  await click('#hud [data-sound-toggle]');
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
  const archerArt=await atlasReady('goblin_slinger');
  assert.equal(archerArt.id,'goblin-archer');
  assert.notEqual(archerArt.tint,gruntArt.tint);
  artEvidence.monsters.push(archerArt.id);
  await waitFor('__arpg.world.round.state==="failed"', 120000);
  assert.ok(await evaluate("document.querySelector('#cause').textContent.includes('고블린')"));
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
    const playerArt=await atlasReady(weapon);
    assert.equal(playerArt.id, weapon==='bow' ? 'hero-bow' : 'hero-focus');
    artEvidence.playerKits.push(playerArt.id);
    assert.deepEqual(await evaluate('JSON.parse(JSON.stringify(__arpg.art.loaded))'),[weapon], 'prior-round assets were not released');
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
      assert.ok(await evaluate('__arpg.world.entities[0].mp<__arpg.world.entities[0].maxMp'), 'focus skill did not consume mana');
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

  await key('KeyR');
  await key('KeyR','keyUp');
  await waitFor('__arpg.world.round.state==="returned"',6000);
  await backToInn();
  await devStart('S3');
  await waitFor("__arpg.art.visuals.some(v=>v.key==='iron_boar' && v.mode==='procedural')");
  artEvidence.procedural.push('iron_boar');
  assert.ok(!requestedArt().some(url=>url.includes('/skeleton/')), 'boar was incorrectly replaced by skeleton');
  await key('KeyR');
  await key('KeyR','keyUp');
  await waitFor('__arpg.world.round.state==="returned"',6000);
  await backToInn();
  await devStart('S4');
  const chiefArt=await atlasReady('goblin_chief');
  assert.equal(chiefArt.id,'goblin-chief');
  assert.ok(chiefArt.scale>=1.3 && chiefArt.scale<=1.35, 'chief scale '+chiefArt.scale);
  assert.notEqual(chiefArt.tint,gruntArt.tint);
  artEvidence.monsters.push(chiefArt.id);
  await key('KeyR');
  await key('KeyR','keyUp');
  await waitFor('__arpg.world.round.state==="returned"',6000);
  await backToInn();
  // A pre-expansion v1 fixture exercises the real S4→S5 board gate and all new procedural silhouettes.
  await evaluate(`(async () => {
    const {createSave,SaveStore}=await import('./js/meta/save.js');
    const {addXp}=await import('./js/meta/progression.js');
    const fixture=addXp(createSave({name:'신규 코스 시험',answers:[0,0,0,0,0],createdAt:1}),451);
    fixture.cleared={S1:true,S2:true,S3:true,S4:true};
    fixture.stacks.return_scroll=2;
    fixture.stageThreat.S2=1;
    new SaveStore(localStorage).save(fixture);
  })()`);
  await command('Page.reload');
  await waitFor(page('inn'));
  await click('[data-action="board"]');
  assert.ok(await evaluate(`!document.querySelector('[data-stage="S5"]').disabled
    && document.querySelector('[data-stage="S6"]').disabled
    && document.querySelector('[data-stage="S7"]').disabled`));
  // P3: real segment selection -> launch -> frozen world config -> return -> persisted selection.
  await click('[data-action="sortie"][data-stage="S2"]');
  assert.equal(await evaluate(`document.querySelector('[data-threat="3"]').disabled`),true);
  await click('[data-action="threat"][data-threat="2"]');
  assert.equal(await evaluate(`document.querySelector('[data-threat="2"]').getAttribute('aria-pressed')`),'true');
  await click('#sortie-confirm');
  await waitFor('__arpg.world.round.stageId==="S2" && __arpg.world.round.threat===2 && __arpg.world.tick>0');
  assert.equal(await evaluate('__arpg.save.threat'),2);
  await key('KeyR');await key('KeyR','keyUp');
  await waitFor('__arpg.world.round.state==="returned"',6000);
  await backToInn();await click('[data-action="board"]');
  await click('[data-action="sortie"][data-stage="S5"]');
  await click('#sortie-confirm');
  await waitFor('__arpg.world.round.stageId==="S5" && __arpg.world.tick>0');
  await waitFor('__arpg.art.visuals.filter(v=>v.key==="wolf" && v.mode==="procedural").length===2');
  await key('KeyR');
  await key('KeyR', 'keyUp');
  await waitFor('__arpg.world.round.state==="returned"', 6000);
  await backToInn();
  assert.equal(await evaluate('__arpg.save.cleared.S5'), undefined, 'return must not unlock S6');
  // The extra real T2 round consumes the second scroll. Buy a replacement through meta,
  // preserving the two-scroll cap before development kit rounds (which never settle supplies).
  await evaluate(`(async () => {
    const {buy}=await import('./js/meta/items.js');
    const {SaveStore}=await import('./js/meta/save.js');
    const store=new SaveStore(localStorage);
    store.save(buy(store.load(),'return_scroll'));
  })()`);
  await command('Page.reload');await waitFor(page('inn'));
  for (const [stage, types] of [['S6', ['rune_guardian', 'spirit']], ['S7', ['poison_spider']]]) {
    await devStart(stage);
    await waitFor(`${JSON.stringify(types)}.every(type=>__arpg.art.visuals.some(v=>v.key===type && v.mode==="procedural"))`);
    await key('KeyR');
    await key('KeyR', 'keyUp');
    await waitFor('__arpg.world.round.state==="returned"', 6000);
    await backToInn();
  }

  // An isolated rich fixture exercises real forge DOM actions without altering the sim.
  await evaluate(`(async () => {
    const {createSave,SaveStore}=await import('./js/meta/save.js');
    const {addXp}=await import('./js/meta/progression.js');
    const base=addXp(createSave({name:'대장장이 시험',answers:[0,0,0,0,0],createdAt:1}),451);
    const fixture={...base,gold:3000,stacks:{...base.stacks,scrap:100,hide:100,fang:100,enhance_stone_1:2}};
    new SaveStore(localStorage).save(fixture);
  })()`);
  await command('Page.reload');
  await waitFor(page('inn'));
  await click('[data-action="forge"]');
  await evaluate("document.querySelector('.craft-list').open=true");
  await click('[data-action="craft"][data-id="iron_sword"]');
  await click('[data-action="enhance"][data-uid="craft:iron_sword:1"]');
  await click('[data-action="equip"][data-uid="craft:iron_sword:1"]');
  assert.equal(await evaluate('__arpg.save.equipped.weapon'), 'craft:iron_sword:1');
  assert.ok(await evaluate(
    "document.querySelector('[data-action=\"dismantle\"][data-uid=\"craft:iron_sword:1\"]').disabled"));
  await click('[data-action="select-gear"][data-uid="starter:weapon"]');
  await click('[data-action="equip"][data-uid="starter:weapon"]');
  await click('[data-action="select-gear"][data-uid="craft:iron_sword:1"]');
  await click('[data-action="dismantle"][data-uid="craft:iron_sword:1"]');
  assert.equal(await evaluate('__arpg.save.stacks.scrap'), 94);
  assert.equal(await evaluate('__arpg.save.gold'), 2895);
  await command('Page.reload');
  await waitFor(page('inn'));
  assert.equal(await evaluate('__arpg.save.gold'), 2895);
  assert.equal(await evaluate('__arpg.save.stacks.scrap'), 94);
  await click('[data-action="shop"]');
  await click('[data-action="shop-select"][data-id="mana_potion"]');
  await click('#shop-buy');
  assert.equal(await evaluate('__arpg.save.stacks.mana_potion'), 2);
  await click('[data-action="shop-select"][data-id="return_scroll"]');
  await click('#shop-buy');
  assert.equal(await evaluate('__arpg.save.stacks.return_scroll'), 2);
  assert.ok(await evaluate("document.querySelector('#shop-buy').disabled"), 'scroll cap not enforced');
  await click('[data-action="shop-select"][data-id="potion"]');
  await evaluate("document.querySelector('#shop-count').value=2;document.querySelector('#shop-count').dispatchEvent(new Event('change',{bubbles:true}))");
  await click('#shop-buy');
  assert.equal(await evaluate('__arpg.save.stacks.potion'), 5);
  assert.equal(await evaluate('__arpg.save.gold'), 2857);
  // P1 gear stock uses actual buy/sell/refresh controls; no sim fixture writes.
  assert.ok(await evaluate("document.querySelector('[data-action=\"buy-gear\"]')!==null"));
  const beforeGearGold = await evaluate('__arpg.save.gold');
  const stockUid = await evaluate("document.querySelector('[data-action=\"buy-gear\"]').dataset.uid");
  await click(`[data-action="buy-gear"][data-uid="${stockUid}"]`);
  const boughtUid = await evaluate('__arpg.save.items.at(-1).uid');
  assert.ok(await evaluate(`document.querySelector('[data-action="buy-gear"][data-uid="${stockUid}"]').disabled`));
  await click(`[data-action="sell-shop"][data-uid="${boughtUid}"]`);
  assert.ok(await evaluate('__arpg.save.gold') < beforeGearGold);
  const refreshGold = await evaluate('__arpg.save.gold');
  await click('[data-action="refresh-shop"]');
  assert.equal(await evaluate('__arpg.save.gold'), refreshGold - 20);
  assert.equal(await evaluate('__arpg.save.shopRefresh'), 1);
  assert.equal(await evaluate('__arpg.save.paidRefreshes'), 1);
  await command('Page.reload'); await waitFor(page('inn'));
  assert.equal(await evaluate('__arpg.save.shopRefresh'), 1);
  assert.equal(await evaluate('__arpg.save.items.some(item=>item.uid=== ' + JSON.stringify(boughtUid) + ')'), false);
  assert.equal(await evaluate('__arpg.save.version'), 3);
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

  // Debug scenario uses only the new panel plus real sortie/settlement controls.
  await evaluate(`(async () => {
    const {createSave,SaveStore}=await import('./js/meta/save.js');
    const {setLevel}=await import('./js/debug/actions.js');
    const save=setLevel(createSave({name:'디버그 시험',answers:[0,0,0,0,0],weapon:'blade',createdAt:123}),30);
    new SaveStore(localStorage).save(save);
  })()`);
  await command('Page.navigate', { url: `http://127.0.0.1:${httpPort}/arpg/?debug=1` });
  await waitFor("!!document.querySelector('#arpg-debug-toggle')");
  await waitFor(page('inn'));
  await sleep(100);
  validateRects(await rectangles('#arpg-debug-toggle'));
  const dbgTouch = (await rectangles('#arpg-debug-toggle')).rects[0];
  await touch('touchStart', [{x:dbgTouch.x+dbgTouch.w/2,y:dbgTouch.y+dbgTouch.h/2,id:41}]);
  await touch('touchEnd', []);
  await waitFor("!document.querySelector('#arpg-debug-panel').hidden");
  assert.ok(await evaluate("!document.querySelector('#arpg-debug-panel').hidden"));
  const debugGold = await evaluate('__arpg.save.gold');
  await click('[data-debug="gold:1000"]');
  await waitFor(`__arpg.save.gold===${debugGold + 1000}`);
  const debugGear = await evaluate('__arpg.save.items.length');
  await click('[data-debug="set"]');
  await waitFor(`__arpg.save.items.length===${debugGear + 20}`);
  assert.ok(await evaluate(`(async()=>{const {validateSave}=await import('./js/meta/save.js');return validateSave(JSON.parse(localStorage.getItem('arpg.save.v1')))})()`));
  await click('[data-debug="unlock"]');
  await click('[data-debug="god"]');
  await click('[data-debug="oneHit"]');
  await click('[data-debug="mana"]');
  await evaluate("document.querySelector('#dbg-speed').value='4';document.querySelector('#dbg-speed').dispatchEvent(new Event('change',{bubbles:true}))");
  await click('[data-debug="close"]');
  await click('[data-action="board"]');
  await click('[data-action="sortie"][data-stage="S2"]');
  await click('#sortie-confirm');
  await waitFor('__arpg.world?.round.state==="running" && __arpg.world.entities.some(e=>e.kind==="monster"&&!e.dead)');
  validateRects(await rectangles('#arpg-debug-toggle, #actions button, .vitals, .stage'));
  assert.ok(await evaluate('__arpg.world.entities[0].dmgMult.blade>=100'));
  await click('#arpg-debug-toggle');
  const debugLayout = await rectangles('#arpg-debug-panel'); validateRects(debugLayout);
  assert.ok(await evaluate("[...document.querySelectorAll('#arpg-debug-panel button,#arpg-debug-panel input,#arpg-debug-panel select')].every(n=>n.getBoundingClientRect().height>=44)"));
  const beforeCanvasKey = await evaluate('__arpg.world.entities[0].x');
  await key('KeyD'); await sleep(150); await key('KeyD', 'keyUp');
  await sleep(100);
  assert.ok(await evaluate('__arpg.world.entities[0].x') > beforeCanvasKey, 'open panel blocked outside keyboard input');
  const beforePanelKey = await evaluate('__arpg.world.entities[0].x');
  await evaluate("document.querySelector('#dbg-json').dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD',bubbles:true}));document.querySelector('#dbg-json').dispatchEvent(new KeyboardEvent('keyup',{code:'KeyD',bubbles:true}))");
  await sleep(200);
  assert.equal(await evaluate('__arpg.world.entities[0].x'), beforePanelKey, 'panel typing leaked to game input');
  await waitFor('__arpg.world.entities.some(e=>e.kind==="monster"&&!e.dead&&Math.abs(e.x-__arpg.world.entities[0].x)<200&&Math.abs(e.y-__arpg.world.entities[0].y)<300)');
  await click('[data-debug="kill"]');
  await waitFor('__arpg.tracker.killIndex>0 && __arpg.tracker.tempLoot.gold>0');
  assert.ok(await evaluate('__arpg.world.entities[0].hp===__arpg.world.entities[0].maxHp'));
  await click('[data-debug="info"]');
  await waitFor("document.querySelector('#arpg-debug-info').textContent.includes('gold')");
  await click('[data-debug="clear"]');
  await waitFor(page('receipt'));
  const debugReceipt = await evaluate('JSON.parse(JSON.stringify(__arpg.save.lastReceipt))');
  assert.equal(debugReceipt.terminal, 'clear'); assert.ok(debugReceipt.goldGained>0);
  await click('[data-debug="close"]'); await click('#result-back'); await waitFor(page('inn'));
  // Registry updates an already-mounted panel and preserves live reference getters.
  await evaluate(`(async()=>{const {registerDebugAction}=await import('./js/debug/index.js');registerDebugAction({group:'P3',label:'테스트',run:ctx=>{document.body.dataset.debugExtension=String(ctx.running);document.body.dataset.debugSave=ctx.save.name;document.body.dataset.debugPersist=typeof ctx.persistSave}})})()`);
  await click('#arpg-debug-toggle'); await click('#dbg-extensions button');
  await waitFor("document.body.dataset.debugExtension==='false'");
  assert.equal(await evaluate('document.body.dataset.debugSave'), '디버그 시험');
  assert.equal(await evaluate('document.body.dataset.debugPersist'), 'function');
  const previewSave = await evaluate("localStorage.getItem('arpg.save.v1')");
  await evaluate("document.querySelector('#dbg-monster').value='goblin_grunt';document.querySelector('#dbg-count').value='1000';document.querySelector('#dbg-kind').value='elite';document.querySelector('#dbg-threat').value='3'");
  await click('[data-debug="preview"]');
  const debugPreview = await evaluate("document.querySelector('#dbg-preview').textContent");
  assert.ok(JSON.parse(debugPreview).goldAverage > 0);
  await click('[data-debug="preview"]');
  assert.equal(await evaluate("document.querySelector('#dbg-preview').textContent"), debugPreview);
  assert.equal(await evaluate("localStorage.getItem('arpg.save.v1')"), previewSave);
  await command('Page.reload'); await waitFor("!!document.querySelector('#arpg-debug-toggle')");
  assert.equal(await evaluate("localStorage.getItem('arpg.debug')"), '1');
  await command('Page.navigate', { url: `http://127.0.0.1:${httpPort}/arpg/` });
  await waitFor("!!document.querySelector('#arpg-debug-toggle')");
  await command('Page.navigate', { url: `http://127.0.0.1:${httpPort}/arpg/?debug=0` });
  await waitFor(page('inn')); assert.equal(await evaluate("document.querySelector('#arpg-debug-toggle')"), null);
  await command('Page.navigate', { url: `http://127.0.0.1:${httpPort}/arpg/?debug=1` });
  await waitFor("!!document.querySelector('#arpg-debug-toggle')");
  await command('Emulation.setDeviceMetricsOverride', {width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await command('Input.dispatchKeyEvent', {type:'keyDown',code:'Backquote',key:'`',windowsVirtualKeyCode:192});
  await command('Input.dispatchKeyEvent', {type:'keyUp',code:'Backquote',key:'`',windowsVirtualKeyCode:192});
  assert.equal(await evaluate("document.querySelector('#arpg-debug-panel').hidden"), false);
  await command('Input.dispatchKeyEvent', {type:'keyDown',code:'Backquote',key:'`',windowsVirtualKeyCode:192});
  await command('Input.dispatchKeyEvent', {type:'keyUp',code:'Backquote',key:'`',windowsVirtualKeyCode:192});
  assert.equal(await evaluate("document.querySelector('#arpg-debug-panel').hidden"), true);

  const errors = events.filter((event) => event.method === 'Runtime.exceptionThrown'
    || event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error'
    || event.method === 'Log.entryAdded' && event.params.entry.level === 'error');
  assert.equal(errors.length, 0, JSON.stringify(errors.slice(0, 3)));
  console.log(JSON.stringify({
    ok: true, canvas: true, sprites: artEvidence,
    onboarding: 'name → 5 answers → S1 clear@900 → allocate 1 → inn',
    shop: 'supplies + scroll cap; seeded gear buy → sold-out → sell at loss → paid refresh → reload',
    S2: 'sortie confirmed → reload → inn; threat2 segment → launch frozen T2 → return',
    newStages: 'pre-S5 v1 → S5 board unlock → wolf ×2 / S6 guardian+spirit / S7 spider procedural → return',
    persisted, fullSaveRestored: true, lastReceiptRestored: true,
    mobile: { width: 390, height: 844, hotspots: 5, buttons: 6, inside: true, noOverlap: true },
    combat, feedback, touch: true, edgeLatch: true, readonlyDebug: true,
    weapons: ['blade', 'bow', 'focus'], manaPotionE: true,
    innAutoRecovery: ['clear', 'death', 'return_scroll', 'reload'],
    deathCause: true, scroll: 'progress → returned', visibilityPause: true,
    forge: 'craft → enhance → equip → unequip → dismantle → reload',
    debugMode: { mobile: true, desktopBackquote: true, gearSet:20, receiptGold:debugReceipt.goldGained, disabledNoImport:true },
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

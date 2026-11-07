import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const outputDir = '/home/ubuntu/devinarok-shots/m1c';
const exceptions = [];
const consoleErrors = [];
await mkdir(outputDir, { recursive: true });

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 0;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
      }
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        consoleErrors.push(message.params.entry.text);
      }
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  }
}

async function waitFor(client, expression, timeoutMs = 45000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await client.evaluate(expression)) return;
    await delay(150);
  }
  throw new Error(`Timed out: ${expression}`);
}

async function viewport(client, width, height, mobile = false) {
  await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
}

async function activateTouch(client) {
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 8, y: 8, id: 1 }],
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function renderFrames(client, count = 20) {
  for (let frame = 0; frame < count; frame += 1) {
    await delay(30);
    await client.evaluate('window.__devinarok.render()');
  }
}

async function capture(client, name) {
  const response = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const path = `${outputDir}/${name.endsWith('.png') ? name : `${name}.png`}`;
  await writeFile(path, Buffer.from(response.data, 'base64'));
  console.log(path);
}

async function playerScreenY(client) {
  return client.evaluate(`(() => {
    const { renderer, world } = window.__devinarok;
    const player = world.entities.find((entity) => entity.kind === 'player');
    const visual = renderer.entities.get(player.id);
    const rect = renderer.canvas.getBoundingClientRect();
    const point = new renderer.camera.position.constructor(
      visual.root.position.x,
      visual.root.position.y + visual.screenCenterY,
      visual.root.position.z,
    ).project(renderer.camera);
    return {
      screenY: Math.round((rect.top + (1 - point.y) * rect.height / 2) * 10) / 10,
      viewportHeight: rect.height,
      targetY: renderer.mobileCameraTargetScreenY,
    };
  })()`);
}

async function enterStage(client, stageId) {
  await client.evaluate(`window.__devinarok.startStage('${stageId}')`);
  await waitFor(client, `window.__devinarok.world?.stageId === '${stageId}' && window.__devinarok.renderer?.entities.size > 0`);
  await client.evaluate('window.__devinarok.loop.pause()');
}

async function stepTicks(client, count) {
  await client.evaluate(`(() => {
    const api = window.__devinarok;
    const player = api.world.entities.find((entity) => entity.kind === 'player');
    let seq = player.lastInput.seq + 1;
    for (let tick = 0; tick < ${count}; tick += 1) {
      const previous = structuredClone(api.world);
      api.step({ [player.playerId]: { seq: seq++, moveX: 0, moveZ: 0, aim: 192, buttons: 0 } });
      api.render(previous);
    }
  })()`);
}

let browser;
let browserContextId;
let client;
const playerY = {};
try {
  const browserInfo = await fetch('http://127.0.0.1:9225/json/version').then((response) => response.json());
  browser = new CdpClient(browserInfo.webSocketDebuggerUrl);
  await browser.connect();
  ({ browserContextId } = await browser.send('Target.createBrowserContext'));
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const targets = await fetch('http://127.0.0.1:9225/json/list').then((response) => response.json());
  const target = targets.find((entry) => entry.id === targetId);
  if (!target?.webSocketDebuggerUrl) throw new Error('Could not attach to the fresh capture profile');
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await viewport(client, 1024, 768);
  await client.send('Page.navigate', { url: 'http://127.0.0.1:8000/devinarok/?dev=1' });
  await waitFor(client, `document.readyState === 'complete' && Boolean(window.__devinarok)`);
  await client.evaluate(`(() => {
    const form = document.querySelector('#create-form');
    if (!form.hidden) {
      form.querySelector('input[name="name"]').value = 'M1cCapture';
      form.requestSubmit();
    }
  })()`);
  await waitFor(client, `!document.querySelector('#character-card').hidden`);
  await client.evaluate(`document.querySelector('#start-button').click()`);
  await waitFor(client, `window.__devinarok.world?.mode === 'hub' && Boolean(window.__devinarok.renderer)`);
  await delay(600);

  await viewport(client, 390, 844, true);
  await activateTouch(client);
  await renderFrames(client, 30);
  playerY.hubNpcs = await playerScreenY(client);
  await capture(client, 'hub-npcs-mobile-390x844.png');

  await viewport(client, 1024, 768);
  await client.evaluate(`document.documentElement.classList.remove('touch-mode')`);
  await client.evaluate(`window.__devinarok.grantDevGold(2000)`);
  const equippedUid = await client.evaluate(`window.__devinarok.grantDevItem({ itemId: 'rusted-sword', rarity: 'rare' })`);
  const compareUid = await client.evaluate(`window.__devinarok.grantDevItem({ itemId: 'rusted-sword', rarity: 'legendary' })`);
  await client.evaluate(`document.querySelector('[data-panel="inventory"]').click()`);
  await client.evaluate(`document.querySelector('[data-equip="${equippedUid}"]').click()`);
  await waitFor(client, `window.__devinarok.character.equipment.weapon === '${equippedUid}'`);
  await client.evaluate(`document.querySelector('[data-panel="inventory"]').click()`);
  await client.evaluate(`document.querySelector('[data-compare="${compareUid}"]').click()`);
  await waitFor(client, `Boolean(document.querySelector('#hub-panel .compare-deltas'))`);
  await capture(client, 'inventory-compare-panel.png');

  await enterStage(client, 'C1');
  await stepTicks(client, 30);
  await renderFrames(client);
  await capture(client, 'c1-first-room-desktop-1024x768.png');
  await viewport(client, 390, 844, true);
  await activateTouch(client);
  await renderFrames(client, 30);
  playerY.c1FirstRoom = await playerScreenY(client);
  await capture(client, 'c1-first-room-mobile-390x844.png');

  await enterStage(client, 'CB');
  await client.evaluate(`(() => {
    const api = window.__devinarok;
    const player = api.world.entities.find((entity) => entity.kind === 'player');
    const boss = api.world.entities.find((entity) => entity.boss);
    player.potions = 3;
    player.skillCooldowns[1] = 90;
    player.skillCooldowns[2] = 120;
    player.skillCooldowns[3] = 180;
    document.querySelector('#potion-count').textContent = '3';
    for (const [value, cooldown] of [[4, 50], [8, 55], [16, 50]]) {
      document.querySelector('#controls [data-button="' + value + '"]').style.setProperty('--cooldown', String(cooldown) + '%');
    }
    boss.hp = Math.floor(boss.maxHp * 0.62);
    document.querySelector('#boss-fill').style.width = '62%';
    document.querySelector('#boss-intro').hidden = true;
  })()`);
  await viewport(client, 390, 844, true);
  await activateTouch(client);
  await renderFrames(client, 30);
  playerY.mobileCombatHud = await playerScreenY(client);
  await capture(client, 'mobile-combat-hud-cooldowns-potion-bossbar-390x844.png');

  await viewport(client, 1024, 768);
  await client.evaluate(`document.documentElement.classList.remove('touch-mode')`);
  const bossKill = await client.evaluate(`(() => {
    const api = window.__devinarok;
    const player = api.world.entities.find((entity) => entity.kind === 'player');
    const boss = api.world.entities.find((entity) => entity.boss);
    api.world.entities = api.world.entities.filter((entity) => entity.kind === 'player' || entity.id === boss.id);
    api.world.roomEnemyIds = [boss.id];
    api.world.roomCleared = false;
    api.world.outcome = null;
    api.world.result = null;
    api.world.reward = { xp: 0, gold: 0, items: [] };
    player.x = 0;
    player.z = -1.5;
    player.attack = null;
    player.skillCast = null;
    player.previousButtons = 0;
    player.lastInput = { ...player.lastInput, buttons: 0, moveX: 0, moveZ: 0, aim: 64 };
    boss.x = 0;
    boss.z = 0;
    boss.hp = 1;
    boss.dead = false;
    boss.deathTicks = 0;
    boss.spawnTicksLeft = 0;
    boss.invulnerable = false;
    boss.stunnedTicks = 0;
    boss.attackPhase = null;
    boss.attackShape = null;
    boss.attackCooldownTicks = 10000;
    let seq = player.lastInput.seq + 1;
    for (let tick = 0; tick < 20 && !api.world.outcome; tick += 1) {
      const previous = structuredClone(api.world);
      api.step({ [player.playerId]: {
        seq: seq++,
        moveX: 0,
        moveZ: 0,
        aim: 64,
        buttons: tick === 0 ? api.buttons.ATTACK : 0,
      } });
      api.render(previous);
    }
    return {
      outcome: api.world.outcome,
      itemCount: api.world.result?.items.length ?? 0,
      items: api.world.result?.items.map((item) => item.itemId) ?? [],
    };
  })()`);
  if (bossKill.outcome !== 'clear' || bossKill.itemCount !== 2) {
    throw new Error(`Boss clear capture did not collect two guaranteed items: ${JSON.stringify(bossKill)}`);
  }
  await client.evaluate(`window.__devinarok.settleStage('clear')`);
  await waitFor(client, `!document.querySelector('#result-panel').hidden && document.querySelectorAll('#result-panel .settlement-items li').length === 2`);
  await renderFrames(client, 2);
  await capture(client, 'boss-clear-result.png');

  const summary = {
    playerScreenY: playerY,
    javascriptExceptions: exceptions,
    javascriptExceptionCount: exceptions.length,
    consoleErrors,
    bossClearItems: bossKill.items,
  };
  await writeFile(`${outputDir}/capture-summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Browser JS exceptions: ${exceptions.length}`);
  console.log(`Browser console errors: ${consoleErrors.length}`);
  console.log(JSON.stringify(playerY));
  if (exceptions.length) throw new Error(`Browser reported ${exceptions.length} JS exceptions`);
} finally {
  client?.socket.close();
  if (browserContextId) await browser?.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  browser?.socket.close();
}

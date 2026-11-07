import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const outputDir = '/home/ubuntu/devinarok-shots/m1';
const errors = [];
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
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        errors.push(message.params.entry.text);
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

async function capture(client, name) {
  const response = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const path = `${outputDir}/${name.endsWith('.png') ? name : `${name}.png`}`;
  await writeFile(path, Buffer.from(response.data, 'base64'));
  console.log(path);
}

async function enterStage(client, stageId) {
  await client.evaluate(`window.__devinarok.startStage('${stageId}')`);
  await waitFor(client, `window.__devinarok.world?.stageId === '${stageId}' && window.__devinarok.renderer?.entities.size > 0`);
  await client.evaluate('window.__devinarok.loop.pause()');
}

async function renderTicks(client, button, count) {
  await client.evaluate(`(() => {
    const api = window.__devinarok;
    const player = api.world.entities.find((entity) => entity.kind === 'player');
    let seq = player.lastInput.seq + 1;
    for (let tick = 0; tick < ${count}; tick += 1) {
      const previous = structuredClone(api.world);
      api.step({ [player.playerId]: { seq: seq++, moveX: 0, moveZ: 0, aim: 192, buttons: tick === 0 ? ${button} : 0 } });
      api.render(previous);
    }
  })()`);
}

async function hideRoomEnemies(client) {
  await client.evaluate(`(() => {
    const api = window.__devinarok;
    for (const enemy of api.world.entities.filter((entity) => entity.kind === 'enemy')) {
      enemy.dead = true;
      enemy.deathTicks = 0;
    }
    api.render(structuredClone(api.world));
  })()`);
}

async function prepareSkill(client, skillId) {
  await client.evaluate(`(() => {
    const renderer = window.__devinarok.renderer;
    const player = window.__devinarok.world.entities.find((entity) => entity.kind === 'player');
    for (const effect of renderer.slashes.values()) {
      renderer.scene.remove(effect.mesh);
      effect.mesh.geometry.dispose();
      effect.mesh.material.dispose();
    }
    renderer.slashes.clear();
    player.skillCast = null;
    player.skillCooldowns[${skillId}] = 0;
    player.previousButtons = 0;
    player.lastInput.buttons = 0;
  })()`);
}

let browser;
let browserContextId;
let client;
try {
const browserInfo = await fetch('http://127.0.0.1:9225/json/version').then((response) => response.json());
browser = new CdpClient(browserInfo.webSocketDebuggerUrl);
await browser.connect();
({ browserContextId } = await browser.send('Target.createBrowserContext'));
const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
const targets = await fetch('http://127.0.0.1:9225/json/list').then((response) => response.json());
const target = targets.find((entry) => entry.id === targetId);
if (!target?.webSocketDebuggerUrl) throw new Error('Could not attach to fresh capture profile');
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
    form.querySelector('input[name="name"]').value = 'M1Capture';
    form.requestSubmit();
  }
})()`);
await waitFor(client, `!document.querySelector('#character-card').hidden`);
await client.evaluate(`document.querySelector('#start-button').click()`);
  await waitFor(client, `Boolean(window.__devinarok.world?.mode === 'hub' && window.__devinarok.renderer)`);
await delay(1000);
await capture(client, 'hub-desktop-1024x768');
await viewport(client, 390, 844, true);
await delay(400);
await capture(client, 'hub-mobile-390x844');

await client.evaluate(`window.__devinarok.grantDevGold(1000)`);
const swordUid = await client.evaluate(`window.__devinarok.grantDevItem({ itemId: 'rusted-sword', rarity: 'rare' })`);
const comparisonUid = await client.evaluate(`window.__devinarok.grantDevItem({ itemId: 'rusted-sword', rarity: 'magic' })`);
await viewport(client, 1024, 768);
await client.evaluate(`document.querySelector('[data-panel="inventory"]').click()`);
await waitFor(client, `!document.querySelector('#hub-panel').hidden`);
await client.evaluate(`document.querySelector('[data-equip="${swordUid}"]').click()`);
await waitFor(client, `window.__devinarok.character.equipment.weapon === '${swordUid}'`);
await client.evaluate(`document.querySelector('[data-panel="blacksmith"]').click()`);
await capture(client, 'blacksmith-panel.png');
await client.evaluate(`document.querySelector('[data-panel="inventory"]').click()`);
await client.evaluate(`document.querySelector('[data-compare="${comparisonUid}"]').click()`);
await capture(client, 'inventory-compare-panel.png');

for (const stageId of ['C1', 'C2', 'C3']) {
  await enterStage(client, stageId);
  await hideRoomEnemies(client);
  await delay(500);
  await capture(client, `${stageId.toLowerCase()}-first-room-desktop-1024x768`);
  if (stageId === 'C1') {
    await client.evaluate(`(() => {
      const api = window.__devinarok;
      for (const entity of api.world.entities) if (entity.kind === 'enemy') { entity.dead = true; entity.deathTicks = 1; }
      const door = api.world.arena.doors.find((entry) => entry.fromRoom === api.world.arena.rooms[api.world.roomIndex].id);
      const player = api.world.entities.find((entity) => entity.kind === 'player');
      player.x = door.x;
      player.z = door.z + 3;
      const previous = structuredClone(api.world);
      api.step({});
      api.renderer.camera.position.x = player.x;
      api.renderer.camera.position.z = player.z + api.renderer.cameraOffsetZ - 0.6;
      api.renderer.camera.lookAt(player.x, 0, player.z - 0.6);
      api.render(previous);
    })()`);
    await capture(client, 'c1-door-open-after-clear.png');
    await client.evaluate(`(() => {
      const api = window.__devinarok;
      const player = api.world.entities.find((entity) => entity.kind === 'player');
      player.x = 0;
      player.z = 7;
      api.renderer.camera.position.set(0, 16, 17.6);
      api.renderer.camera.lookAt(0, 0, 6.4);
      api.render(structuredClone(api.world));
    })()`);
    await prepareSkill(client, 1);
    await renderTicks(client, 4, 11);
    await capture(client, 'skill-spin-mid-cast.png');
    await prepareSkill(client, 2);
    await renderTicks(client, 8, 3);
    await capture(client, 'skill-dash-mid-cast.png');
    await prepareSkill(client, 3);
    await renderTicks(client, 16, 5);
    await capture(client, 'skill-guard-mid-cast.png');
    await prepareSkill(client, 2);
    const lootId = await client.evaluate(`(() => {
      const api = window.__devinarok;
      const player = api.world.entities.find((entity) => entity.kind === 'player');
      const loot = api.addLoot({ itemId: 'grave-greatsword', rarity: 'legendary', x: player.x + 2, z: player.z + 1 });
      api.render();
      return loot.id;
    })()`);
    await waitFor(client, `window.__devinarok.renderer.entities.has(${lootId})`);
    await capture(client, 'loot-beam-label.png');
  }
}

await enterStage(client, 'CB');
await capture(client, 'boss-intro-card.png');
await client.evaluate(`(() => {
  const api = window.__devinarok;
  const boss = api.world.entities.find((entity) => entity.boss);
  boss.hp = Math.floor(boss.maxHp * 0.45);
  boss.spawnTicksLeft = 0;
  boss.invulnerable = false;
  boss.attackCooldownTicks = 0;
  boss.attackPhase = null;
  boss.attackPatternIndex = 3;
  const player = api.world.entities.find((entity) => entity.kind === 'player');
  boss.x = player.x + 1.5;
  boss.z = player.z - 3;
})()`);
await waitFor(client, `document.querySelector('#boss-intro').hidden`);
await renderTicks(client, 0, 14);
await capture(client, 'boss-phase-two-telegraph.png');

await enterStage(client, 'C1');
const proofBefore = await client.evaluate(`({
  level: window.__devinarok.character.level,
  xp: window.__devinarok.character.xp,
  gold: window.__devinarok.character.gold,
  items: window.__devinarok.inventory.length,
  clearedStages: [...window.__devinarok.character.clearedStages]
})`);
await client.evaluate(`(() => {
  const api = window.__devinarok;
  api.world.reward = { xp: 85, gold: 125, items: [{ uid: 'm1-proof-item', itemId: 'rusted-sword', rarity: 'rare', ilvl: 1, enhance: 0, affixes: [], legendaryId: null }] };
})()`);
await client.evaluate(`window.__devinarok.forceOutcome('clear')`);
await waitFor(client, `!document.querySelector('#result-panel').hidden`);
await capture(client, 'result-clear.png');
await client.send('Page.reload');
await waitFor(client, `Boolean(window.__devinarok) && !document.querySelector('#title-screen').hidden`);
await client.evaluate(`document.querySelector('#start-button').click()`);
await waitFor(client, `Boolean(window.__devinarok.world?.mode === 'hub')`);
const proofAfter = await client.evaluate(`({
  level: window.__devinarok.character.level,
  xp: window.__devinarok.character.xp,
  gold: window.__devinarok.character.gold,
  items: window.__devinarok.inventory.length,
  clearedStages: [...window.__devinarok.character.clearedStages]
})`);
await client.evaluate(`document.querySelector('[data-panel="board"]').click()`);
const c2Unlocked = await client.evaluate(`Boolean(document.querySelector('[data-sortie="C2"]') && !document.querySelector('[data-sortie="C2"]').disabled)`);
const persistence = { before: proofBefore, afterReload: proofAfter, c2Unlocked };
await writeFile(`${outputDir}/persistence-proof.json`, `${JSON.stringify(persistence, null, 2)}\n`);

await client.evaluate(`window.__devinarok.startStage('C1')`);
await waitFor(client, `window.__devinarok.world?.stageId === 'C1'`);
await client.evaluate(`(() => { window.__devinarok.world.reward.items = [{ uid: 'lost-item', itemId: 'rusted-sword', rarity: 'rare', ilvl: 1, enhance: 0, affixes: [] }]; })()`);
await client.evaluate(`window.__devinarok.forceOutcome('death')`);
await waitFor(client, `!document.querySelector('#result-panel').hidden`);
await capture(client, 'result-death-lost-items.png');

await client.evaluate(`window.__devinarok.character.potions = 5`);
await client.evaluate(`window.__devinarok.startStage('CB')`);
await waitFor(client, `window.__devinarok.world?.stageId === 'CB'`);
await client.evaluate(`(() => {
  const api = window.__devinarok;
  const player = api.world.entities.find((entity) => entity.kind === 'player');
  player.skillCooldowns[1] = 90;
  player.skillCooldowns[2] = 120;
  player.skillCooldowns[3] = 180;
  api.render();
})()`);
await waitFor(client, `document.querySelector('#boss-intro').hidden`);
await viewport(client, 390, 844, true);
await delay(500);
await capture(client, 'mobile-combat-hud-cooldowns-potion-bossbar-390x844.png');

const errorCount = errors.length;
await writeFile(`${outputDir}/browser-errors.json`, `${JSON.stringify({ count: errorCount, errors }, null, 2)}\n`);
console.log(`Browser JS exceptions: ${errorCount}`);
console.log(`${outputDir}/persistence-proof.json`);
if (errorCount) throw new Error(`Browser reported ${errorCount} errors: ${errors.join('; ')}`);
} finally {
  client?.socket.close();
  if (browserContextId) await browser?.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  browser?.socket.close();
}

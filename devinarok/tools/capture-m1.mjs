import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const outputDir = '/home/ubuntu/devinarok-shots/m1b';
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

async function activateTouch(client) {
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 8, y: 8, id: 1 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
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

async function renderFrames(client, count = 16) {
  for (let frame = 0; frame < count; frame += 1) {
    await delay(30);
    await client.evaluate('window.__devinarok.render()');
  }
}

async function ensureVisibleEnemies(client) {
  let state = { alive: 0, spawned: 0 };
  for (let attempt = 0; attempt < 8 && (state.alive < 2 || state.spawned < 2); attempt += 1) {
    await renderTicks(client, 0, 30);
    state = await client.evaluate(`(() => {
      const enemies = window.__devinarok.world.entities.filter((entity) => entity.kind === 'enemy' && !entity.dead);
      return { alive: enemies.length, spawned: enemies.filter((entity) => (entity.spawnTicksLeft ?? 0) <= 0).length };
    })()`);
  }
  if (state.alive < 2 || state.spawned < 2) throw new Error(`Expected two living, spawned enemies; found ${state.alive} alive and ${state.spawned} spawned`);
  return state;
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
await capture(client, 'hub-npcs-desktop-1024x768');
await viewport(client, 390, 844, true);
await activateTouch(client);
await delay(400);
await capture(client, 'hub-mobile-390x844');
await capture(client, 'hub-npcs-mobile-390x844');

await viewport(client, 1024, 768);
await client.evaluate(`document.documentElement.classList.remove('touch-mode')`);
await client.evaluate(`document.querySelector('.npc-hotspot[data-panel="blacksmith"]').click()`);
await waitFor(client, `!document.querySelector('#hub-panel').hidden && document.querySelector('#hub-panel').dataset.kind === 'blacksmith'`);
const npcClickProof = await client.evaluate(`({
  opened: !document.querySelector('#hub-panel').hidden,
  panel: document.querySelector('#hub-panel').dataset.kind
})`);
await client.evaluate(`document.querySelector('#hub-panel [data-close]').click()`);
await writeFile(`${outputDir}/npc-panel-click-proof.json`, `${JSON.stringify(npcClickProof, null, 2)}\n`);

await client.evaluate(`window.__devinarok.grantDevGold(1000)`);
const swordUid = await client.evaluate(`window.__devinarok.grantDevItem({ itemId: 'rusted-sword', rarity: 'rare' })`);
const comparisonUid = await client.evaluate(`window.__devinarok.grantDevItem({ itemId: 'rusted-sword', rarity: 'legendary' })`);
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
  const enemyState = await ensureVisibleEnemies(client);
  console.log(`${stageId} capture enemies: ${enemyState.alive} alive, ${enemyState.spawned} spawned`);
  const enemyProof = await client.evaluate(`(() => {
    const api = window.__devinarok;
    const renderer = api.renderer;
    return api.world.entities.filter((entity) => entity.kind === 'enemy' && !entity.dead).map((entity) => {
      const visual = renderer.entities.get(entity.id);
      const point = new renderer.camera.position.constructor(entity.x, 1, entity.z).project(renderer.camera);
      let meshes = 0;
      let minY = Infinity;
      let maxY = -Infinity;
      visual?.root.updateMatrixWorld(true);
      visual?.root.traverse((node) => {
        if (!node.isMesh) return;
        meshes += 1;
        node.geometry.computeBoundingBox();
        const bounds = node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld);
        minY = Math.min(minY, bounds.min.y);
        maxY = Math.max(maxY, bounds.max.y);
      });
      return {
        id: entity.id,
        model: entity.model,
        x: entity.x,
        z: entity.z,
        spawnTicksLeft: entity.spawnTicksLeft,
        projected: { x: point.x, y: point.y, z: point.z },
        rootVisible: visual?.root.visible,
        meshCount: meshes,
        modelHeight: maxY - minY,
        animation: visual?.currentKey
      };
    });
  })()`);
  await writeFile(`${outputDir}/${stageId.toLowerCase()}-enemy-proof.json`, `${JSON.stringify(enemyProof, null, 2)}\n`);
  if (stageId === 'C1') {
    const desktopUi = await client.evaluate(`({
      finePointer: matchMedia('(pointer: fine)').matches,
      controlsDisplay: getComputedStyle(document.querySelector('#controls')).display,
      keyHintsDisplay: getComputedStyle(document.querySelector('#key-hints')).display
    })`);
    await writeFile(`${outputDir}/desktop-controls-proof.json`, `${JSON.stringify(desktopUi, null, 2)}\n`);
  }
  await delay(500);
  await renderFrames(client);
  await capture(client, `${stageId.toLowerCase()}-first-room-desktop-1024x768`);
  if (stageId === 'C1') {
    await viewport(client, 390, 844, true);
    await activateTouch(client);
    await renderFrames(client);
    await capture(client, 'c1-first-room-mobile-390x844');
    await viewport(client, 1024, 768);
    await client.evaluate(`document.documentElement.classList.remove('touch-mode')`);
    await client.evaluate('window.__devinarok.render()');
    await hideRoomEnemies(client);
  }
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
      api.render(previous);
    })()`);
    await capture(client, 'c1-door-open-after-clear.png');
    await client.evaluate(`(() => {
      const api = window.__devinarok;
      const player = api.world.entities.find((entity) => entity.kind === 'player');
      player.x = 0;
      player.z = 7;
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
for (const [name, shape] of [
  ['sector', { type: 'sector', originX: 0, originZ: 2, angle: 0.4, halfAngle: 0.58, range: 5.5 }],
  ['line', { type: 'line', originX: -3, originZ: 0, angle: 0.2, length: 6.5, width: 1.2 }],
  ['circle', { type: 'circle', originX: 0.5, originZ: 0, radius: 3.2 }],
  ['ring', { type: 'ring', originX: 0, originZ: 1, innerRadius: 1.7, radius: 3.4 }],
]) {
  await client.evaluate(`(() => {
    const api = window.__devinarok;
    const boss = api.world.entities.find((entity) => entity.boss);
    boss.attackPhase = 'windup';
    boss.attackWindupTicks = 30;
    boss.attackRemaining = 15;
    boss.attackShape = ${JSON.stringify(shape)};
    api.renderer.updateTelegraphs(api.world);
    api.render(structuredClone(api.world));
  })()`);
  await delay(150);
  await capture(client, `telegraph-${name}-mid-windup.png`);
}

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
await activateTouch(client);
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

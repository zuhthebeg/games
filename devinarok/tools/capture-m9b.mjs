import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const outputDir = process.env.OUTPUT_DIR ?? '/home/ubuntu/devinarok-shots/m9b';
const baseUrl = 'http://127.0.0.1:18370/devinarok/?dev=1&debug=1';
const cdpPort = process.env.CDP_PORT ?? '9224';
const phase = process.env.PHASE ?? 'before';
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
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        errors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
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
    if (response.result?.subtype === 'error') throw new Error(response.result.description);
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

async function screenshot(client, name, state) {
  await client.evaluate('window.__devinarok?.render()');
  const response = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const path = `${outputDir}/${name}-390x844.png`;
  await writeFile(path, Buffer.from(response.data, 'base64'));
  await writeFile(path.replace(/\.png$/, '.json'), `${JSON.stringify({ path, viewport: [390, 844], state }, null, 2)}\n`);
  console.log(path);
}

async function renderFrames(client, count) {
  for (let frame = 0; frame < count; frame += 1) {
    await delay(30);
    await client.evaluate('window.__devinarok?.render()');
  }
}

async function clearEffects(client) {
  await client.evaluate(`(() => {
    const renderer = window.__devinarok.renderer;
    renderer.vfx?.clear();
    for (let index = renderer.transientEffects.length - 1; index >= 0; index -= 1) {
      const effect = renderer.transientEffects[index];
      renderer.scene.remove(effect.mesh);
      effect.geometry.dispose();
      effect.material.dispose();
      renderer.transientEffects.splice(index, 1);
    }
    for (const key of [...renderer.slashes.keys()]) renderer.removeSlash(key);
    renderer.damageNumbers.forEach((effect) => effect.element.remove());
    renderer.damageNumbers = [];
    renderer.hitReactions.clear();
  })()`);
}

async function setArcherLook(client, facing) {
  await client.evaluate(`(() => {
    const api = window.__devinarok;
    const player = api.world.entities.find((entity) => entity.kind === 'player');
    player.lineage = 'skeleton_archer';
    player.family = 'crossbow';
    player.characterKind = 'rogue';
    player.facing = ${facing};
    player.look = {
      family: 'crossbow',
      weapon: '2H_Crossbow',
      weaponItem: 'grave-crossbow',
      weaponRarity: 'rare',
      offhand: null,
      helmet: true,
      head: 'patched-hood',
      headRarity: 'rare',
      cape: true,
      body: 'patched-coat',
      bodyRarity: 'rare',
      setId: null,
    };
    api.character.lineage = 'skeleton_archer';
    api.character.family = 'crossbow';
    const renderer = api.renderer;
    const canvas = renderer.canvas;
    const frustum = 8;
    renderer.frustumHeight = frustum;
    renderer.cameraFollowOffsetZ = 0.8;
    renderer.camera.left = -frustum * canvas.clientWidth / canvas.clientHeight / 2;
    renderer.camera.right = frustum * canvas.clientWidth / canvas.clientHeight / 2;
    renderer.camera.top = frustum / 2;
    renderer.camera.bottom = -frustum / 2;
    renderer.mobileCameraOverlayKey = '';
    api.renderer.camera.updateProjectionMatrix();
    api.render();
  })()`);
  await delay(250);
}

async function setHumanHoodLook(client, facing) {
  await client.evaluate(`(() => {
    const api = window.__devinarok;
    const player = api.world.entities.find((entity) => entity.kind === 'player');
    player.lineage = 'human';
    player.family = 'sword';
    player.characterKind = 'knight';
    player.facing = ${facing};
    player.look = {
      family: 'sword',
      weapon: '1H_Sword',
      weaponItem: 'rusted-sword',
      weaponRarity: 'common',
      offhand: 'Round_Shield',
      helmet: true,
      head: 'patched-hood',
      headRarity: 'rare',
      cape: false,
      body: null,
      bodyRarity: null,
      setId: null,
    };
    api.character.lineage = 'human';
    api.character.family = 'sword';
    const renderer = api.renderer;
    const canvas = renderer.canvas;
    const frustum = 8;
    renderer.frustumHeight = frustum;
    renderer.cameraFollowOffsetZ = 0.8;
    renderer.camera.left = -frustum * canvas.clientWidth / canvas.clientHeight / 2;
    renderer.camera.right = frustum * canvas.clientWidth / canvas.clientHeight / 2;
    renderer.camera.top = frustum / 2;
    renderer.camera.bottom = -frustum / 2;
    renderer.mobileCameraOverlayKey = '';
    renderer.camera.updateProjectionMatrix();
    api.render();
  })()`);
  await delay(250);
}

async function inspectArcher(client) {
  return client.evaluate(`(() => {
    const api = window.__devinarok;
    const player = api.world.entities.find((entity) => entity.kind === 'player');
    const root = api.renderer.entities.get(player.id)?.root;
    const weapon = root?.getObjectByName('2H_Crossbow');
    const hand = root?.getObjectByName('handslot.r') ?? root?.getObjectByName('handslotr');
    weapon?.updateWorldMatrix(true, false);
    hand?.updateWorldMatrix(true, false);
    const worldPosition = (node) => node ? [
      node.matrixWorld.elements[12],
      node.matrixWorld.elements[13],
      node.matrixWorld.elements[14],
    ] : null;
    return {
      mode: api.world.mode,
      lineage: player.lineage,
      family: player.family,
      headItem: player.look?.head ?? null,
      weaponParent: weapon?.parent?.name ?? null,
      weaponLocalPosition: weapon?.position.toArray() ?? null,
      weaponWorldPosition: worldPosition(weapon),
      handWorldPosition: worldPosition(hand),
      hoodScale: root?.getObjectByName('Skeleton_Rogue_Hood')?.scale.toArray() ?? null,
    };
  })()`);
}

async function captureCombat(client) {
  await client.evaluate(`(() => {
    const api = window.__devinarok;
    const player = api.world.entities.find((entity) => entity.kind === 'player');
    player.lineage = 'skeleton_knight';
    player.family = 'sword';
    player.facing = 0;
    player.look = {
      family: 'sword',
      weapon: '1H_Sword',
      weaponItem: 'rusted-sword',
      weaponRarity: 'common',
      offhand: null,
      helmet: false,
      head: null,
      cape: false,
      body: null,
      setId: null,
    };
    api.character.lineage = 'skeleton_knight';
    api.character.family = 'sword';
    api.render();
    const renderer = api.renderer;
    const event = {
      type: 'cast',
      entityId: player.id,
      playerId: player.playerId,
      castId: 'm9b-sword-ribbon',
      step: 1,
      tick: api.world.tick,
      family: 'sword',
    };
    renderer.createSlash(event);
    const effect = [...renderer.slashes.values()].find((slash) => slash.castId === event.castId);
    api.world.tick = effect.startTick + 2;
    api.render();
  })()`);
  await screenshot(client, 'sword-combo-ribbon-1', { effect: 'combo-mid-swing', frame: 1 });
  await client.evaluate(`(() => {
    const api = window.__devinarok;
    const effect = [...api.renderer.slashes.values()].find((slash) => slash.castId === 'm9b-sword-ribbon');
    api.world.tick = effect.startTick + 4;
    api.render();
  })()`);
  await screenshot(client, 'sword-combo-ribbon-2', { effect: 'combo-mid-swing', frame: 2 });

  await clearEffects(client);
  await client.evaluate(`(() => {
    const api = window.__devinarok;
    const player = api.world.entities.find((entity) => entity.kind === 'player');
    const target = {
      id: 'm9b-critical-target', kind: 'enemy', enemyKind: 'minion',
      x: player.x + 1, z: player.z, height: 1.7, maxHp: 30,
    };
    api.world.entities.push(target);
    api.renderer.createDamageNumber({ type: 'hit', targetId: target.id, damage: 48, critical: true });
    api.render();
  })()`);
  await renderFrames(client, 2);
  await screenshot(client, 'critical-damage-number', { effect: 'critical-damage-number' });

  for (const [tier, enemyKind, maxHp] of [
    ['normal', 'minion', 30],
    ['elite', 'minion', 60],
    ['boss', 'commander', 900],
  ]) {
    await clearEffects(client);
    await client.evaluate(`(() => {
      const api = window.__devinarok;
      const player = api.world.entities.find((entity) => entity.kind === 'player');
      const target = {
        id: 'm9b-death-${tier}', kind: 'enemy', enemyKind: '${enemyKind}',
        x: player.x + 0.7, z: player.z, radius: 0.65, height: 1.7, maxHp: ${maxHp},
      };
      api.world.entities.push(target);
      api.renderer.createDeathPuff({ entityId: target.id }, api.world);
      api.render();
    })()`);
    await screenshot(client, `death-${tier}-1`, { effect: 'death', tier, frame: 1 });
    await renderFrames(client, 12);
    await screenshot(client, `death-${tier}-2`, { effect: 'death', tier, frame: 2 });
  }

  await clearEffects(client);
  await client.evaluate(`(() => {
    const api = window.__devinarok;
    const player = api.world.entities.find((entity) => entity.kind === 'player');
    api.renderer.createImpact({
      kind: 'quake',
      ownerId: player.playerId,
      castSeq: 1,
      resolveTick: api.world.tick,
      shape: { originX: player.x + 0.7, originZ: player.z, radius: 1.8 },
    });
    api.render();
  })()`);
  await screenshot(client, 'quake-crack-1', { effect: 'quake-crack', frame: 1 });
  await renderFrames(client, 15);
  await screenshot(client, 'quake-crack-2', { effect: 'quake-crack', frame: 2 });
}

let browser;
let client;
let browserContextId;
try {
  const browserInfo = await fetch(`http://127.0.0.1:${cdpPort}/json/version`).then((response) => response.json());
  browser = new CdpClient(browserInfo.webSocketDebuggerUrl);
  await browser.connect();
  ({ browserContextId } = await browser.send('Target.createBrowserContext'));
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json());
  const target = targets.find((entry) => entry.id === targetId);
  if (!target?.webSocketDebuggerUrl) throw new Error('Could not attach to the M9b capture profile');
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await client.send('Page.navigate', { url: baseUrl });
  await waitFor(client, 'document.readyState === "complete" && Boolean(window.__devinarok)');
  await client.evaluate(`document.querySelector('#create-form input[name="name"]').value = 'M9bArcher'`);
  await client.evaluate(`(() => {
    document.querySelector('#create-form input[name="lineage"][value="skeleton_archer"]').checked = true;
    document.querySelector('#create-form').requestSubmit();
  })()`);
  await waitFor(client, '!document.querySelector("#character-card").hidden');

  await client.evaluate('window.__devinarok.enterHub()');
  await waitFor(client, 'window.__devinarok.world?.mode === "hub" && Boolean(window.__devinarok.renderer)');
  await client.evaluate('window.__devinarok.loop.pause()');
  for (const [facing, angle] of [[0, '0'], [Math.PI / 2, '90'], [Math.PI, '180']]) {
    await setArcherLook(client, facing);
    const diagnosis = await inspectArcher(client);
    await screenshot(client, `archer-${phase}-hub-angle-${angle}`, { phase, ...diagnosis });
  }
  for (const [facing, angle] of [[0, '0'], [Math.PI / 2, '90']]) {
    await setHumanHoodLook(client, facing);
    const humanDiagnosis = await inspectArcher(client);
    await screenshot(client, `human-hood-sword-family-hub-angle-${angle}`, { phase, ...humanDiagnosis });
  }
  await setArcherLook(client, 0);

  await client.evaluate('window.__devinarok.startStage("C1")');
  await waitFor(client, 'window.__devinarok.world?.mode === "stage" && Boolean(window.__devinarok.renderer?.entities.size)', 90000);
  await client.evaluate('window.__devinarok.loop.pause()');
  for (const [facing, angle] of [[0, '0'], [Math.PI / 2, '90'], [Math.PI, '180']]) {
    await setArcherLook(client, facing);
    const diagnosis = await inspectArcher(client);
    await screenshot(client, `archer-${phase}-stage-angle-${angle}`, { phase, ...diagnosis });
  }

  if (phase === 'after') await captureCombat(client);

  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({ outputDir, errors }, null, 2));
} finally {
  if (client?.socket) client.socket.close();
  if (browser && browserContextId) {
    try {
      await browser.send('Target.disposeBrowserContext', { browserContextId });
    } catch {}
  }
  if (browser?.socket) browser.socket.close();
}

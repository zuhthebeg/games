import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const outputDir = '/home/ubuntu/devinarok-shots/m9-vfx';
const baseUrl = 'http://127.0.0.1:18370/devinarok/?dev=1&debug=1';
const cdpPort = process.env.CDP_PORT ?? '9225';
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

async function screenshot(client, name, state = {}) {
  await client.evaluate('window.__devinarok?.render()');
  const response = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const path = `${outputDir}/${name}-390x844.png`;
  await writeFile(path, Buffer.from(response.data, 'base64'));
  const stats = await client.evaluate('window.__devinarokVfxStats?.() ?? null');
  await writeFile(path.replace(/\.png$/, '.json'), `${JSON.stringify({
    path,
    viewport: [390, 844],
    state,
    vfx: stats,
  }, null, 2)}\n`);
  console.log(path, stats ? JSON.stringify(stats) : '');
  return path;
}

async function renderFrames(client, count) {
  for (let frame = 0; frame < count; frame += 1) {
    await delay(30);
    await client.evaluate('window.__devinarok?.render()');
  }
}

async function stepTicks(client, count, buttons = 0) {
  await client.evaluate(`(async () => {
    const api = window.__devinarok;
    const player = api.world.entities.find((entity) => entity.kind === 'player');
    let seq = player.lastInput.seq + 1;
    for (let index = 0; index < ${count}; index += 1) {
      player.skillCooldowns = { 1: 0, 2: 0, 3: 0, 4: 0 };
      player.hp = player.maxHp;
      const previous = structuredClone(api.world);
      const pressed = index === 0 ? ${buttons} : 0;
      api.step({ [player.playerId]: { seq: seq++, moveX: 0, moveZ: 0, aim: 192, buttons: pressed } });
      api.render(previous);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  })()`);
}

async function configure(client, lineage, family) {
  await client.evaluate(`(() => {
    const api = window.__devinarok;
    const player = api.world.entities.find((entity) => entity.kind === 'player');
    player.lineage = '${lineage}';
    player.family = '${family}';
    player.skillCooldowns = { 1: 0, 2: 0, 3: 0, 4: 0 };
    player.skillCast = null;
    player.attack = null;
    player.attackStrike = null;
    player.hp = player.maxHp;
    api.character.lineage = '${lineage}';
    api.character.family = '${family}';
    api.updateFamilySkillControls('${family}', '${lineage}');
    api.updateHud();
  })()`);
}

async function cast(client, lineage, family, button, windupTicks, name) {
  await configure(client, lineage, family);
  await stepTicks(client, 1, button);
  await stepTicks(client, Math.max(1, windupTicks + 1));
  await screenshot(client, name, { lineage, family, button, windupTicks });
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
  if (!target?.webSocketDebuggerUrl) throw new Error('Could not attach to the fresh M9 capture profile');
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await client.send('Page.navigate', { url: baseUrl });
  await waitFor(client, `document.readyState === 'complete' && Boolean(window.__devinarok)`);
  await client.evaluate(`document.querySelector('#create-form input[name="name"]').value = 'M9Capture'`);
  await screenshot(client, 'creation-cards');
  await client.evaluate(`(() => {
    document.querySelector('#create-form input[name="lineage"][value="skeleton_mage"]').checked = true;
    document.querySelector('#create-form').requestSubmit();
  })()`);
  await waitFor(client, `!document.querySelector('#character-card').hidden`);
  await client.evaluate('window.__devinarok.enterHub()');
  await waitFor(client, `window.__devinarok.world?.mode === 'hub' && Boolean(window.__devinarok.renderer)`, 90000);
  await client.evaluate(`window.__devinarok.startStage('C1')`);
  await waitFor(client, `window.__devinarok.world?.mode === 'stage' && Boolean(window.__devinarok.renderer?.entities.size)`);
  await client.evaluate('window.__devinarok.loop.pause()');
  await client.evaluate(`(() => {
    document.querySelector('#debug-trigger')?.click();
    document.querySelector('#debug-tab-combat')?.click();
    document.querySelector('[data-debug-action="toggle-no-cooldown"]')?.click();
    document.querySelector('#debug-trigger')?.click();
  })()`);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: 8, y: 8, id: 1 }],
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.evaluate('window.__devinarok.updateHud()');

  for (const [lineage, family, name] of [
    ['skeleton_knight', 'sword', 'skill-hud-skeleton-knight-sword'],
    ['skeleton_archer', 'crossbow', 'skill-hud-skeleton-archer-crossbow'],
    ['skeleton_mage', 'staff', 'skill-hud-skeleton-mage-staff'],
  ]) {
    await configure(client, lineage, family);
    await renderFrames(client, 3);
    await screenshot(client, name, { lineage, family });
  }

  await configure(client, 'skeleton_mage', 'staff');
  await client.evaluate(`window.__devinarok.renderer.setQualityMode('high')`);
  await stepTicks(client, 1, 128);
  await stepTicks(client, 14);
  await screenshot(client, 'meteor-telegraph-mid-fall', { skill: 'meteor', quality: 'high', phase: 'mid-fall' });
  await stepTicks(client, 15);
  await screenshot(client, 'meteor-impact', { skill: 'meteor', quality: 'high', phase: 'impact' });
  await renderFrames(client, 10);
  await screenshot(client, 'meteor-impact-plus-300ms', { skill: 'meteor', quality: 'high', phase: 'aftermath-300ms' });
  await renderFrames(client, 24);
  await screenshot(client, 'meteor-impact-plus-1s', { skill: 'meteor', quality: 'high', phase: 'aftermath-1s' });

  await cast(client, 'human', 'staff', 4, 6, 'flame-field');
  await cast(client, 'human', 'staff', 8, 5, 'frost-wave');
  await cast(client, 'skeleton_archer', 'crossbow', 128, 10, 'rain-field');
  await cast(client, 'human', 'sword', 128, 14, 'quake-impact');
  await cast(client, 'skeleton_knight', 'sword', 128, 10, 'dead-burst');
  await cast(client, 'skeleton_mage', 'staff', 8, 8, 'cursed-hands');
  await cast(client, 'human', 'staff', 16, 1, 'blink-endpoints');

  await configure(client, 'skeleton_mage', 'staff');
  await client.evaluate(`(() => {
    const api = window.__devinarok;
    const player = api.world.entities.find((entity) => entity.kind === 'player');
    const enemy = api.world.entities.find((entity) => entity.kind === 'enemy' && !entity.dead);
    if (!enemy) throw new Error('No enemy available for the critical-hit capture');
    const previous = structuredClone(api.world);
    api.world.events = [{
      eventId: 'm9-critical-hit-capture',
      type: 'hit',
      castId: 'm9-critical-hit-capture',
      sourceId: player.id,
      targetId: enemy.id,
      damage: 48,
      critical: true,
      predictedLocally: false,
      guarded: false,
    }];
    api.render(previous);
  })()`);
  await renderFrames(client, 3);
  await screenshot(client, 'critical-hit-sparks', { skill: 'critical-hit-feedback', critical: true });

  await client.evaluate(`window.__devinarok.enterHub()`);
  await waitFor(client, `window.__devinarok.world?.mode === 'hub'`);
  await client.evaluate(`document.querySelector('[data-panel="inventory"]').click()`);
  await waitFor(client, `Boolean(document.querySelector('#hub-panel [data-inventory-tab="skills"]'))`);
  await client.evaluate(`document.querySelector('#hub-panel [data-inventory-tab="skills"]').click()`);
  await screenshot(client, 'inventory-skill-icons', { panel: 'inventory', tab: 'skills' });

  await client.evaluate(`window.__devinarok.startStage('C1')`);
  await waitFor(client, `window.__devinarok.world?.mode === 'stage'`);
  await client.evaluate('window.__devinarok.loop.pause()');
  await client.evaluate(`window.__devinarok.renderer.setQualityMode('low')`);
  await configure(client, 'skeleton_mage', 'staff');
  await stepTicks(client, 1, 128);
  await stepTicks(client, 29);
  await screenshot(client, 'meteor-impact-low-quality', { skill: 'meteor', quality: 'low', phase: 'impact' });

  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({ captures: 18, outputDir, errors }, null, 2));
} finally {
  if (client?.socket) client.socket.close();
  if (browser && browserContextId) {
    try {
      await browser.send('Target.disposeBrowserContext', { browserContextId });
    } catch {}
  }
  if (browser?.socket) browser.socket.close();
}

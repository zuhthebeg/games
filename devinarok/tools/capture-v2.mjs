import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const outputDir = process.argv[2] ?? '/home/ubuntu/devinarok-shots/v2';
const cdpEndpoint = 'http://127.0.0.1:9225';
const gameUrl = 'http://localhost:8000/devinarok/?dev=1';
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

async function setViewport(client, width, height, mobile = false) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
}

async function waitFor(client, expression, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await client.evaluate(expression)) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function capture(client, name) {
  const { data } = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const path = `${outputDir}/${name}.png`;
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(path);
}

const created = await fetch(`${cdpEndpoint}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json());
const client = new CdpClient(created.webSocketDebuggerUrl);
await client.connect();
await client.send('Page.enable');
await client.send('Runtime.enable');
await setViewport(client, 1024, 768);
await client.send('Page.navigate', { url: gameUrl });
await waitFor(client, `document.readyState === 'complete' && Boolean(window.__devinarok)`);
await waitFor(client, `!document.querySelector('#title-screen').hidden`);
console.log('Title layout desktop:', await client.evaluate(`JSON.stringify({ viewport: [innerWidth, innerHeight], page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], marks: document.querySelectorAll('.title-mark').length })`));
await capture(client, 'title-desktop-1024x768');
await setViewport(client, 1024, 576);
await delay(250);
console.log('Title layout short viewport:', await client.evaluate(`JSON.stringify({ viewport: [innerWidth, innerHeight], page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], marks: document.querySelectorAll('.title-mark').length })`));
await capture(client, 'title-short-height-1024x576');
await setViewport(client, 390, 844, true);
await delay(300);
console.log('Title layout mobile:', await client.evaluate(`JSON.stringify({ viewport: [innerWidth, innerHeight], page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], marks: document.querySelectorAll('.title-mark').length })`));
await capture(client, 'title-mobile-390x844');

await setViewport(client, 1024, 768);
await client.evaluate(`(() => {
  const form = document.querySelector('#create-form');
  if (!form.hidden) {
    form.querySelector('input[name="name"]').value = 'CaptureKnight';
    form.requestSubmit();
  }
})()`);
await waitFor(client, `!document.querySelector('#character-card').hidden`);
await client.evaluate(`document.querySelector('#start-button').click()`);
await waitFor(client, `window.__devinarok.renderer && window.__devinarok.world && window.__devinarok.renderer.entities.size > 0`, 90000);
await client.evaluate(`(() => {
  const world = window.__devinarok.world;
  const player = world.entities.find((entity) => entity.kind === 'player');
  const enemies = world.entities.filter((entity) => entity.kind === 'enemy' && !entity.dead);
  enemies.slice(0, 2).forEach((enemy, index) => {
    enemy.x = player.x + (index === 0 ? -2.5 : 2.5);
    enemy.z = player.z - 2.7;
    enemy.spawnTicksLeft = 0;
    enemy.invulnerable = false;
    enemy.attackPhase = null;
    enemy.attackRemaining = 0;
    enemy.attackShape = null;
    enemy.attackCooldownTicks = 0;
  });
})()`);
await waitFor(client, `window.__devinarok.world.entities.filter((entity) => entity.kind === 'enemy' && !entity.dead).length >= 2 && window.__devinarok.world.entities.some((entity) => entity.attackPhase === 'windup')`, 60000);
await client.evaluate(`(() => {
  const api = window.__devinarok;
  const enemy = api.world.entities.find((entity) => entity.attackPhase === 'windup');
  if (enemy) enemy.attackRemaining = Math.max(1, Math.floor(enemy.attackWindupTicks / 2));
  api.loop.pause();
  api.render(api.world);
})()`);
await capture(client, 'arena-desktop-1024x768');

const firstHit = await client.evaluate(`(async () => {
  const api = window.__devinarok;
  api.loop.pause();
  const world = api.world;
  const player = world.entities.find((entity) => entity.kind === 'player');
  const minion = world.entities.find((entity) => entity.kind === 'enemy' && entity.enemyKind === 'Skeleton_Minion' && !entity.dead);
  if (!minion) throw new Error('No live Skeleton_Minion for the combo proof');
  player.x = 0;
  player.z = 8;
  player.facing = -Math.PI / 2;
  player.attack = null;
  player.hp = player.maxHp;
  player.dead = false;
  player.respawnTick = 0;
  player.iFrames = 0;
  player.hitFlashTicks = 0;
  player.dodgeTicks = 0;
  player.previousButtons = 0;
  minion.x = 0;
  minion.z = 6.8;
  minion.hp = minion.maxHp = 3;
  minion.dead = false;
  minion.deathTicks = 0;
  minion.spawnTicksLeft = 0;
  minion.invulnerable = false;
  minion.attackPhase = null;
  minion.attackRemaining = 0;
  minion.attackShape = null;
  minion.attackCooldownTicks = 1000;
  let seq = player.lastInput.seq + 1;
  const firstEventId = world.nextEventId;
  const tick = (buttons) => {
    const previous = structuredClone(world);
    api.step({ [player.playerId]: { seq: seq++, moveX: 0, moveZ: 0, aim: 192, buttons } });
    api.render(previous);
  };
  tick(api.buttons.ATTACK);
  for (let count = 0; count < 30; count += 1) {
    if (world.events.some((event) => event.eventId >= firstEventId && event.type === 'hit' && event.targetId === minion.id)) break;
    tick(0);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const hit = world.events.find((event) => event.eventId >= firstEventId && event.type === 'hit' && event.targetId === minion.id);
  if (!hit || api.renderer.damageNumbers.length === 0) throw new Error('The first combo hit did not render its damage number');
  const proof = { minionId: minion.id, castId: hit.castId, damage: hit.damage, hitTick: hit.tick, slashCount: api.renderer.slashes.size };
  if (proof.slashCount === 0) throw new Error('The active combo tick did not render its slash trail');
  return proof;
})()`);
await delay(120);
await capture(client, 'arena-desktop-mid-swing-slash-damage');

const comboProof = await client.evaluate(`(async () => {
  const api = window.__devinarok;
  const world = api.world;
  const player = world.entities.find((entity) => entity.kind === 'player');
  const minion = world.entities.find((entity) => entity.id === ${firstHit.minionId});
  let seq = player.lastInput.seq + 1;
  const tick = (buttons) => {
    const previous = structuredClone(world);
    api.step({ [player.playerId]: { seq: seq++, moveX: 0, moveZ: 0, aim: 192, buttons } });
    api.render(previous);
  };
  const startEventId = world.nextEventId;
  for (let step = 1; step < api.comboTimelines.length; step += 1) {
    const timeline = api.comboTimelines[player.attack.step - 1];
    while (player.attack && !(player.attack.phase === 'recovery' && player.attack.phaseTick >= timeline.recoveryTicks - timeline.chainWindowTicks)) tick(0);
    tick(api.buttons.ATTACK);
    tick(0);
    while (player.attack && player.attack.step === step && !minion.dead) tick(0);
    while (player.attack && !minion.dead && !world.events.some((event) => event.type === 'hit' && event.targetId === minion.id && event.eventId >= startEventId && event.castId === player.attack?.castId)) tick(0);
  }
  while (player.attack && !minion.dead) tick(0);
  const hits = world.events.filter((event) => event.type === 'hit' && event.targetId === minion.id && event.eventId >= startEventId);
  const death = world.events.find((event) => event.type === 'death' && event.entityId === minion.id && event.eventId >= startEventId);
  const visual = api.renderer.entities.get(minion.id);
  for (let index = 0; index < 40 && world.entities.some((entity) => entity.id === minion.id); index += 1) tick(0);
  const visualRemoved = !api.renderer.entities.has(minion.id);
  return {
    minionId: minion.id,
    hitDamage: [${firstHit.damage}, ...hits.map((event) => event.damage)],
    castIds: ['${firstHit.castId}', ...hits.map((event) => event.castId)],
    dead: minion.dead,
    deathCastId: death?.castId,
    visualRemoved,
    mixerActionsRemaining: visual?.mixer._actions.length,
  };
})()`);
if (!comboProof.dead || JSON.stringify(comboProof.hitDamage) !== '[1,1,2]' || comboProof.deathCastId !== comboProof.castIds.at(-1) || !comboProof.visualRemoved || comboProof.mixerActionsRemaining !== 0) {
  throw new Error(`Combo proof failed: ${JSON.stringify(comboProof)}`);
}
await writeFile(`${outputDir}/combo-proof.json`, `${JSON.stringify({ firstHit, comboProof }, null, 2)}\n`);
console.log(`${outputDir}/combo-proof.json`);

await setViewport(client, 390, 844, true);
await delay(500);
await client.evaluate(`window.__devinarok.render(window.__devinarok.world)`);
await delay(100);
await capture(client, 'arena-mobile-controls-390x844');
await setViewport(client, 1024, 768);
await delay(300);
await client.evaluate(`(() => {
  const api = window.__devinarok;
  const world = api.world;
  const player = world.entities.find((entity) => entity.kind === 'player');
  const skeleton = api.spawnEnemy('Skeleton_Minion');
  skeleton.x = player.x - 1.5;
  skeleton.z = player.z - 2.8;
  skeleton.spawnTicksLeft = 0;
  skeleton.invulnerable = false;
  skeleton.attackCooldownTicks = 1000;
  api.render(world);
})()`);

for (const [clip, file] of [['skeleton', 'skeleton-clip-comparison-skeleton'], ['humanoid', 'skeleton-clip-comparison-humanoid']]) {
  const clipName = clip === 'skeleton' ? 'Idle_Combat' : '1H_Melee_Attack_Chop';
  const accepted = await client.evaluate(`(async () => {
    const api = window.__devinarok;
    const accepted = api.setEnemyClipPreview('${clip}', '${clipName}');
    for (let index = 0; index < 30; index += 1) {
      api.render(api.world);
      await new Promise((resolve) => setTimeout(resolve, 33));
    }
    return accepted;
  })()`);
  if (!accepted) throw new Error(`Could not set ${clip} preview to ${clipName}`);
  await capture(client, file);
}

console.log(`Browser exceptions: ${errors.length}`);
client.socket.close();
await fetch(`${cdpEndpoint}/json/close/${created.id}`).catch(() => {});

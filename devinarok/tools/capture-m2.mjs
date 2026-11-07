import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const outputDir = '/home/ubuntu/devinarok-shots/m2';
await mkdir(outputDir, { recursive: true });
const browserInfo = await fetch('http://127.0.0.1:9225/json/version').then((response) => response.json());
const browser = new WebSocket(browserInfo.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  browser.addEventListener('open', resolve, { once: true });
  browser.addEventListener('error', reject, { once: true });
});
let id = 0;
const pending = new Map();
browser.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
});
function command(method, params = {}) {
  const commandId = ++id;
  return new Promise((resolve, reject) => {
    pending.set(commandId, { resolve, reject });
    browser.send(JSON.stringify({ id: commandId, method, params }));
  });
}

class Page {
  constructor(socket) {
    this.socket = new WebSocket(socket);
    this.id = 0;
    this.pending = new Map();
    this.exceptions = [];
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === 'Runtime.exceptionThrown') this.exceptions.push(message.params.exceptionDetails.text);
      if (!message.id) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
    });
  }
  async ready() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Log.enable');
  }
  send(method, params = {}) {
    const requestId = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  }
  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  }
  async wait(expression, timeout = 60000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      if (await this.evaluate(expression)) return;
      await delay(150);
    }
    throw new Error(`Timed out: ${expression}`);
  }
  async viewport(width, height, mobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  }
  async capture(name) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(`${outputDir}/${name}.png`, Buffer.from(shot.data, 'base64'));
  }
}

const captured = new Set();
async function capture(page, name) {
  await page.capture(name);
  captured.add(name);
}

async function openContext(name) {
  const { browserContextId } = await command('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await command('Target.createTarget', { url: 'about:blank', browserContextId });
  const targets = await fetch('http://127.0.0.1:9225/json/list').then((response) => response.json());
  const target = targets.find((entry) => entry.id === targetId);
  const page = new Page(target.webSocketDebuggerUrl);
  await page.ready();
  await page.send('Page.navigate', {
    url: 'http://127.0.0.1:8000/devinarok/?dev=1&server=ws://127.0.0.1:8788',
  });
  await page.wait('document.readyState === "complete"');
  await page.wait('window.__devinarok && document.querySelector("#create-form input[name=name]")');
  await page.evaluate(`(() => {
    const form = document.querySelector('#create-form');
    const field = form?.querySelector('input[name="name"]');
    if (form && field) {
      field.value = '${name}';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
    }
  })()`);
  await page.wait('window.__devinarok?.character?.name');
  await page.evaluate('window.__devinarok.enterHub()');
  await page.wait('document.querySelector("#hub-ui") && !document.querySelector("#hub-ui").hidden');
  await page.wait('Boolean(document.querySelector("#hub-ui [data-panel=board]"))');
  await page.evaluate('document.querySelector("#hub-ui [data-panel=board]").click()');
  await page.wait('!document.querySelector("#hub-panel").hidden');
  return { page, browserContextId };
}

const [first, second] = await Promise.all([openContext('파티기사1'), openContext('파티기사2')]);
const a = first.page;
const b = second.page;
await Promise.all([
  a.evaluate('window.__devinarok.character.potions = 5'),
  b.evaluate('window.__devinarok.character.potions = 5'),
]);
await a.evaluate('window.__devinarok.createParty()');
await a.wait('Boolean(window.__devinarok.party?.roomCode && window.__devinarok.party?.lobby)');
const code = await a.evaluate('window.__devinarok.party.roomCode');
await b.evaluate(`window.__devinarok.joinParty('${code}')`);
await b.wait('Boolean(window.__devinarok.party?.lobby)');
await a.viewport(1024, 768);
await b.viewport(390, 844, true);
await capture(a, 'lobby-desktop');
await capture(b, 'lobby-mobile-390x844');
await a.evaluate('window.__devinarok.party.setReady(true)');
await b.evaluate('window.__devinarok.party.setReady(true)');
await a.wait('window.__devinarok.party.lobby?.players?.every((player) => player.ready)');
await a.evaluate('window.__devinarok.party.start()');
await Promise.all([
  a.wait('Boolean(window.__devinarok.party.stageWorld && window.__devinarok.party.lastSnapshot && window.__devinarok.renderer)'),
  b.wait('Boolean(window.__devinarok.party.stageWorld && window.__devinarok.party.lastSnapshot && window.__devinarok.renderer)'),
]);
await Promise.all([a.evaluate('window.__devinarok.renderer.ready'), b.evaluate('window.__devinarok.renderer.ready')]);

const installBot = `(() => {
  const api = window.__devinarok;
  window.__devinarok.partyInputProvider = () => {
    const seq = (window.__partySeq = (window.__partySeq ?? 0) + 1);
    const party = api.party;
    const estimate = party.session.clock.getEstimate(performance.now());
    const view = party.interpolation.sample(estimate);
    const viewTick = Math.round(view.renderTick);
    const viewed = party.interpolation.sampleAtRenderTick(viewTick);
    const activeEnemyIds = viewed.activeEnemyIds ? new Set(viewed.activeEnemyIds) : null;
    const player = party.predictor.getPlayer();
    if (!player) return { seq, moveX: 0, moveZ: 0, aim: 0, buttons: 0 };
    const enemies = viewed.entities
      .filter((entity) => entity.kind === 'enemy' && !entity.dead && entity.state !== 'dead')
      .filter((entity) => !entity.invulnerable && (entity.spawnTicksLeft ?? 0) <= 0)
      .filter((entity) => !activeEnemyIds || activeEnemyIds.has(entity.id));
    let target = null;
    let targetDistance = Infinity;
    for (const enemy of enemies) {
      const distance = Math.hypot(enemy.x - player.x, enemy.z - player.z);
      if (distance < targetDistance) { target = enemy; targetDistance = distance; }
    }
    const localWorld = party.stageWorld;
    const roomIndex = party.lastSnapshot.roomIndex ?? localWorld.roomIndex;
    const room = localWorld.arena.rooms[roomIndex];
    const door = localWorld.arena.doors.find((entry) => entry.fromRoom === room?.id);
    let moveX = 0, moveZ = 0, buttons = 0;
    let dx = target ? target.x-player.x : 0, dz = target ? target.z-player.z : 0;
    const angleDelta = (left,right) => {
      let value=(left-right)%(Math.PI*2);
      if(value>Math.PI)value-=Math.PI*2;
      if(value< -Math.PI)value+=Math.PI*2;
      return value;
    };
    const inside = (shape, point, radius) => {
      if (!shape) return false;
      const sx=point.x-shape.originX, sz=point.z-shape.originZ;
      if(shape.type==='circle') return Math.hypot(sx,sz)<=shape.radius+radius;
      if(shape.type==='circles') return shape.circles.some((circle)=>Math.hypot(point.x-circle.x,point.z-circle.z)<=circle.radius+radius);
      if(shape.type==='sector') return Math.hypot(sx,sz)<=shape.range+radius && Math.abs(angleDelta(Math.atan2(sz,sx),shape.angle))<=shape.halfAngle;
      if(shape.type==='line') {
        const forward=sx*Math.cos(shape.angle)+sz*Math.sin(shape.angle);
        const side=Math.abs(-sx*Math.sin(shape.angle)+sz*Math.cos(shape.angle));
        return forward>=-radius&&forward<=shape.length+radius&&side<=shape.width/2+radius;
      }
      return false;
    };
    const threat = enemies.find((enemy) => enemy.attackPhase === 'windup' && enemy.attackRemaining > 0 && (
      inside(enemy.attackShape, player, player.radius ?? 0.32) ||
      Math.hypot(enemy.x - player.x, enemy.z - player.z) < 2.8
    ));
    let aim = target ? Math.round(Math.atan2(dz, dx) / (2 * Math.PI) * 256) & 255 : player.lastInput?.aim ?? 0;
    if (threat) {
      const shape=threat.attackShape;
      let dodgeX=player.x-(shape.originX ?? threat.x), dodgeZ=player.z-(shape.originZ ?? threat.z);
      if(Math.hypot(dodgeX,dodgeZ)<0.01){dodgeX=-(threat.z-player.z);dodgeZ=threat.x-player.x;}
      const length=Math.hypot(dodgeX,dodgeZ)||1;
      moveX=Math.round(dodgeX/length*127); moveZ=Math.round(dodgeZ/length*127);
      if ((player.dodgeCooldownTicks ?? 0) === 0) buttons|=api.buttons.DODGE;
      aim=Math.round(Math.atan2(dodgeZ,dodgeX)/(2*Math.PI)*256)&255;
    } else if (party.lastSnapshot.roomCleared) {
      if (door) {
        dx=door.x-player.x; dz=door.z-player.z;
        const distance=Math.hypot(dx,dz);
        if(distance>0.75){moveX=Math.round(dx/distance*127);moveZ=Math.round(dz/distance*127);aim=Math.round(Math.atan2(dz,dx)/(2*Math.PI)*256)&255;}
      }
    } else if (target) {
      if(targetDistance>1.35){moveX=Math.round(dx/targetDistance*127);moveZ=Math.round(dz/targetDistance*127);}
      else if(!player.attack&&!player.skillCast)buttons|=api.buttons.ATTACK;
    }
    if(!threat&&player.hp<player.maxHp*0.8&&player.potions>0&&player.potionCooldownTicks===0&&player.potionTicks===0&&!buttons)buttons|=api.buttons.POTION;
    const stats = window.__partyDriverStats ??= { inputs: 0, attacks: 0, dodges: 0, potions: 0, trace: [] };
    stats.inputs += 1;
    if(buttons & api.buttons.ATTACK) stats.attacks += 1;
    if(buttons & api.buttons.DODGE) stats.dodges += 1;
    if(buttons & api.buttons.POTION) stats.potions += 1;
    if (stats.inputs % 30 === 0) {
      stats.trace.push({
        seq, hp: player.hp, maxHp: player.maxHp, potions: player.potions,
        x: player.x, z: player.z, moveX, moveZ, buttons, targetDistance,
        target: target?.id ?? null, attack: Boolean(player.attack), skillCast: Boolean(player.skillCast),
        dodgeCooldownTicks: player.dodgeCooldownTicks, threat: threat?.id ?? null,
      });
    }
    return { seq, moveX, moveZ, aim, buttons };
  };
})()`;
await Promise.all([a.evaluate(installBot), b.evaluate(installBot)]);
await a.viewport(1024, 768);
await b.viewport(390, 844, true);
await capture(a, 'two-player-combat-desktop');
await capture(b, 'two-player-combat-mobile-390x844');
const deadline = Date.now() + 240000;
let downedShot = false;
let doorShot = false;
let reconnectShot = false;
const reconnectAt = Date.now() + 15000;
while (Date.now() < deadline) {
  const state = await a.evaluate(`({
    downed: window.__devinarok.getPartyWorld()?.entities.some((entity)=>entity.kind==='player'&&entity.downed),
    door: Boolean(window.__devinarok.getPartyWorld()?.doorCountdown),
    done: Boolean(window.__devinarok.party.result),
  })`);
  if (state.downed && !downedShot) { await capture(a, 'downed-revive-ring'); downedShot = true; }
  if (state.door && !doorShot) { await capture(a, 'door-countdown'); doorShot = true; }
  if (!reconnectShot && Date.now() > reconnectAt) {
    await b.evaluate('window.__devinarok.party.session.socket.close()');
    await delay(180);
    await capture(b, 'reconnect-overlay');
    reconnectShot = true;
  }
  if (state.done) break;
  await delay(100);
}
await a.wait('Boolean(window.__devinarok.party.result)', 10000);
await a.wait('!document.querySelector("#result-panel").hidden', 10000);
await capture(a, 'result-player-1');
await b.wait('Boolean(window.__devinarok.party.result)', 10000);
await b.wait('!document.querySelector("#result-panel").hidden', 10000);
await capture(b, 'result-player-2');
const rewardsBeforeReload = [
  await a.evaluate('({gold:window.__devinarok.character.gold,xp:window.__devinarok.character.xp})'),
  await b.evaluate('({gold:window.__devinarok.character.gold,xp:window.__devinarok.character.xp})'),
];
const runStates = [
  await a.evaluate(`({
    outcome: window.__devinarok.party.result?.outcome,
    players: window.__devinarok.party.lastSnapshot?.ents?.filter((entity) => entity.kind === 'player').map(({playerId,hp,potions,downed}) => ({playerId,hp,potions,downed})),
    roomIndex: window.__devinarok.party.lastSnapshot?.roomIndex,
    driver: window.__partyDriverStats,
  })`),
  await b.evaluate(`({
    outcome: window.__devinarok.party.result?.outcome,
    players: window.__devinarok.party.lastSnapshot?.ents?.filter((entity) => entity.kind === 'player').map(({playerId,hp,potions,downed}) => ({playerId,hp,potions,downed})),
    roomIndex: window.__devinarok.party.lastSnapshot?.roomIndex,
    driver: window.__partyDriverStats,
  })`),
];
await Promise.all([a.evaluate('location.reload()'), b.evaluate('location.reload()')]);
await Promise.all([
  a.wait('window.__devinarok?.character?.name'),
  b.wait('window.__devinarok?.character?.name'),
]);
const report = {
  roomCode: code,
  exceptions: [...a.exceptions, ...b.exceptions],
  rewardsAfterReload: [
    await a.evaluate('({gold:window.__devinarok.character.gold,xp:window.__devinarok.character.xp})'),
    await b.evaluate('({gold:window.__devinarok.character.gold,xp:window.__devinarok.character.xp})'),
  ],
  rewardsBeforeReload,
  runStates,
  captures: [...captured],
};
await writeFile(`${outputDir}/capture-summary.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

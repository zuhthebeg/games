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
    await this.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await this.send('Page.setWebLifecycleState', { state: 'active' });
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

const installBot = `(() => {
  const api = window.__devinarok;
  const stats = window.__partyDriverStats = {
    inputs: 0,
    attacks: 0,
    dodges: 0,
    potions: 0,
    trace: [],
    visibility: { state: document.visibilityState, focused: document.hasFocus() },
  };
  const provider = () => {
    const next = api.getNetBotInput();
    stats.inputs += 1;
    if (next.buttons & api.buttons.ATTACK) stats.attacks += 1;
    if (next.buttons & api.buttons.DODGE) stats.dodges += 1;
    if (next.buttons & api.buttons.POTION) stats.potions += 1;
    if (stats.inputs % 30 === 0) {
      const player = api.party.predictor.getPlayer();
      stats.trace.push({
        inputs: stats.inputs,
        hp: player.hp,
        maxHp: player.maxHp,
        potions: player.potions,
        x: player.x,
        z: player.z,
        moveX: next.moveX,
        moveZ: next.moveZ,
        buttons: next.buttons,
        viewTick: next.viewTick,
        serverTick: api.party.lastSnapshot?.tick,
        attack: Boolean(player.attack),
        dodgeCooldownTicks: player.dodgeCooldownTicks,
      });
    }
    return next;
  };
  window.__m2NetBotProvider = provider;
  const installed = api.setPartyInputProvider(provider);
  if (!installed) throw new Error('Dev input provider could not be installed');
})()`;
await Promise.all([a.evaluate(installBot), b.evaluate(installBot)]);
const hudOnly = process.argv.includes('--hud-only');
let inputDriverBusy = false;
let inputDriverCalls = 0;
const inputDriverCounts = [0, 0];
const inputDriverFalse = [0, 0];
const inputDriverErrors = [];
const batchInput = `(() => {
  let sent = 0;
  while (sent < 30 && window.__devinarok.tickPartyInput()) sent += 1;
  return sent;
})()`;
const inputDriver = hudOnly ? null : setInterval(() => {
  if (inputDriverBusy) return;
  inputDriverBusy = true;
  Promise.all([a.evaluate(batchInput), b.evaluate(batchInput)]).then((counts) => {
    inputDriverCalls += 1;
    for (let index = 0; index < counts.length; index += 1) {
      inputDriverCounts[index] += counts[index];
      if (counts[index] < 30) inputDriverFalse[index] += 1;
    }
  }).catch((error) => {
    inputDriverErrors.push(error.message);
  }).finally(() => {
    inputDriverBusy = false;
  });
}, 1000);
await Promise.all([a.evaluate('window.__devinarok.renderer.ready'), b.evaluate('window.__devinarok.renderer.ready')]);
await a.viewport(1024, 768);
await b.viewport(390, 844, true);
await capture(a, 'two-player-combat-desktop');
await capture(b, 'two-player-combat-mobile-390x844');
if (hudOnly) {
  console.log(JSON.stringify({
    roomCode: code,
    exceptions: [...a.exceptions, ...b.exceptions],
    captures: [...captured],
  }, null, 2));
  process.exit(0);
}
const deadline = Date.now() + 240000;
let downedShot = false;
let doorShot = false;
let reconnectShot = false;
let reconnectDiagnostics = null;
let reviveAssistStarted = false;
const reconnectAt = Date.now() + 30000;
while (Date.now() < deadline) {
  const state = await a.evaluate(`({
    downedPlayer: window.__devinarok.party.lastSnapshot?.ents?.find((entity)=>entity.kind==='player'&&entity.downed)?.playerId ?? null,
    reviveProgress: (() => {
      const client = window.__devinarok.party;
      const downed = client.lastSnapshot?.ents?.find((entity)=>entity.kind==='player'&&entity.downed);
      return downed ? client.reviveProgress.get(downed.id)?.progress ?? 0 : 0;
    })(),
    door: Boolean(window.__devinarok.getPartyWorld()?.doorCountdown),
    done: Boolean(window.__devinarok.party.result),
  })`);
  if (!state.downedPlayer && reviveAssistStarted) {
    await Promise.all([
      a.evaluate('window.__devinarok.setPartyInputProvider(window.__m2NetBotProvider)'),
      b.evaluate('window.__devinarok.setPartyInputProvider(window.__m2NetBotProvider)'),
    ]);
    reviveAssistStarted = false;
  }
  if (state.downedPlayer && !state.reviveProgress && !reviveAssistStarted) {
    const assist = `(() => {
      const api = window.__devinarok;
      api.setPartyInputProvider(() => {
        const normal = window.__m2NetBotProvider();
        const client = api.party;
        const player = client.predictor.getPlayer();
        const downed = client.lastSnapshot?.ents?.find((entity)=>entity.kind==='player'&&entity.downed);
        if (!player || !downed || downed.playerId === client.playerId) return normal;
        const dx = downed.x - player.x;
        const dz = downed.z - player.z;
        const distance = Math.hypot(dx, dz);
        if (distance <= 1.25) {
          return {
            ...normal,
            moveX: 0,
            moveZ: 0,
            buttons: normal.buttons & (api.buttons.ATTACK | api.buttons.POTION),
          };
        }
        return {
          ...normal,
          moveX: Math.round(dx / distance * 127),
          moveZ: Math.round(dz / distance * 127),
          buttons: normal.buttons & (api.buttons.ATTACK | api.buttons.DODGE | api.buttons.POTION),
        };
      });
    })()`;
    await Promise.all([a.evaluate(assist), b.evaluate(assist)]);
    reviveAssistStarted = true;
  }
  if (state.downedPlayer && !state.done && state.reviveProgress > 0 && state.reviveProgress < 60 && !downedShot) {
    const downedIsA = await a.evaluate(
      `window.__devinarok.party.playerId === ${JSON.stringify(state.downedPlayer)}`,
    );
    await capture(downedIsA ? a : b, 'downed-revive-ring');
    downedShot = true;
  }
  if (state.door && !doorShot) { await capture(a, 'door-countdown'); doorShot = true; }
  if (!reconnectShot && doorShot && !state.downedPlayer && Date.now() > reconnectAt) {
    await b.evaluate(`(() => {
      const session = window.__devinarok.party.session;
      window.__m2ReconnectStatuses = [];
      const scheduleTimeout = session.setTimeoutFn;
      session.__m2ScheduleTimeout = scheduleTimeout;
      session.setTimeoutFn = (callback, ms) => scheduleTimeout(callback, Math.max(ms, 3000));
      const onStatus = session.onStatus;
      session.onStatus = (status, ...args) => {
        window.__m2ReconnectStatuses.push(status);
        return onStatus(status, ...args);
      };
      session.socket.addEventListener('close', (event) => {
        window.__m2SocketClose = { code: event.code, reason: event.reason, wasClean: event.wasClean };
      }, { once: true });
      session.socket.close();
    })()`);
    try {
      await b.wait('!document.querySelector("#party-network-overlay").hidden && document.querySelector("#party-network-overlay").textContent.includes("재연결 중")', 3000);
      await capture(b, 'reconnect-overlay');
      reconnectShot = true;
    } catch {
      reconnectDiagnostics = await b.evaluate(`({
        status: window.__devinarok.party.status,
        socketReadyState: window.__devinarok.party.session.socket?.readyState ?? null,
        overlayHidden: document.querySelector("#party-network-overlay").hidden,
        overlayText: document.querySelector("#party-network-overlay").textContent,
        statuses: window.__m2ReconnectStatuses,
        socketClose: window.__m2SocketClose ?? null,
      })`);
    } finally {
      await b.evaluate(`(() => {
        const session = window.__devinarok.party.session;
        if (session.__m2ScheduleTimeout) {
          session.setTimeoutFn = session.__m2ScheduleTimeout;
          delete session.__m2ScheduleTimeout;
        }
      })()`);
    }
  }
  if (state.done) break;
  await delay(100);
}
clearInterval(inputDriver);
while (inputDriverBusy) await delay(5);
await Promise.all([
  a.evaluate('window.__devinarok.setPartyInputProvider(window.__m2NetBotProvider)'),
  b.evaluate('window.__devinarok.setPartyInputProvider(window.__m2NetBotProvider)'),
]);
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
    driver: {
      ...window.__partyDriverStats,
      serverTick: window.__devinarok.party.lastSnapshot?.tick,
      serverAck: window.__devinarok.party.lastSnapshot?.ack,
      status: window.__devinarok.party.status,
    },
  })`),
  await b.evaluate(`({
    outcome: window.__devinarok.party.result?.outcome,
    players: window.__devinarok.party.lastSnapshot?.ents?.filter((entity) => entity.kind === 'player').map(({playerId,hp,potions,downed}) => ({playerId,hp,potions,downed})),
    roomIndex: window.__devinarok.party.lastSnapshot?.roomIndex,
    driver: {
      ...window.__partyDriverStats,
      serverTick: window.__devinarok.party.lastSnapshot?.tick,
      serverAck: window.__devinarok.party.lastSnapshot?.ack,
      status: window.__devinarok.party.status,
    },
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
  jsExceptionCount: a.exceptions.length + b.exceptions.length,
  rewardsAfterReload: [
    await a.evaluate('({gold:window.__devinarok.character.gold,xp:window.__devinarok.character.xp})'),
    await b.evaluate('({gold:window.__devinarok.character.gold,xp:window.__devinarok.character.xp})'),
  ],
  rewardsBeforeReload,
  runStates,
  captures: [...captured],
  reconnectDiagnostics,
  inputDriver: {
    batchSize: 30,
    calls: inputDriverCalls,
    inputs: inputDriverCounts,
    incompleteBatches: inputDriverFalse,
    errors: inputDriverErrors,
  },
};
report.missingCaptures = [
  'lobby-desktop',
  'lobby-mobile-390x844',
  'two-player-combat-desktop',
  'two-player-combat-mobile-390x844',
  'downed-revive-ring',
  'door-countdown',
  'reconnect-overlay',
  'result-player-1',
  'result-player-2',
].filter((name) => !captured.has(name));
await writeFile(`${outputDir}/capture-summary.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const outputDir = '/home/ubuntu/devinarok-shots/m2';
const doorOnly = process.argv.includes('--door-only');
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
  async capture(name, render = true) {
    if (render) await this.evaluate('window.__devinarok?.renderPartyFrame?.()');
    const shot = await this.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: false,
      captureBeyondViewport: false,
      optimizeForSpeed: true,
    });
    await writeFile(`${outputDir}/${name}.png`, Buffer.from(shot.data, 'base64'));
  }
}

const captured = new Set();
const captureTimings = [];
async function capture(page, name, render = true) {
  const startedAt = Date.now();
  await page.capture(name, render);
  captureTimings.push({
    name,
    durationMs: Date.now() - startedAt,
  });
  captured.add(name);
}

const sceneCaptureErrors = [];
async function capturePartyState(page, name, visibleExpression) {
  try {
    await page.wait(visibleExpression, 10000);
    const frozen = await page.evaluate(`(() => {
      if (!(${visibleExpression})) return false;
      const api = window.__devinarok;
      if (!api.setPartyHudCaptureFreeze(true)) return false;
      api.renderPartyFrame();
      return true;
    })()`);
    if (!frozen) return;
    try {
      await capture(page, name, false);
    } finally {
      await page.evaluate('window.__devinarok.setPartyHudCaptureFreeze(false)');
    }
  } catch (error) {
    sceneCaptureErrors.push({ name, error: error.message });
  }
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
const tracePongs = `(() => {
  const client = window.__devinarok.party;
  const clock = client.session.clock;
  const observePong = clock.observePong.bind(clock);
  window.__m2ClockTrace = [];
  clock.observePong = (pong, receivedAtMs) => {
    const samplesBefore = clock.samples;
    const accepted = observePong(pong, receivedAtMs);
    window.__m2ClockTrace.push({
      c: pong.c,
      tick: pong.t,
      receivedAtMs,
      accepted,
      samplesBefore,
      samplesAfter: clock.samples,
      estimate: clock.getEstimate(receivedAtMs),
      runId: client.runId,
      snapshotTick: client.lastSnapshot?.tick ?? null,
    });
    return accepted;
  };
})()`;
await Promise.all([a.evaluate(tracePongs), b.evaluate(tracePongs)]);
await a.viewport(1024, 768);
await b.viewport(390, 844, true);
if (!doorOnly) {
  await capture(a, 'lobby-desktop');
  await capture(b, 'lobby-mobile-390x844');
}
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
    inputSeqAtInstall: api.partyInputSeq,
    inputTrace: [],
    serverTrace: [],
    visibility: { state: document.visibilityState, focused: document.hasFocus() },
  };
  const seenEventIds = new Set();
  const provider = (seq) => {
    const next = api.getNetBotInput();
    stats.inputs += 1;
    if (next.buttons & api.buttons.ATTACK) stats.attacks += 1;
    if (next.buttons & api.buttons.DODGE) stats.dodges += 1;
    if (next.buttons & api.buttons.POTION) stats.potions += 1;
    const client = api.party;
    const player = client.predictor.getPlayer();
    const pendingSeqs = [...client.session.inputs.keys()];
    const clockTick = client.session.clock.getEstimate(performance.now());
    const serverSnapshot = client.lastSnapshot;
    stats.inputTrace.push({
      seq,
      atMs: performance.now(),
      buttons: next.buttons,
      viewTick: next.viewTick,
      clockTick,
      roomTick: serverSnapshot?.tick ?? null,
      serverAck: serverSnapshot?.ack ?? null,
      ackLag: Number.isSafeInteger(serverSnapshot?.ack) ? seq - serverSnapshot.ack : null,
      hp: player.hp,
      maxHp: player.maxHp,
      potions: player.potions,
      x: player.x,
      z: player.z,
      moveX: next.moveX,
      moveZ: next.moveZ,
      pendingInputs: pendingSeqs.length,
      maxPendingSeq: pendingSeqs.length ? Math.max(...pendingSeqs) : null,
      attack: Boolean(player.attack),
      dodgeCooldownTicks: player.dodgeCooldownTicks,
    });
    if (serverSnapshot) {
      const serverAck = serverSnapshot.ack ?? null;
      let entry = stats.serverTrace.at(-1);
      if (!entry || entry.tick !== serverSnapshot.tick || entry.ack !== serverAck) {
        entry = {
          tick: serverSnapshot.tick,
          ack: serverAck,
          players: (serverSnapshot.ents ?? [])
            .filter((entity) => entity.kind === 'player')
            .map(({ id, playerId, x, z, hp, attack, downed }) => ({
              id,
              playerId,
              x,
              z,
              hp,
              attack: attack ? {
                phase: attack.phase,
                phaseTick: attack.phaseTick,
                step: attack.step,
              } : null,
              downed,
            })),
          events: [],
        };
        stats.serverTrace.push(entry);
      }
      for (const event of serverSnapshot.ev ?? []) {
        if (
          !['attack', 'strike', 'hit', 'downed', 'reviveProgress', 'revived', 'potion'].includes(event.type) ||
          !Number.isSafeInteger(event.eventId) ||
          seenEventIds.has(event.eventId)
        ) continue;
        seenEventIds.add(event.eventId);
        entry.events.push({
          eventId: event.eventId,
          tick: event.tick,
          type: event.type,
          entityId: event.entityId,
          playerId: event.playerId,
          sourceId: event.sourceId,
          targetId: event.targetId,
          inputSeq: event.inputSeq,
          viewTick: event.viewTick,
          viewLag: event.viewLag,
          damage: event.damage,
          progress: event.progress,
          castId: event.castId,
        });
      }
    }
    return next;
  };
  window.__m2NetBotProvider = provider;
  const installed = api.setPartyInputProvider(provider);
  if (!installed) throw new Error('Dev input provider could not be installed');
})()`;
await Promise.all([a.evaluate(installBot), b.evaluate(installBot)]);
const hudOnly = process.argv.includes('--hud-only');
if (!hudOnly) {
  const enabled = await Promise.all([
    a.evaluate('window.__devinarok.setPartyInputAutoDrive(true)'),
    b.evaluate('window.__devinarok.setPartyInputAutoDrive(true)'),
  ]);
  if (enabled.some((value) => !value)) throw new Error('Could not start the party-loop input driver');
}
await Promise.all([a.evaluate('window.__devinarok.renderer.ready'), b.evaluate('window.__devinarok.renderer.ready')]);
await a.viewport(1024, 768);
await b.viewport(390, 844, true);
if (!doorOnly) {
  await capture(a, 'two-player-combat-desktop');
  await capture(b, 'two-player-combat-mobile-390x844');
}
if (hudOnly) {
  console.log(JSON.stringify({
    roomCode: code,
    exceptions: [...a.exceptions, ...b.exceptions],
    captures: [...captured],
  }, null, 2));
  process.exit(0);
}
const deadline = Date.now() + 240000;
let downedShot = doorOnly;
let doorShot = false;
let reconnectShot = false;
let reconnectDiagnostics = null;
let downedCapturePage = null;
const pendingSceneCaptures = [];
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
  if (state.downedPlayer && !state.done && state.reviveProgress > 0 && state.reviveProgress < 60 && !downedShot) {
    const downedIsA = await a.evaluate(
      `window.__devinarok.party.playerId === ${JSON.stringify(state.downedPlayer)}`,
    );
    downedCapturePage = downedIsA ? a : b;
    pendingSceneCaptures.push(capturePartyState(
      downedCapturePage,
      'downed-revive-ring',
      'document.querySelector("#party-downed").textContent.includes("부활 진행") && Number(document.querySelector("#party-downed").textContent.match(/(\\d+)\\/60/)?.[1]) > 0 && Number(document.querySelector("#party-downed").textContent.match(/(\\d+)\\/60/)?.[1]) < 60',
    ));
    downedShot = true;
  }
  const doorOnB = await b.evaluate('Boolean(window.__devinarok.getPartyWorld()?.doorCountdown)');
  if ((state.door || doorOnB) && !doorShot) {
    const doorCapturePage = downedCapturePage === a ? b : a;
    pendingSceneCaptures.push(capturePartyState(
      doorCapturePage,
      'door-countdown',
      '!document.querySelector("#party-door-countdown").hidden && document.querySelector("#party-door-countdown").textContent.includes("다음 방으로 이동")',
    ));
    doorShot = true;
  }
  if (state.done) break;
  await delay(250);
}
await Promise.all(pendingSceneCaptures);
await Promise.all([
  a.evaluate('window.__devinarok.setPartyInputAutoDrive(false)'),
  b.evaluate('window.__devinarok.setPartyInputAutoDrive(false)'),
  a.evaluate('window.__devinarok.setPartyInputProvider(window.__m2NetBotProvider)'),
  b.evaluate('window.__devinarok.setPartyInputProvider(window.__m2NetBotProvider)'),
]);
await a.wait('Boolean(window.__devinarok.party.result)', 10000);
await a.wait('!document.querySelector("#result-panel").hidden', 10000);
if (!doorOnly) await capture(a, 'result-player-1');
await b.wait('Boolean(window.__devinarok.party.result)', 10000);
await b.wait('!document.querySelector("#result-panel").hidden', 10000);
if (!doorOnly) await capture(b, 'result-player-2');
const rewardsBeforeReload = [
  await a.evaluate('({gold:window.__devinarok.character.gold,xp:window.__devinarok.character.xp})'),
  await b.evaluate('({gold:window.__devinarok.character.gold,xp:window.__devinarok.character.xp})'),
];
if (!doorOnly) {
  await b.evaluate(`(() => {
  const session = window.__devinarok.party.session;
  window.__m2ReconnectStatuses = [];
  const scheduleTimeout = session.setTimeoutFn;
  session.__m2ScheduleTimeout = scheduleTimeout;
  session.setTimeoutFn = (callback, ms) => scheduleTimeout(callback, Math.max(ms, 15000));
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
    await b.wait(
      '!document.querySelector("#party-network-overlay").hidden && document.querySelector("#party-network-overlay").textContent.includes("재연결 중")',
      10000,
    );
    reconnectDiagnostics = await b.evaluate(`({
      status: window.__devinarok.party.status,
      socketReadyState: window.__devinarok.party.session.socket?.readyState ?? null,
      overlayHidden: document.querySelector("#party-network-overlay").hidden,
      overlayText: document.querySelector("#party-network-overlay").textContent,
      statuses: window.__m2ReconnectStatuses,
      socketClose: window.__m2SocketClose ?? null,
    })`);
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
  }
}
const runStates = [
  await a.evaluate(`({
    outcome: window.__devinarok.party.result?.outcome,
    players: window.__devinarok.party.lastSnapshot?.ents?.filter((entity) => entity.kind === 'player').map(({playerId,hp,potions,downed}) => ({playerId,hp,potions,downed})),
    roomIndex: window.__devinarok.party.lastSnapshot?.roomIndex,
    inputReady: window.__devinarok.party.inputReady,
    runSnapshotReady: window.__devinarok.party.runSnapshotReady,
    clockSamples: window.__devinarok.party.session.clock.samples,
    clockPingsSent: window.__devinarok.party.session.clock.pingsSent,
    pendingClockPings: window.__devinarok.party.session.clock.pendingPings.size,
    clockTick: window.__devinarok.party.session.clock.getEstimate(performance.now()),
    clockTrace: window.__m2ClockTrace,
    snapshotTicks: window.__devinarok.party.interpolation.snapshots.map(({tick,receivedAt}) => ({tick,receivedAt})),
    predictorReady: Boolean(window.__devinarok.party.predictor),
    localPlayerPresent: window.__devinarok.party.lastSnapshot?.ents?.some((entity) => entity.playerId === window.__devinarok.party.playerId),
    driver: {
      ...window.__partyDriverStats,
      serverTick: window.__devinarok.party.lastSnapshot?.tick,
      serverAck: window.__devinarok.party.lastSnapshot?.ack,
      status: window.__devinarok.party.status,
      autoDriver: window.__devinarok.partyInputDriverStats,
    },
  })`),
  await b.evaluate(`({
    outcome: window.__devinarok.party.result?.outcome,
    players: window.__devinarok.party.lastSnapshot?.ents?.filter((entity) => entity.kind === 'player').map(({playerId,hp,potions,downed}) => ({playerId,hp,potions,downed})),
    roomIndex: window.__devinarok.party.lastSnapshot?.roomIndex,
    inputReady: window.__devinarok.party.inputReady,
    runSnapshotReady: window.__devinarok.party.runSnapshotReady,
    clockSamples: window.__devinarok.party.session.clock.samples,
    clockPingsSent: window.__devinarok.party.session.clock.pingsSent,
    pendingClockPings: window.__devinarok.party.session.clock.pendingPings.size,
    clockTick: window.__devinarok.party.session.clock.getEstimate(performance.now()),
    clockTrace: window.__m2ClockTrace,
    snapshotTicks: window.__devinarok.party.interpolation.snapshots.map(({tick,receivedAt}) => ({tick,receivedAt})),
    predictorReady: Boolean(window.__devinarok.party.predictor),
    localPlayerPresent: window.__devinarok.party.lastSnapshot?.ents?.some((entity) => entity.playerId === window.__devinarok.party.playerId),
    driver: {
      ...window.__partyDriverStats,
      serverTick: window.__devinarok.party.lastSnapshot?.tick,
      serverAck: window.__devinarok.party.lastSnapshot?.ack,
    status: window.__devinarok.party.status,
    autoDriver: window.__devinarok.partyInputDriverStats,
    },
  })`),
];
for (const state of runStates) {
  const driver = state.driver;
  let acknowledgedSeq = driver.inputSeqAtInstall ?? 0;
  driver.serverTrace = driver.serverTrace.map((snapshot) => {
    const ack = Number.isSafeInteger(snapshot.ack) ? snapshot.ack : acknowledgedSeq;
    const consumedInputs = driver.inputTrace
      .filter((input) => input.seq > acknowledgedSeq && input.seq <= ack)
      .map(({ seq, buttons }) => ({ seq, buttons }));
    acknowledgedSeq = Math.max(acknowledgedSeq, ack);
    return { ...snapshot, consumedInputs };
  });
}
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
  captureTimings,
  sceneCaptureErrors,
  reconnectDiagnostics,
  inputDriver: {
    source: 'dev-only catch-up InputLayer timer',
    cadenceHz: 30,
    pageStats: runStates.map(({ driver }) => ({
      timer: driver.autoDriver,
      inputSeqAtInstall: driver.inputSeqAtInstall,
      inputs: driver.inputs,
      attacks: driver.attacks,
      dodges: driver.dodges,
      potions: driver.potions,
      snapshots: driver.serverTrace.length,
      visibility: driver.visibility,
    })),
  },
};
report.captureMode = doorOnly ? 'door-only supplemental' : 'full';
report.missingCaptures = (doorOnly ? [
  'door-countdown',
] : [
  'lobby-desktop',
  'lobby-mobile-390x844',
  'two-player-combat-desktop',
  'two-player-combat-mobile-390x844',
  'downed-revive-ring',
  'door-countdown',
  'reconnect-overlay',
  'result-player-1',
  'result-player-2',
]).filter((name) => !captured.has(name));
await writeFile(
  `${outputDir}/${doorOnly ? 'door-capture-summary.json' : 'capture-summary.json'}`,
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));

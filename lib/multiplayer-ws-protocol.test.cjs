'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ─── 소스 로드 ──────────────────────────────────────────────────────────────
const source = fs.readFileSync(path.join(__dirname, 'multiplayer.js'), 'utf8');

// ─── 헬퍼: 새 vm 컨텍스트 + MockWebSocket 팩토리 ──────────────────────────
function makeContext() {
  const storage = new Map();
  let lastWS = null; // 생성자에서 connect() → new WebSocket() 호출 시 캡처

  // MockWebSocket: readyState 0=CONNECTING, 1=OPEN
  function MockWebSocket(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.sent = [];
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    lastWS = this;
  }
  MockWebSocket.prototype.send = function (data) {
    this.sent.push(data);
  };
  MockWebSocket.prototype.close = function () {
    this.readyState = 3; // CLOSED
    if (typeof this.onclose === 'function') {
      this.onclose({ code: 1000 });
    }
  };
  // 서버가 소켓을 OPEN으로 전환하는 헬퍼
  MockWebSocket.prototype._open = function () {
    this.readyState = 1;
    if (typeof this.onopen === 'function') this.onopen();
  };
  // 서버에서 클라이언트로 메시지 보내는 헬퍼
  MockWebSocket.prototype._receive = function (obj) {
    if (typeof this.onmessage === 'function') {
      this.onmessage({ data: JSON.stringify(obj) });
    }
  };

  // fake setTimeout: 즉시 실행 (reconnect delay 우회)
  const timers = new Map();
  let timerIdCounter = 1;
  function fakeSetTimeout(fn, _delay) {
    const id = timerIdCounter++;
    timers.set(id, fn);
    // 즉시 실행하지 않고 저장 — 테스트에서 _flushTimers() 로 제어
    return id;
  }
  function fakeClearTimeout(id) {
    timers.delete(id);
  }
  function flushTimers() {
    for (const [id, fn] of timers) {
      timers.delete(id);
      fn();
    }
  }

  const context = {
    window: {},
    console,
    localStorage: {
      getItem: (key) => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    EventSource: function EventSource() {},
    WebSocket: MockWebSocket,
    setInterval,
    clearInterval,
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
  };
  context.window.localStorage = context.localStorage;
  context.window.fetch = context.fetch;
  context.window.EventSource = context.EventSource;

  vm.runInNewContext(source, context, { filename: 'multiplayer.js' });

  return {
    context,
    storage,
    getLastWS: () => lastWS,
    flushTimers,
    MultiplayerWSClient: context.window.MultiplayerWSClient,
  };
}

// ─── 테스트 케이스 ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
    failed++;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 1. connect → state (resume): WS 열리자마자 connected + state 수신 → onStateChange
// ────────────────────────────────────────────────────────────────────────────
test('connect → state (resume): onStateChange 호출', () => {
  const { MultiplayerWSClient, getLastWS } = makeContext();

  let stateReceived = null;
  const client = new MultiplayerWSClient({
    workerBase: 'wss://example.workers.dev',
    room: 'test-room',
    userId: 'u-alice',
  });
  client.onStateChange = (view) => { stateReceived = view; };

  const ws = getLastWS();
  assert.ok(ws, 'WebSocket 인스턴스 생성되어야 함');

  // 서버: connected 전송
  ws._open();
  ws._receive({ type: 'connected', user: 'u-alice', started: true, connections: 1 });
  // 서버: state 전송 (게임 진행 중 재접속 시)
  ws._receive({ type: 'state', view: { score: 42 } });

  assert.deepEqual(stateReceived, { score: 42 }, 'onStateChange가 state view를 받아야 함');
  assert.deepEqual(client._lastView, { score: 42 }, '_lastView 업데이트되어야 함');
});

// ────────────────────────────────────────────────────────────────────────────
// 2. start 전송: start(config) 호출 시 WS로 {"type":"start","config":{...}} 전송
// ────────────────────────────────────────────────────────────────────────────
test('start 전송: WS가 OPEN일 때 start() → {"type":"start"} 패킷 전송', () => {
  const { MultiplayerWSClient, getLastWS } = makeContext();

  const client = new MultiplayerWSClient({
    workerBase: 'wss://example.workers.dev',
    room: 'test-room',
    userId: 'u-bob',
  });

  const ws = getLastWS();
  ws._open(); // WS OPEN 상태

  client.start({ seats: 2, bet: 100 });

  assert.equal(ws.sent.length, 1, '패킷 1개 전송되어야 함');
  const sent = JSON.parse(ws.sent[0]);
  assert.equal(sent.type, 'start', 'type이 "start"여야 함');
  assert.deepEqual(sent.config, { seats: 2, bet: 100 }, 'config가 올바르게 전달되어야 함');
});

// ────────────────────────────────────────────────────────────────────────────
// 3. pendingStart: WS 열리기 전 start() → onopen 이후 자동 전송
// ────────────────────────────────────────────────────────────────────────────
test('pendingStart: 소켓 열리기 전 start() 예약 → onopen 시 자동 전송', () => {
  const { MultiplayerWSClient, getLastWS } = makeContext();

  const client = new MultiplayerWSClient({
    workerBase: 'wss://example.workers.dev',
    room: 'test-room',
    userId: 'u-charlie',
  });

  const ws = getLastWS();
  // 소켓이 아직 CONNECTING(readyState=0) 상태에서 start() 호출
  assert.equal(ws.readyState, 0, '아직 CONNECTING이어야 함');
  client.start({ seats: 4 });

  // 아직 전송 안 됨
  assert.equal(ws.sent.length, 0, 'OPEN 전에는 전송 안 되어야 함');
  assert.deepStrictEqual(client._pendingStart, { seats: 4 }, '_pendingStart에 큐되어야 함');

  // 소켓 열림
  ws._open();

  // 이제 자동 전송됨
  assert.equal(ws.sent.length, 1, 'onopen 후 자동 전송되어야 함');
  const sent = JSON.parse(ws.sent[0]);
  assert.equal(sent.type, 'start', 'type이 "start"여야 함');
  assert.deepEqual(sent.config, { seats: 4 }, 'config가 올바르게 전달되어야 함');
  assert.equal(client._pendingStart, null, '_pendingStart가 null로 초기화되어야 함');
});

// ────────────────────────────────────────────────────────────────────────────
// 4. action → event → state 순서
// ────────────────────────────────────────────────────────────────────────────
test('action → event → state: 올바른 메시지 흐름과 콜백 호출 순서', () => {
  const { MultiplayerWSClient, getLastWS } = makeContext();

  const log = [];
  const client = new MultiplayerWSClient({
    workerBase: 'wss://example.workers.dev',
    room: 'test-room',
    userId: 'u-dave',
  });
  client.onEvent = (ev) => { log.push({ kind: 'event', ev }); };
  client.onStateChange = (view) => { log.push({ kind: 'state', view }); };

  const ws = getLastWS();
  ws._open();

  // sendAction
  client.sendAction({ move: 'draw' });

  assert.equal(ws.sent.length, 1, 'sendAction이 패킷 전송해야 함');
  const actionMsg = JSON.parse(ws.sent[0]);
  assert.equal(actionMsg.type, 'action', 'type이 "action"이어야 함');
  assert.deepEqual(actionMsg.action, { move: 'draw' }, 'action payload가 맞아야 함');

  // 서버: event 먼저
  ws._receive({ type: 'event', seq: 1, event: { card: 'A' } });
  assert.equal(log.length, 1, 'event 수신 후 로그 1개');
  assert.equal(log[0].kind, 'event', '첫 번째 콜백이 onEvent여야 함');
  assert.deepEqual(log[0].ev, { card: 'A' });

  // 서버: state 이후
  ws._receive({ type: 'state', view: { hand: ['A', 'K'] } });
  assert.equal(log.length, 2, 'state 수신 후 로그 2개');
  assert.equal(log[1].kind, 'state', '두 번째 콜백이 onStateChange여야 함');
  assert.deepEqual(log[1].view, { hand: ['A', 'K'] });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. reconnect: _reconnectTries > 0이고 onopen → onReconnected 호출, tries 리셋
// ────────────────────────────────────────────────────────────────────────────
test('reconnect: tries > 0일 때 onopen → onReconnected 호출 + tries 리셋', () => {
  const { MultiplayerWSClient, getLastWS, flushTimers } = makeContext();

  let reconnectedCalled = false;
  let reconnectingTries = 0;
  const client = new MultiplayerWSClient({
    workerBase: 'wss://example.workers.dev',
    room: 'test-room',
    userId: 'u-eve',
  });
  client.onReconnecting = (tries) => { reconnectingTries = tries; };
  client.onReconnected = () => { reconnectedCalled = true; };

  const ws = getLastWS();
  ws._open();

  // 게임 진행 중임을 시뮬레이션 (_started = true 필요 → state 메시지 수신)
  ws._receive({ type: 'state', view: {} });
  assert.ok(client._started, '_started가 true여야 함');

  // 연결 끊김 → scheduleReconnect 호출됨
  ws.readyState = 3;
  if (typeof ws.onclose === 'function') ws.onclose({ code: 1006 });

  assert.equal(client._reconnectTries, 1, 'tries가 1이어야 함');
  assert.equal(reconnectingTries, 1, 'onReconnecting(1) 호출되어야 함');

  // fake timer flush → connect() 호출 → 새 WebSocket 생성
  flushTimers();

  const ws2 = getLastWS();
  assert.ok(ws2 !== ws, '새 WebSocket이 생성되어야 함');

  // 재접속 성공
  ws2._open();

  assert.ok(reconnectedCalled, 'onReconnected 호출되어야 함');
  assert.equal(client._reconnectTries, 0, 'tries가 0으로 리셋되어야 함');
});

// ────────────────────────────────────────────────────────────────────────────
// 6. leaveRoom: _manualClose = true → 재접속 루프 중단
// ────────────────────────────────────────────────────────────────────────────
test('leaveRoom: _manualClose = true → 재접속 루프 중단', () => {
  const { MultiplayerWSClient, getLastWS, flushTimers } = makeContext();

  let reconnectedCalled = false;
  const client = new MultiplayerWSClient({
    workerBase: 'wss://example.workers.dev',
    room: 'test-room',
    userId: 'u-frank',
  });
  client.onReconnected = () => { reconnectedCalled = true; };

  const ws = getLastWS();
  ws._open();
  // _started = true로 만들어 onclose → scheduleReconnect 경로 활성화
  ws._receive({ type: 'state', view: {} });

  // leaveRoom 호출
  client.leaveRoom();

  assert.ok(client._manualClose, '_manualClose가 true여야 함');

  // onclose가 이미 leaveRoom에서 ws.close()로 호출됨
  // scheduleReconnect는 _manualClose 체크로 스킵되어야 함
  assert.equal(client._reconnectTries, 0, '_manualClose 시 tries가 0이어야 함');

  // timer flush해도 재접속 안 됨
  flushTimers();
  assert.ok(!reconnectedCalled, 'leaveRoom 후 onReconnected 호출되면 안 됨');
});

// ────────────────────────────────────────────────────────────────────────────
// 보너스: connected 메시지에서 onPresence 콜백 호출
// ────────────────────────────────────────────────────────────────────────────
test('connected 메시지: onPresence(connections) 호출', () => {
  const { MultiplayerWSClient, getLastWS } = makeContext();

  let presenceCount = null;
  const client = new MultiplayerWSClient({
    workerBase: 'wss://example.workers.dev',
    room: 'test-room',
    userId: 'u-grace',
  });
  client.onPresence = (count) => { presenceCount = count; };

  const ws = getLastWS();
  ws._open();
  ws._receive({ type: 'connected', user: 'u-grace', started: false, connections: 3 });

  assert.equal(presenceCount, 3, 'onPresence(3) 호출되어야 함');
});

// ────────────────────────────────────────────────────────────────────────────
// 보너스: window에 MultiplayerWSClient 노출 확인
// ────────────────────────────────────────────────────────────────────────────
test('window.MultiplayerWSClient 브라우저 전역 노출', () => {
  const { context } = makeContext();
  assert.equal(typeof context.window.MultiplayerWSClient, 'function',
    'window.MultiplayerWSClient가 함수여야 함');
});

// ────────────────────────────────────────────────────────────────────────────
// 보너스: getRoomState → _lastView 반환
// ────────────────────────────────────────────────────────────────────────────
test('getRoomState: _lastView를 myView로 반환', async () => {
  const { MultiplayerWSClient, getLastWS } = makeContext();

  const client = new MultiplayerWSClient({
    workerBase: 'wss://example.workers.dev',
    room: 'test-room',
    userId: 'u-henry',
  });

  const ws = getLastWS();
  ws._open();
  ws._receive({ type: 'state', view: { phase: 'play' } });

  const result = await client.getRoomState();
  assert.deepEqual(result, { myView: { phase: 'play' } }, 'getRoomState가 myView를 반환해야 함');
});

// ─── 결과 출력 ──────────────────────────────────────────────────────────────
console.log('');
console.log(`결과: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}

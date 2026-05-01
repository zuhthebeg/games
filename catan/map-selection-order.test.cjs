const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

function extractConst(name) {
  const marker = `const ${name} =`;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`Const not found: ${name}`);
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1) + ';';
    }
  }
  throw new Error(`Could not parse const: ${name}`);
}

function extractFunction(name, nextName, asyncName = false) {
  const marker = `${asyncName ? 'async ' : ''}function ${name}(`;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`Function not found: ${name}`);
  if (nextName) {
    const nextMarkers = [`function ${nextName}(`, `async function ${nextName}(`];
    let end = -1;
    for (const candidate of nextMarkers) {
      const idx = html.indexOf(candidate, start + marker.length);
      if (idx !== -1 && (end === -1 || idx < end)) end = idx;
    }
    return html.slice(start, end === -1 ? html.length : end).trim();
  }
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1).trim();
    }
  }
  throw new Error(`Could not parse function: ${name}`);
}

function extractPresetAssignments() {
  const start = html.indexOf('// ── Phase B: 별 1개 맵 6종');
  const end = html.indexOf('function resolveMapPreset', start);
  if (start === -1 || end === -1) throw new Error('Could not locate preset assignment block');
  return html.slice(start, end);
}

const helperScript = [
  extractFunction('shuffle', 'clone'),
  extractConst('MAP_PRESETS'),
  extractPresetAssignments(),
  extractFunction('resolveMapPreset', 'assignBalancedNumbers'),
  extractFunction('assignBalancedNumbers', 'resolveProducedResources'),
  extractFunction('buildHexesFromPreset', 'generateBoard')
].join('\n');

const helperCtx = { Math: Object.create(Math) };
helperCtx.Math.random = () => 0;
vm.createContext(helperCtx);
vm.runInContext(helperScript, helperCtx);
helperCtx.shuffle = (arr) => arr.slice().reverse();

const goldHexes = helperCtx.buildHexesFromPreset('gold-rush');
assert.equal(goldHexes[0].type, 'gold', 'gold-rush should shuffle preset resource pool instead of placing slot 0 in listed order');
assert.equal(goldHexes.filter(h => h.type === 'desert').length, 1, 'gold-rush should still include exactly one desert after shuffled placement');
assert.equal(goldHexes.filter(h => h.type === 'gold').length, 3, 'gold-rush should keep 3 gold tiles while randomizing their slots');
assert.notEqual(goldHexes.map(h => h.number).filter(n => n !== null).join(','), '5,2,6,3,8,10,9,12,11,4,8,10,9,4,5,6,3,11', 'gold-rush numbers should not be assigned in listed order');

const twinHexes = helperCtx.buildHexesFromPreset('twin-continents');
assert.equal(twinHexes[7].type, 'strait', 'twin-continents strait should remain at preset slot 7');
assert.equal(twinHexes[0].type, 'lumber', 'twin-continents should shuffle resource pool while keeping fixed terrain slots');

const selectionScript = [
  extractFunction('confirmMapSelect', 'renderMapSelect'),
  extractFunction('createRoom', 'joinRoom', true),
  extractFunction('onRoomStateChange', 'autoStartIfReady')
].join('\n');

const singleCtx = {
  state: { selectedMapId: 'twin-continents', mapSelectSource: 'single', maxPlayers: 4 },
  mpState: {},
  ensureMp: async () => { throw new Error('ensureMp should not be called in single mode'); },
  startSingleCalledWith: null,
  startSingle: (mapId) => { singleCtx.startSingleCalledWith = mapId; },
  showMultiOptions() { throw new Error('showMultiOptions should not be called in single mode'); }
};
vm.createContext(singleCtx);
vm.runInContext(selectionScript, singleCtx);
singleCtx.confirmMapSelect();
assert.equal(singleCtx.startSingleCalledWith, 'twin-continents', 'single-player confirm should start with selected map');

const multiCtx = {
  state: { selectedMapId: 'gold-rush', mapSelectSource: 'multi', maxPlayers: 4, mode: null, screen: null },
  mpState: { waitingMessage: '' },
  createdPayload: null,
  refreshCalls: 0,
  render() {},
  async ensureMp() {
    return {
      createRoom: async (game, payload) => {
        multiCtx.createdPayload = { game, payload };
        return { roomId: 'ROOM1' };
      },
      startListening() {}
    };
  },
  async refreshRoomState() { multiCtx.refreshCalls += 1; }
};
vm.createContext(multiCtx);
vm.runInContext(selectionScript, multiCtx);

const joinerCtx = {
  state: { selectedMapId: 'frontier-outback', screen: 'room-lobby', mode: 'multi', hint: '' },
  mpState: { myUserId: 'guest-1', mapId: 'frontier-outback', waitingMessage: '', aiPlayers: [] },
  getLobbyAiPlayers: () => [],
  autoStartIfReady() {},
  render() {}
};
vm.createContext(joinerCtx);
vm.runInContext(selectionScript, joinerCtx);
joinerCtx.onRoomStateChange({
  id: 'ROOM1',
  status: 'waiting',
  meta: { mapId: 'gold-rush' },
  players: [
    { id: 'host-1', isHost: true, isReady: true },
    { id: 'guest-1', isHost: false, isReady: false }
  ]
});
assert.equal(joinerCtx.state.selectedMapId, 'gold-rush', 'joiner lobby should adopt host room mapId');
assert.equal(joinerCtx.mpState.mapId, 'gold-rush', 'joiner multiplayer state should sync room mapId');

(async () => {
  await multiCtx.createRoom();
  assert.equal(multiCtx.createdPayload.game, 'catan', 'createRoom should target catan');
  assert.equal(multiCtx.createdPayload.payload.mapId, 'gold-rush', 'multiplayer room creation should send selected map id');
  assert.equal(multiCtx.mpState.mapId, 'gold-rush', 'multiplayer state should retain selected map id');
  console.log('PASS map selection + preset order');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

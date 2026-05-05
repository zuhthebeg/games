const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('dismissedWinner'), 'winner modal should stay until explicitly dismissed');
assert(html.includes('function renderWinnerModal'), 'game screen should render a persistent winner modal');
assert(html.includes('window.dismissWinnerModal'), 'winner modal close button should call exported dismiss handler');

assert(html.includes('turnSeconds'), 'state should include configurable turnSeconds');
assert(html.includes('clampTurnSeconds'), 'turn seconds should be sanitized');
assert(html.includes('gameConfig: { mapId, turnSeconds'), 'room creation should send turnSeconds in gameConfig');
assert(html.includes('state.turnTimeLeft = state.turnSeconds'), 'turn start should use configured turnSeconds, not fixed 60');
assert(html.includes('state.turnTimeLeft / state.turnSeconds'), 'timer bar should use configured turnSeconds');

assert(html.includes('reactionTurnUsed'), 'reactions should be limited by per-turn usage state');
assert(html.includes('지쳤나요'), 'reaction presets should include 지쳤나요');
assert(html.includes('거래해줘 형님'), 'reaction presets should include 거래해줘 형님');
assert(html.includes('function sendCustomReactionEmote'), 'custom reaction input should be supported');
assert(html.includes('speakReactionWithLocalTTS'), 'reaction audio should use local TTS pipeline when possible');
assert(html.includes('/v1/audio/speech'), 'local TTS pipeline endpoint should be used');

console.log('PASS catan victory timer emotes polish');

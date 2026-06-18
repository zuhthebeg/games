const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

// In-game host leave: server reassigns hostUser in the roster. The new host (host-authoritative)
// must resume driving AI seats, else the game stalls. onRoomStateChange must detect the
// isHost 0->1 transition during an active game and kick AI driving.
const fn = html.slice(html.indexOf('function onRoomStateChange'),
                      html.indexOf('async function autoStartIfReady'));
assert(fn, 'onRoomStateChange must exist');
assert(fn.includes('const wasHost = mpState.isHost'), 'must capture previous host state to detect succession');
assert(/!wasHost && mpState\.isHost && state\.screen === "game"/.test(fn),
  'must detect the isHost 0->1 transition only during an active game');
assert(/triggerAITurnIfNeeded\(\)/.test(fn.slice(fn.indexOf('!wasHost'))),
  'new host must kick AI turn driving on takeover');
assert(fn.includes('pt("hostTookOver")'), 'new host should get a takeover hint');

// Re-init guard: maybeHostInitGame must NOT be called from onRoomStateChange,
// or a new mid-game host would wipe the running game.
assert(!fn.includes('maybeHostInitGame'),
  'onRoomStateChange must not re-init the game for a newly promoted host');

console.log('PASS pingtan host succession resume');

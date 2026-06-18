const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

// Regression: in DO/WS mode a player leaving mid-game only rebroadcasts the roster —
// no per-player leave event reached onMpEvent, so the seat never converted to AI and
// the turn stalled. The adapter must diff the roster and synthesize player_left/join.
const onRoster = html.slice(html.indexOf('this._ws.onRoster = (d) =>'),
                            html.indexOf('this._ws.onStarted = (d) =>'));
assert(onRoster, 'adapter must define onRoster');
assert(onRoster.includes('const prev = this._lastRoom'), 'onRoster must capture previous roster to diff');
assert(/state\.screen === "game"/.test(onRoster), 'roster diff must only synthesize takeovers during an active game');
assert(/type: "player_left", userId: id, payload: \{ aiReplacement: true \}/.test(onRoster),
  'dropped player must emit a player_left with aiReplacement so the seat becomes AI');
assert(/type: "player_joined", userId: id/.test(onRoster),
  'returning player must emit player_joined so the seat flips back to human');
assert(onRoster.includes('id !== this._userId'), 'self must never be converted to AI');

// The synthesized event must land on the existing tested takeover path.
assert(html.includes('aiReplacement && markPlayerDisconnectedAsAI(event.userId)'),
  'player_left handler must convert the seat via markPlayerDisconnectedAsAI');
assert(html.includes('triggerAITurnIfNeeded();'),
  'after conversion the host must drive the AI turn so play continues');

console.log('PASS pingtan DO roster-leave AI takeover');

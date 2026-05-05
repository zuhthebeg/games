const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('showMultiOptions()'), 'multiplayer entry should use the shared MultiplayerUI lobby');
assert(html.includes('new MultiplayerUI'), 'catan multiplayer should render the shared lobby/waiting room UI');
assert(html.includes('catanMpUI._renderWaitingRoom'), 'catan should only customize the shared waiting room after native QR/share render');
assert(!html.includes('openMultiplayerMenu()'), 'participants should not be routed into a separate custom join/create screen');
assert(!html.includes('app.innerHTML = renderRoomLobby()'), 'normal room waiting should not bypass shared MultiplayerUI QR/share UI');
assert(html.includes('function markPlayerDisconnectedAsAI'), 'client should convert a leaving player slot to AI during an active game');
assert(html.includes('function markPlayerRejoinedHuman'), 'client should restore rejoining player slot from AI to human');
assert(html.includes('event.type === "player_left"'), 'player_left scenario should be handled explicitly');
assert(html.includes('markPlayerDisconnectedAsAI(event.userId'), 'player_left should target the leaving user id');
assert(html.includes('markPlayerRejoinedHuman(event.userId'), 'player_joined should restore the returning user id');
assert(html.includes('triggerAITurnIfNeeded();'), 'AI replacement should be able to continue turns');

console.log('PASS catan multiplayer scenario flow');

const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes("showMapSelect('multi')"), 'multiplayer entry should go through map selection');
assert(html.includes('createRoomFromSelectedMap()'), 'multi map confirm should create a room directly from selected map');
assert(html.includes('function createRoomFromSelectedMap'), 'selected map create-room helper should exist');
assert(html.includes('gameConfig: { mapId }'), 'created catan room should persist mapId inside room config');
assert(html.includes('state.screen === "room-lobby"') && html.includes('app.innerHTML = renderRoomLobby()'), 'render should show custom multiplayer room lobby after room creation');
assert(html.includes('function markPlayerDisconnectedAsAI'), 'client should convert a leaving player slot to AI during an active game');
assert(html.includes('function markPlayerRejoinedHuman'), 'client should restore rejoining player slot from AI to human');
assert(html.includes('event.type === "player_left"'), 'player_left scenario should be handled explicitly');
assert(html.includes('markPlayerDisconnectedAsAI(event.userId'), 'player_left should target the leaving user id');
assert(html.includes('markPlayerRejoinedHuman(event.userId'), 'player_joined should restore the returning user id');
assert(html.includes('triggerAITurnIfNeeded();'), 'AI replacement should be able to continue turns');

console.log('PASS catan multiplayer scenario flow');

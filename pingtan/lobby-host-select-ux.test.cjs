const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const start = html.indexOf('function renderRoomLobby()');
if (start === -1) throw new Error('renderRoomLobby not found');
const chunk = html.slice(start, start + 4200);

const selectRowIndex = chunk.indexOf('<select onchange="mpState.mapId=this.value;state.selectedMapId=this.value;"');
const playerListIndex = chunk.indexOf('<div id="playerList">');
const startBtnIndex = chunk.indexOf('id="startBtn"');
const fillAiIndex = chunk.indexOf('fillAIPlayers()');
const leaveIndex = chunk.indexOf('leaveRoom()');

assert(selectRowIndex !== -1, 'host lobby should use a select box for map choice');
assert(selectRowIndex < playerListIndex, 'host map select should stay above player list');
assert(startBtnIndex < playerListIndex, 'start button should stay above player list');
assert(fillAiIndex < playerListIndex, 'AI fill button should stay above player list');
assert(leaveIndex < playerListIndex, 'leave button should stay above player list');

const hostBlock = chunk.slice(selectRowIndex, playerListIndex);
const multiRowCount = (hostBlock.match(/class="multi-row"/g) || []).length;
assert(multiRowCount >= 2, 'host top control area should have a simple select row and a separate action row');

console.log('PASS host select UX');

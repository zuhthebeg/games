const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const start = html.indexOf('function renderRoomLobby()');
if (start === -1) throw new Error('renderRoomLobby not found');
const chunk = html.slice(start, start + 4500);

const hostMapRowIndex = chunk.indexOf('label style="font-size:12px;color:var(--muted);white-space:nowrap;">${pt("mapLabel")}');
const startButtonIndex = chunk.indexOf('id="startBtn"');
if (hostMapRowIndex === -1 || startButtonIndex === -1) {
  throw new Error('Could not locate host map row or start button in renderRoomLobby');
}

assert(
  startButtonIndex < chunk.indexOf('<div id="playerList">'),
  'start button should appear before the player list so host can access it without scrolling'
);

assert(
  startButtonIndex > hostMapRowIndex,
  'start button should stay in the top host control area near map selection'
);

console.log('PASS lobby start button placement');

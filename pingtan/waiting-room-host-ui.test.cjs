const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const sharedUi = fs.readFileSync(__dirname + '/../lib/multiplayer-ui.js', 'utf8');
const start = html.indexOf('pingtanMpUI._renderWaitingRoom = function(roomCode)');
if (start === -1) throw new Error('waiting room override not found');
const chunk = html.slice(start, start + 2600);

assert(
  chunk.includes('<select data-map-select'),
  'host waiting room override should render a select box for map choice'
);

assert(
  !chunk.includes('data-map-id='),
  'host waiting room override should not render chip buttons for map choice anymore'
);

assert(
  !chunk.includes('data-start-game') && !chunk.includes('nativeStart.remove()'),
  'host waiting room override should not replace the shared native start button'
);
assert(
  sharedUi.includes('id="mp-start-btn" data-action="start"') && sharedUi.includes("this.container.querySelector('[data-action=\"start\"]')"),
  'shared MultiplayerUI should keep the native start button wired to _handleStart'
);

console.log('PASS waiting room host UI');

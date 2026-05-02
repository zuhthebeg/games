const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const start = html.indexOf('catanMpUI._renderWaitingRoom = function(roomCode)');
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
  chunk.includes('게임 시작') || chunk.includes('start-game'),
  'host waiting room override should keep an obvious start action in the same control block'
);
assert(
  chunk.includes('#mp-start-btn') && chunk.includes("[data-action='start']") && chunk.includes('nativeStart.remove()'),
  'host waiting room override should remove the native shared start button to avoid duplicate start controls'
);

console.log('PASS waiting room host UI');

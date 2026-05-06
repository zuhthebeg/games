const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const modeStart = html.indexOf('function renderModeScreen()');
const modeChunk = html.slice(modeStart, modeStart + 4200);
const showStart = html.indexOf('function showMultiOptions()');
const showChunk = html.slice(showStart, showStart + 4200);

assert(
  modeChunk.includes('showMultiOptions()'),
  'main multiplayer button should open the shared MultiplayerUI lobby'
);
assert(
  !modeChunk.includes('showMapSelect(\'multi\')') && !modeChunk.includes('showMapSelect("multi")'),
  'participants should not be sent to map selection by the multiplayer entry button'
);
assert(
  showChunk.includes('new MultiplayerUI'),
  'multiplayer flow should use the shared lobby with room list, QR, copy, and share controls'
);
assert(
  showChunk.includes('_origRenderWaiting(roomCode)'),
  'pingtan waiting room customization must preserve the native shared waiting-room render first'
);
assert(
  showChunk.includes('if (!this.isHost) return'),
  'only the host should see pingtan-specific map/start controls in the waiting room'
);

console.log('PASS pingtan multiplayer entry flow');

const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const start = html.indexOf('pingtanMpUI._renderWaitingRoom = function(roomCode)');
if (start === -1) throw new Error('waiting room override not found');
const chunk = html.slice(start, start + 3200);

assert(
  chunk.includes('overflowY = "auto"') || chunk.includes("overflowY = 'auto'"),
  'waiting-room override should force a scrollable container'
);
assert(
  chunk.includes('webkitOverflowScrolling = "touch"') || chunk.includes("webkitOverflowScrolling = 'touch'"),
  'waiting-room override should enable touch scrolling on mobile'
);
assert(
  chunk.includes('maxHeight = "calc(100vh') || chunk.includes("maxHeight = 'calc(100vh"),
  'waiting-room override should bound container height for scrolling'
);

console.log('PASS waiting room scroll wiring');

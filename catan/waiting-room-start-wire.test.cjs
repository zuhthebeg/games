const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const start = html.indexOf('catanMpUI._renderWaitingRoom = function(roomCode)');
if (start === -1) throw new Error('waiting room override not found');
const chunk = html.slice(start, start + 2600);

assert(
  chunk.includes('startBtn.onclick = () => { startGame(); };'),
  'injected waiting-room start button should call startGame() directly'
);

assert(
  chunk.includes('nativeStart.hidden = true') || chunk.includes('nativeStart.style.display = "none"') || chunk.includes("nativeStart.style.display = 'none'"),
  'native waiting-room start button should be hidden to avoid duplicate inaccessible action'
);

console.log('PASS waiting room start wiring');

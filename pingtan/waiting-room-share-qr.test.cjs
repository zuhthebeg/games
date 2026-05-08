const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const ui = fs.readFileSync(__dirname + '/../lib/multiplayer-ui.js', 'utf8');

assert(
  html.includes('new MultiplayerUI'),
  'pingtan should use shared MultiplayerUI for waiting-room invite UI'
);
assert(
  html.includes('_origRenderWaiting(roomCode)'),
  'pingtan customization should preserve the native QR/copy/share waiting room'
);
assert(
  ui.includes('api.qrserver.com/v1/create-qr-code'),
  'shared waiting room should render a QR code for the invite URL'
);
assert(
  ui.includes('data-action="copy"'),
  'shared waiting room should expose a copy action'
);
assert(
  ui.includes('data-action="share"'),
  'shared waiting room should expose a share action'
);
assert(
  ui.includes('replace(/\\/index\\.html$/i, \'/\')'),
  'shared QR URL should strip index.html before building the invite route'
);
assert(
  ui.includes('return `${this._inviteBaseUrl()}/?room=${encodeURIComponent(roomCode || \'\')}`'),
  'shared QR URL should use the deployed game directory route with encoded room code'
);
assert(
  html.includes('replace(/\\/index\\.html$/i, "/")') && html.includes('return `${baseUrl}/?room=${encodeURIComponent(roomCode || "")}`'),
  'pingtan custom invite URL should also strip index.html and use ?room route'
);

console.log('PASS pingtan waiting room share QR');

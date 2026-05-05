const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const ui = fs.readFileSync(__dirname + '/../lib/multiplayer-ui.js', 'utf8');

assert(
  html.includes('new MultiplayerUI'),
  'catan should use shared MultiplayerUI for waiting-room invite UI'
);
assert(
  html.includes('_origRenderWaiting(roomCode)'),
  'catan customization should preserve the native QR/copy/share waiting room'
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
  ui.includes('const joinUrl = `${baseUrl}/?room=${roomCode}`'),
  'shared QR URL should use the deployed catan directory route'
);

console.log('PASS catan waiting room share QR');

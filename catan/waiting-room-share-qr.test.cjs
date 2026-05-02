const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(
  html.includes('function roomInviteUrl'),
  'room lobby should build an invite URL for sharing'
);
assert(
  html.includes('api.qrserver.com/v1/create-qr-code'),
  'room lobby should render a QR code for the invite URL'
);
assert(
  html.includes('copyRoomInvite()'),
  'room lobby should expose a copy-link action'
);
assert(
  html.includes('shareRoomInvite()'),
  'room lobby should expose a native share/copy fallback action'
);
assert(
  html.includes('?room=${encodeURIComponent(roomCode || "")}'),
  'invite URL should preserve the existing ?room=CODE join route'
);

console.log('PASS catan waiting room share QR');

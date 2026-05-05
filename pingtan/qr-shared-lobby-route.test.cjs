const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const bootStart = html.indexOf('(async function boot()');
const bootChunk = html.slice(bootStart, bootStart + 1200);

assert(bootChunk.includes('const inviteRoomCode = inviteRoomCodeFromUrl()'), 'boot should detect QR/share invite codes');
assert(bootChunk.includes('showMultiOptions();'), 'QR/share invite should open the shared MultiplayerUI lobby');
assert(!bootChunk.includes('await joinRoom();'), 'QR/share invite should not bypass shared MultiplayerUI with custom room-lobby join');
assert(!bootChunk.includes('state.screen = "room-lobby"'), 'QR/share invite should not render custom room-lobby directly');
assert(html.includes('const roomCode = MultiplayerUI.checkUrlRoom();'), 'shared lobby should consume ?room code and fill its join input');

console.log('PASS pingtan QR route uses shared lobby');

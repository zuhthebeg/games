const fs = require('fs');
const assert = require('assert');

const mpClient = fs.readFileSync(__dirname + '/../lib/multiplayer.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(mpClient.includes('presenceInterval'), 'multiplayer client should track a presence interval');
assert(mpClient.includes('startPresence()'), 'multiplayer client should start presence ping when listening');
assert(mpClient.includes('/presence'), 'multiplayer client should call the room presence endpoint');
assert(mpClient.includes('stopPresence()'), 'multiplayer client should stop presence ping when leaving/listening stops');

assert(html.includes('aiReplacement'), 'pingtan should respect AI replacement payloads for disconnected players');
assert(html.includes('markPlayerRejoinedHuman'), 'pingtan should restore human control on rejoin events');

console.log('PASS pingtan multiplayer presence stability');

const assert = require('assert');
const path = require('path');

// Load the lib in a minimal browser-ish shim so window.MultiplayerWSClient is defined.
global.window = global.window || {};
const { MultiplayerWSClient } = require(path.join(__dirname, 'multiplayer.js'));

// --- coordHttpBase: wss -> https, default to relay-do-poc ---
assert.strictEqual(
  MultiplayerWSClient.coordHttpBase('wss://relay-do-poc.zuhejbeg.workers.dev'),
  'https://relay-do-poc.zuhejbeg.workers.dev', 'wss must map to https');
assert.strictEqual(
  MultiplayerWSClient.coordHttpBase('ws://localhost:8787/'),
  'http://localhost:8787', 'ws maps to http and trailing slash trimmed');
assert(MultiplayerWSClient.coordHttpBase().includes('https://relay-do-poc'),
  'no-arg falls back to the relay-do-poc worker');

// --- genRoomCode: 4 chars, no ambiguous glyphs (0/1/I/O) ---
for (let i = 0; i < 50; i++) {
  const c = MultiplayerWSClient.genRoomCode();
  assert(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(c), 'room code must be 4 unambiguous chars: ' + c);
}

// --- resolveEntryRoom: explicit room wins, no matching call, uppercased ---
let matchCalls = 0;
MultiplayerWSClient.quickMatch = async () => { matchCalls++; return null; };
(async () => {
  const a = await MultiplayerWSClient.resolveEntryRoom('gomoku', 'ab12');
  assert.deepStrictEqual(a, { room: 'AB12', created: false }, 'explicit room wins, uppercased');
  assert.strictEqual(matchCalls, 0, 'explicit room must NOT hit the matcher');

  // no room + matcher returns a room -> join it (created:false)
  MultiplayerWSClient.quickMatch = async () => 'wxyz';
  const b = await MultiplayerWSClient.resolveEntryRoom('gomoku', '');
  assert.deepStrictEqual(b, { room: 'WXYZ', created: false }, 'matched room joined, uppercased');

  // no room + no open room -> create a fresh code (created:true)
  MultiplayerWSClient.quickMatch = async () => null;
  const c = await MultiplayerWSClient.resolveEntryRoom('gomoku', null);
  assert(c.created === true && /^[A-Z0-9]{4}$/.test(c.room), 'no match -> new room created');

  console.log('PASS coordinator matching helpers');
})().catch(e => { console.error(e); process.exit(1); });

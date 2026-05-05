const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const mpClient = fs.readFileSync(__dirname + '/../lib/multiplayer.js', 'utf8');
const stream = fs.readFileSync('/mnt/c/Users/user/games-server/functions/api/rooms/[id]/stream.ts', 'utf8');

assert(html.includes('async function restorepingtanMultiplayerSession'), 'pingtan should attempt restoring saved multiplayer room on boot');
assert(html.includes('restorepingtanMultiplayerSession()'), 'boot should call multiplayer restore');
assert(html.includes('async function replaypingtanRoomEvents'), 'pingtan should rebuild local game state from room event log');
assert(html.includes('mpState.replaying = true'), 'event replay should mark replaying mode');
assert(html.includes('if (mpState.replaying) return true;'), 'stale trade proposals should not reopen dialogs during replay');
assert(html.includes('mpState.client.lastSeq = lastSeq'), 'replay should advance client lastSeq to avoid old event replay');
assert(html.includes('function createpingtanStateSnapshot'), 'multiplayer actions should carry a full state snapshot for guest refresh restore');
assert(html.includes('action.__snapshot = createpingtanStateSnapshot()'), 'sent game actions should include the latest post-action snapshot');
assert(html.includes('function applypingtanStateSnapshot'), 'guest refresh should restore from a state snapshot before replaying later events');
assert(html.includes('latestSnapshotEvent'), 'replay should prefer the newest snapshot instead of rebuilding from truncated event history');
assert(html.includes('state.hint = pt("multiplayerRecovered")'), 'restore should surface successful game restoration');
assert(html.includes('config?.mapId') && html.includes('gameConfig?.mapId'), 'room state changes should preserve map id from room config/gameConfig');

assert(mpClient.includes('stream?token=${encodeURIComponent(this.token)}&after=${encodeURIComponent(this.lastSeq || 0)}'), 'SSE should request only events after current seq');
assert(mpClient.includes('if (data && typeof data.seq === \'number\')'), 'client should track last seq from events');
assert(stream.includes("url.searchParams.get('after')"), 'SSE server should read after query param');
assert(stream.includes('Number.isFinite(rawAfter)'), 'SSE server should validate after query param');

console.log('PASS pingtan multiplayer reconnect stability');

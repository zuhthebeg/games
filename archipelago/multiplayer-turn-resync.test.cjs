const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const mpClient = fs.readFileSync(__dirname + '/../lib/multiplayer.js', 'utf8');

assert(
  html.includes('recoverFromActionSnapshot'),
  'catan live multiplayer should recover from action snapshot when local event application fails'
);
assert(
  html.includes('if (!ok && data.__snapshot && recoverFromActionSnapshot(data.__snapshot, data.type))'),
  'failed live action application should apply the sender snapshot instead of leaving clients turn-desynced'
);
assert(
  mpClient.includes('catchupInterval'),
  'multiplayer client should maintain a periodic event catch-up poll in addition to SSE'
);
assert(
  mpClient.includes('startCatchupPolling()'),
  'SSE listener should start catch-up polling to recover missed turn events'
);
assert(
  mpClient.includes('data.seq <= this.lastSeq'),
  'duplicate/stale events should be ignored when SSE and catch-up polling overlap'
);

console.log('PASS catan multiplayer turn resync stability');

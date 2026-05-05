const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('turnTick'), 'SFX should include a turn timer tick sound');
assert(html.includes('lastTurnTickSecond'), 'state should track the last played timer tick second');
assert(html.includes('maybePlayTurnTimerTick'), 'timer should gate tick playback to human turns');
assert(html.includes('state.turnTimeLeft <= 10'), 'timer tick should intensify near the end of the turn');
assert(html.includes('SFX.turnTick'), 'timer loop should play the tick sound through SFX');

console.log('PASS catan turn timer sound');

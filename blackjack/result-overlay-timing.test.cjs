const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const ui = fs.readFileSync(__dirname + '/../lib/multiplayer-ui.js', 'utf8');

assert(html.includes('const RESULT_REVEAL_DELAY_MS = 1800'), 'result overlay should be delayed so dealer cards remain visible');
assert(html.includes('state.phase = "settling"'), 'solo round should hold a settling phase before betting reopens');
assert(html.includes('setTimeout(() => {\n        if (state.phase !== "settling") return;'), 'solo betting controls should reopen after the reveal delay');
assert(html.includes('mpResultOverlayKey'), 'multiplayer result overlay should be keyed to avoid duplicate popups');
assert(html.includes('mpResultOverlayTimer'), 'multiplayer result overlay should use one pending timer');
assert(html.includes('clearTimeout(mpResultOverlayTimer)'), 'newer finished-state evidence should replace any pending result popup timer');
assert(html.includes('mpLatestRoundDelta'), 'multiplayer result popup should track the current round delta');
assert(html.includes('이번 판') && html.includes('This round'), 'result popup should show this-round winnings, not only cumulative total');
assert(html.includes('}, RESULT_REVEAL_DELAY_MS);'), 'multiplayer result popup should wait before covering dealer cards');
assert(ui.includes('this._hideResult();\n        const overlay'), 'shared result renderer should replace, not stack, overlays');

console.log('PASS blackjack result overlay timing and details');

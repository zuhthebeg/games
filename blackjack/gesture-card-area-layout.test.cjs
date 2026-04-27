const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');

assert(html.includes('id="table"'), 'solo table should exist as the large card gesture target');
assert(html.includes('class="table multi-table"'), 'multiplayer table should exist as the large card gesture target');
assert(html.includes('attachBlackjackGestureControls(document.getElementById("table")'), 'solo card/table area should be gesture-enabled');
assert(html.includes('attachBlackjackGestureControls(document.querySelector(".multi-table")'), 'multiplayer card/table area should be gesture-enabled');
assert(html.includes('shouldIgnoreBlackjackGestureTarget'), 'gesture binding should ignore buttons/inputs/modals inside large areas');
assert(html.includes('attachBlackjackGestureControls(document.getElementById("soloGesturePad")'), 'solo guide box should keep gesture support');
assert(html.includes('attachBlackjackGestureControls(document.getElementById("mpGesturePad")'), 'multiplayer guide box should keep gesture support');

const soloCustom = html.indexOf('data-bet="custom" class="custom-bet"');
const soloAll = html.indexOf('class="allin" data-bet="all"');
const soloDynamic = html.indexOf('id="dynamicBetButtons"');
assert(soloCustom >= 0, 'solo custom bet button should exist');
assert(soloAll >= 0, 'solo all-in button should exist');
assert(soloCustom < soloAll, 'solo custom should be left of all-in');
assert(soloAll < soloDynamic, 'solo dynamic buttons should be right of all-in');

const multiCustom = html.indexOf('data-mp-bet="custom"');
const multiAll = html.indexOf('data-mp-bet="all"');
const multiDynamic = html.indexOf('id="dynamicMpBetButtons"');
assert(multiCustom >= 0, 'multi custom bet button should exist');
assert(multiAll >= 0, 'multi all-in button should exist');
assert(multiCustom < multiAll, 'multi custom should be left of all-in');
assert(multiAll < multiDynamic, 'multi dynamic buttons should be right of all-in');

assert(html.includes('function getDoubleSafeMaxBet'), 'double-safe max bet helper should exist');
assert(html.includes('getDoubleSafeMaxBet(gold)'), 'solo dynamic bet rendering should use double-safe max');
assert(html.includes('getDoubleSafeMaxBet(Math.min(gold, MULTI_BET_MAX * 2))'), 'multi dynamic bet rendering should use double-safe capped max');

console.log('PASS blackjack card-area gestures and bet layout');

const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('_aiTurnInProgress: false'), 'single-player AI turn should track in-progress state');
assert(html.includes('aiTurnInProgress: false'), 'multiplayer AI turn should track in-progress state');
assert(html.includes('if (state._aiTurnInProgress) return;'), 'single-player AI turn should reject reentrant starts while a trade dialog is pending');
assert(html.includes('if (mpState.aiTurnInProgress) return;'), 'multiplayer AI turn should reject reentrant starts while a trade dialog is pending');
assert(html.includes('state._aiTurnScheduled = true'), 'single-player trigger should coalesce duplicate AI turn timers');
assert(html.includes('mpState.aiTurnScheduled = true'), 'multiplayer trigger should coalesce duplicate AI turn timers');
assert(html.includes('state._aiTurnTriggerAfterFinish'), 'single-player chained AI turns should resume after releasing the lock');
assert(html.includes('mpState.aiTurnTriggerAfterFinish'), 'multiplayer chained AI turns should resume after releasing the lock');
assert(html.includes('await showTradeProposal'), 'regression target: AI trade proposals still await player response');

console.log('PASS AI trade reentrancy guard');

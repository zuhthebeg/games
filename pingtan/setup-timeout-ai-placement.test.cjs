const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('async function autoPlaceSetupForCurrentPlayer()'), 'setup timeout should have a dedicated auto-placement handler');
assert(html.includes('ai.pickBestVertex(state, choices)'), 'setup timeout settlement should reuse the AI vertex algorithm');
assert(html.includes('ai.pickBestRoadFromVertex(state, roads, state.lastSetupVertex)'), 'setup timeout road should reuse the AI road algorithm');
assert(html.includes('await autoPlaceSetupForCurrentPlayer();'), 'turn timer timeout should call setup auto-placement before normal end-turn');
assert(html.includes('state._setupTimeoutInProgress'), 'setup timeout handler should be guarded against repeated timer ticks');

console.log('PASS pingtan setup timeout AI placement wiring');

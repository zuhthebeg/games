const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('function returnToSingleMapSelect'), 'single-player victory flow should have a map-select return handler');
assert(html.includes('returnToSingleMapSelect()'), 'single-player winner primary button should return to map select');
assert(html.includes('"맵 선택으로"'), 'single-player winner button label should say map select, not room/rematch');
assert(html.includes('state.screen = "map-select"'), 'single-player return should navigate to map-select screen');
assert(html.includes('state.mapSelectSource = "single"'), 'single-player return should preserve single-player map selection mode');
assert(html.includes('window.returnToSingleMapSelect = returnToSingleMapSelect'), 'single-player return handler should be exported for inline onclick');
assert(html.includes('state._aiTurnScheduled = false'), 'resetCoreState should clear AI scheduled lock after finished games');
assert(html.includes('state._aiTurnInProgress = false'), 'resetCoreState should clear AI in-progress lock after finished games');

console.log('PASS single victory returns to map select');

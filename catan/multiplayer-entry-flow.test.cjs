const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const modeStart = html.indexOf('function renderModeScreen()');
const modeChunk = html.slice(modeStart, modeStart + 1000);
const renderStart = html.indexOf('function render()');
const renderChunk = html.slice(renderStart, renderStart + 900);
const mapStart = html.indexOf('function renderMapSelect()');
const mapChunk = html.slice(mapStart, mapStart + 2200);

assert(
  modeChunk.includes('openMultiplayerMenu()'),
  'main multiplayer button should open the join/create menu, not map selection'
);
assert(
  !modeChunk.includes('showMapSelect(\'multi\')') && !modeChunk.includes('showMapSelect("multi")'),
  'participants should not be sent to map selection by the multiplayer entry button'
);
assert(
  renderChunk.includes('state.screen === "multi-options"') && renderChunk.includes('renderMultiOptions()'),
  'render should support the multiplayer join/create menu'
);
assert(
  mapChunk.includes("state.mapSelectSource === 'multi' ? 'multi-options' : 'mode'") || mapChunk.includes('state.mapSelectSource === "multi" ? "multi-options" : "mode"'),
  'back from host map selection should return to the multiplayer join/create menu'
);

console.log('PASS catan multiplayer entry flow');

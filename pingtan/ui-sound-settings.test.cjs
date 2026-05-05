const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('.actions button.selected-action'), 'selected build/action buttons should have a distinct CSS class');
assert(html.includes('box-shadow: 0 0 0 2px rgba(255,215,0'), 'selected build/action buttons should glow visibly');
assert(html.includes('buildActionButtonClass("road"'), 'road build button should render selected state');
assert(html.includes('buildActionButtonClass("settlement"'), 'settlement build button should render selected state');
assert(html.includes('buildActionButtonClass("city"'), 'city build button should render selected state');
assert(html.includes('onclick="toggleSoundPanel()">⚙️${pt("settings")}'), 'game action panel should expose a visible localized settings button');
assert(html.includes('trade()'), 'SFX should provide a trade notification sound');
assert(html.includes('SFX.trade();\n          const accepted = await showTradeProposal'), 'multiplayer trade proposals should play sound before dialog');
assert(html.includes('window.addEventListener("pointerdown", unlockGameAudio'), 'audio should unlock from user gestures');

console.log('PASS pingtan selected action and sound settings UI');

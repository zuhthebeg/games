const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('.lobby-screen.mode-screen'), 'mode screen should have a dedicated scrollable class');
assert(html.includes('height: 100%;') && html.includes('min-height: 0;'), 'mode lobby screen should be constrained to app height for internal scrolling');
assert(html.includes('overflow-y: auto;'), 'mode lobby screen should allow vertical scrolling');

const renderStart = html.indexOf('function renderModeScreen()');
const renderChunk = html.slice(renderStart, renderStart + 5000);
assert(renderChunk.includes('<div class="lobby-screen mode-screen">'), 'main mode should use scrollable mode-screen class');
const langIndex = renderChunk.indexOf('renderPingtanLangSwitch()');
const boardIndex = renderChunk.indexOf('pingtan-board-stage');
assert(langIndex > -1 && boardIndex > -1 && langIndex < boardIndex, 'language switch should be visible near the title before the board stage');
assert(!renderChunk.includes('<div class="pingtan-menu-controls">\n              ${renderPingtanLangSwitch()}'), 'language switch should not be buried in bottom controls');

console.log('PASS pingtan main scroll and language visibility');

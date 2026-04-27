const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('mpActionPanel'), 'multiplayer action panel should exist');
assert(html.includes('attachBlackjackGestureControls(el.actionPanel, { hit, stand, split });'), 'solo gesture controls should be attached');
assert(html.includes('attachBlackjackGestureControls(document.getElementById("mpActionPanel")'), 'multiplayer gesture controls should be attached');
assert(html.includes('gesture === "split"'), 'gesture interpreter should support split');
assert(html.includes('Double tap') && html.includes('Drag') && html.includes('Split'), 'rules should mention split gesture in English');
assert(html.includes('더블탭') && html.includes('드래그') && html.includes('스플릿'), 'rules should mention split gesture in Korean');

console.log('PASS blackjack multi gesture wiring');

const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('mpActionPanel'), 'multiplayer action panel should exist');
assert(html.includes('id="mpGesturePad"'), 'multiplayer gesture pad should exist outside the action buttons');
assert(html.includes('attachBlackjackGestureControls(document.getElementById("soloGesturePad")'), 'solo gesture pad should be wired');
assert(html.includes('attachBlackjackGestureControls(document.getElementById("mpGesturePad")'), 'multiplayer gesture pad should be wired');
assert(html.includes('window.PointerEvent'), 'gesture handler should support pointer events for desktop and mobile browsers');
assert(html.includes('gesture === "split"'), 'gesture interpreter should support split');
assert(html.includes('Double tap') && html.includes('Swipe left/right') && html.includes('Split'), 'rules should mention split gesture in English');
assert(html.includes('더블탭') && html.includes('좌우') && html.includes('스플릿'), 'rules should mention split gesture in Korean');

console.log('PASS blackjack multi gesture wiring');

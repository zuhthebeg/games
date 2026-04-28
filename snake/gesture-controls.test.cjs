const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('function rotateDirection(clockwise = true)'), 'snake should support relative left/right rotation');
assert(html.includes('rotateDirection(false)'), 'left gesture/key should rotate counter-clockwise');
assert(html.includes('rotateDirection(true)'), 'right gesture/key or tap should rotate clockwise');
assert(html.includes('const SWIPE_THRESHOLD = 24'), 'swipe threshold should distinguish drag from short tap');
assert(html.includes('Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD'), 'short touch should be treated as tap');
assert(html.includes('case \'ArrowLeft\': case \'a\': case \'A\': case \'q\': case \'Q\':'), 'keyboard left controls should rotate left');
assert(html.includes('case \'ArrowRight\': case \'d\': case \'D\': case \'e\': case \'E\':'), 'keyboard right controls should rotate right');
assert(html.includes('container.addEventListener(\'pointerdown\''), 'gesture controls should use pointer events for touch/drag');
assert(html.includes('container.addEventListener(\'pointerup\''), 'gesture controls should handle drag end direction');

console.log('PASS snake gesture controls');

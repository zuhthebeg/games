const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('function directionFromDrag(dx, dy)'), 'snake should map drag vectors to absolute directions');
assert(html.includes('setDirection(dragDir.x, dragDir.y)'), 'drag should set the intended absolute direction when legal');
assert(html.includes('function rotateDirection(clockwise = true)'), 'snake should still support relative keyboard/tap rotation');
assert(html.includes('const SWIPE_THRESHOLD = 24'), 'swipe threshold should distinguish drag from short tap');
assert(html.includes('Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD'), 'short touch should be treated as tap');
assert(html.includes('case \'ArrowLeft\': case \'a\': case \'A\': case \'q\': case \'Q\':'), 'keyboard left controls should rotate left');
assert(html.includes('case \'ArrowRight\': case \'d\': case \'D\': case \'e\': case \'E\':'), 'keyboard right controls should rotate right');
assert(html.includes('container.addEventListener(\'pointerdown\''), 'gesture controls should use pointer events for touch/drag');
assert(html.includes('container.addEventListener(\'pointerup\''), 'gesture controls should handle drag end direction');
assert(html.includes('const MAX_GOLD_PER_FOOD = 1000000'), 'snake food reward should have a one-million cap');
assert(html.includes('const earnedGold = Math.min(goldPerFood, MAX_GOLD_PER_FOOD)'), 'snake should cap each food reward before adding gold');
assert(html.includes('goldPerFood = Math.min(goldPerFood * 2, MAX_GOLD_PER_FOOD)'), 'next food reward should not grow beyond the cap');

console.log('PASS snake gesture controls');

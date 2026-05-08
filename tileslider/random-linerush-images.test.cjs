const fs = require('fs');
const assert = require('assert');

const js = fs.readFileSync(__dirname + '/script.js', 'utf8');

assert(js.includes('const LINE_RUSH_RANDOM_IMAGES'), 'tileslider should define Line Rush image pool');
assert(js.includes('/linerush/img/bg1.jpg'), 'image pool should include existing Line Rush bg images');
assert(js.includes('// backgroundImage = `https://picsum.photos/460?random=${Date.now()}`;'), 'old picsum random image should be kept only as a commented fallback');
assert(js.includes('backgroundImage = pickRandomLineRushImage();'), 'random image button should use Line Rush image pool');
assert(js.includes('function pickRandomLineRushImage()'), 'random image selection helper should exist');

console.log('PASS tileslider Line Rush random images');

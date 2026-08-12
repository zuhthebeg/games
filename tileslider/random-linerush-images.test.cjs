const fs = require('fs');
const assert = require('assert');

const js = fs.readFileSync(__dirname + '/script.js', 'utf8');

assert(js.includes('const RANDOM_IMAGES'), 'tileslider should define its own random image pool');
assert(js.includes("'/tileslider/random-images/sq10.webp'"), 'pool should contain all 10 square images');
assert(js.includes('// backgroundImage = `https://picsum.photos/460?random=${Date.now()}`;'), 'old picsum random image should be kept only as a commented fallback');
assert(js.includes('await setPuzzleImage(pickRandomImage());'), 'random image button should preload image dimensions before starting');
assert(js.includes('function pickRandomImage()'), 'random image selection helper should exist');

console.log('PASS tileslider random image pool wiring');

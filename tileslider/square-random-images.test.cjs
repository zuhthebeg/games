const fs = require('fs');
const path = require('path');
const assert = require('assert');

const js = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');

assert(js.includes('/tileslider/random-images/linerush-bg1.jpg'), 'random pool should use square-cropped tileslider images');
assert(!js.includes("'/linerush/img/bg1.jpg'"), 'random pool should not use original portrait Line Rush images directly');
assert(js.includes('tile.style.backgroundSize = `${level * 100}% ${level * 100}%`;'), 'tile backgrounds should be sized to square board in both axes');

for (let i = 1; i <= 30; i++) {
  const p = path.join(__dirname, 'random-images', `linerush-bg${i}.jpg`);
  assert(fs.existsSync(p), `square random image ${i} should exist`);
}

console.log('PASS tileslider square random image pool');

const fs = require('fs');
const assert = require('assert');

const js = fs.readFileSync(__dirname + '/script.js', 'utf8');

assert(js.includes("'/linerush/img/bg1.jpg'"), 'random pool should use original Line Rush portrait images');
assert(!js.includes("'/tileslider/random-images/linerush-bg1.jpg'"), 'random pool should not use square-cropped tileslider images');
assert(js.includes('function getContainedImageFrame(level)'), 'image mode should calculate a contained image frame');
assert(js.includes('tile.style.backgroundSize = `${frame.renderWidth}px ${frame.renderHeight}px`;'), 'tile backgrounds should preserve the source image aspect ratio');
assert(js.includes('tile.style.backgroundPosition = `${frame.offsetX - (col * frame.tileSize)}px ${frame.offsetY - (row * frame.tileSize)}px`;'), 'tile backgrounds should include contain-mode letterbox offsets');
assert(js.includes('backgroundImageMeta = await loadImageMeta(src);'), 'image dimensions should be loaded before puzzle rendering');

console.log('PASS tileslider contained random image aspect ratio');

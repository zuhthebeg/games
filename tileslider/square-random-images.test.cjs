const fs = require('fs');
const assert = require('assert');

const js = fs.readFileSync(__dirname + '/script.js', 'utf8');

// 2026-08-13: 세로(832x1216) 라인러시 이미지 재사용을 폐기하고 전용 정사각(1024) 풀로 교체.
assert(js.includes("'/tileslider/random-images/sq1.webp'"), 'random pool should use dedicated square images');
assert(!js.includes("'/linerush/img/bg1.jpg'"), 'portrait Line Rush images should no longer be in the pool');
assert(js.includes('function getContainedImageFrame(level)'), 'contain-frame logic stays (square source fills the board)');
assert(js.includes('backgroundImageMeta = await loadImageMeta(src);'), 'image dimensions should be loaded before puzzle rendering');

console.log('PASS tileslider square random image pool');

const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('id="level"'), 'snake HUD should show current level');
assert(html.includes('id="next-level"'), 'snake HUD should show progress to next level');
assert(html.includes('LEVEL_CONFIGS'), 'snake should define designed level configurations');
assert(html.includes('function buildLevelObstacles(level)'), 'snake should build deterministic obstacle layouts per level');
assert(html.includes('function updateLevelProgress()'), 'snake should level up based on score progress');
assert(html.includes('function maybeSpawnGoldenFood()'), 'snake should spawn time-limited golden food');
assert(html.includes('function updateMovingObstacles()'), 'snake should support moving obstacles in later levels');
assert(html.includes('function isBlockedCell(x, y)'), 'snake should centralize collision blocking for obstacles');
assert(html.includes('function spawnFood(kind = \'normal\')'), 'food spawning should support normal and golden food');
assert(html.includes('drawObstacles()'), 'draw loop should render obstacles');
assert(html.includes('drawGoldenFood()'), 'draw loop should render golden food');
assert(html.includes('LEVEL UP'), 'snake should show a level-up banner');
assert(html.includes('좁아지는 외곽'), 'late-game level should include shrinking-border pressure');

console.log('PASS snake level design structure');

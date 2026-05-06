const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const match = html.match(/function\s+startSinglePlayer\s*\(\)\s*{([\s\S]*?)\n\s*}\n\s*\n\s*let\s+pokerMpUI/);
assert(match, 'startSinglePlayer function should exist');
const body = match[1];
assert(body.includes("isMultiplayer = false"), 'single player should disable multiplayer mode');
assert(body.includes("gameContainer"), 'single player should show the game container');
assert(/newGame\s*\(\s*\)/.test(body) || /startHand\s*\(\s*\)/.test(body), 'single player click should immediately start a hand instead of showing an empty table');

console.log('poker-single-start.test.cjs passed');

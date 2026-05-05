const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('GOLD_CHOICE'), 'gold resource choice should be a synced multiplayer action');
assert(html.includes('function applyGoldChoice'), 'gold choices should be applied through a shared helper');
assert(html.includes('owner && !owner.isAI'), 'gold tiles should distinguish human owners from AI owners');
assert(html.includes('v.owner !== humanIdx'), 'non-local multiplayer human gold should wait for owner choice instead of auto-paying');
assert(html.includes('sendGameAction(ACTION.GOLD_CHOICE'), 'local human gold choice should be broadcast to multiplayer peers');
assert(html.includes('return applyGoldChoice'), 'GOLD_CHOICE action should apply received selected resources');

console.log('PASS pingtan multiplayer gold choice sync');

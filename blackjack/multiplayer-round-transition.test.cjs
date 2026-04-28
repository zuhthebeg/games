const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('function hideMultiResultOverlay'), 'should have helper to clear multiplayer result overlay');
assert(html.includes('if (phase !== "finished") hideMultiResultOverlay();'), 'result overlay should disappear automatically after next round starts');

const newRoundHandlerStart = html.indexOf('type: "new_round"');
assert(newRoundHandlerStart >= 0, 'new_round action should exist');
const newRoundHandler = html.slice(newRoundHandlerStart, newRoundHandlerStart + 500);
assert(!newRoundHandler.includes('alert('), 'new_round failure should not show blocking alert');
assert(newRoundHandler.includes('refreshMultiStateSoon'), 'new_round race/failure should refresh state instead of blocking flow');
assert(html.includes('function showMultiInlineNotice'), 'should have inline notice helper for non-blocking multiplayer messages');

console.log('PASS multiplayer round transition is non-blocking');

const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('if (event.type === "host_changed")'), 'pingtan should handle host_changed events');
assert(html.includes('await refreshRoomState();\n        state.hint = event.userId === mpState.myUserId'), 'host_changed should refresh host role and explain takeover');
assert(html.includes('triggerAITurnIfNeeded();\n        return;'), 'new host should immediately try to continue AI turns');
assert(html.includes('scroll-padding-bottom: calc(72px + env(safe-area-inset-bottom))'), 'mode screen should reserve bottom scroll padding for mobile controls');
assert(html.includes('margin-bottom: calc(18px + env(safe-area-inset-bottom))'), 'lobby card should leave room for button shadows at bottom');

console.log('PASS pingtan host migration client and mobile lobby spacing');

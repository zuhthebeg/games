const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('GAME_SETTINGS'), 'multiplayer should define a settings sync action');
assert(html.includes('function updateGameSetting'), 'settings panel should update VP/time through a single handler');
assert(html.includes('updateGameSetting(\'turnSeconds\''), 'settings panel should expose turn time override');
assert(html.includes('updateGameSetting(\'targetScore\''), 'settings panel should expose victory VP override');
assert(html.includes('설정 변경은 다음 턴부터 적용'), 'settings panel should explain turn timer override timing');
assert(html.includes('!canEditGameSettings'), 'non-host multiplayer users should not be allowed to edit game overrides');
assert(html.includes('type: ACTION.GAME_SETTINGS'), 'host changes should sync through multiplayer action');
assert(html.includes('state.targetScoreCustom = true'), 'target score override should remain explicit after settings changes');

console.log('PASS pingtan in-game settings panel');

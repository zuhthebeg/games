const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const mpUi = fs.readFileSync(__dirname + '/../lib/multiplayer-ui.js', 'utf8');

assert(mpUi.includes('this.getRoomConfig = options.getRoomConfig || null'), 'MultiplayerUI should accept a getRoomConfig hook');
assert(mpUi.includes('...(roomConfig || {})'), 'MultiplayerUI should merge game-specific room config into createRoom payload');
assert(html.includes('getRoomConfig: () => pingtanRoomConfig()'), 'Pingtan MultiplayerUI should inject selected map/settings into room creation');
assert(html.includes('function pingtanRoomConfig()'), 'Pingtan should centralize multiplayer map/settings room config');
assert(html.includes('function roomMapIdFromState'), 'Pingtan should resolve room map id from meta/config/gameConfig before defaulting');
assert(html.includes('gameConfig?.mapId'), 'Pingtan should recover map id from room gameConfig');
assert(html.includes('addGameStartActivityLog()'), 'Pingtan should write selected map and options to major log on game start');
assert(html.includes('function canEditGameSettings()'), 'Pingtan should gate game settings edits through one helper');
assert(html.includes('hasAnyInitialSettlement()'), 'Pingtan should lock multiplayer settings after the first initial village');
assert(html.includes('Array.isArray(forcedHexes) && forcedHexes.length'), 'empty GAME_INIT hex snapshots should fall back to generating the selected map instead of blank board');
assert(html.includes('describeMapForManual'), 'Pingtan guide should include current map-specific behavior notes');
assert(html.includes('쌍둥이 대륙') && html.includes('좁은 해협'), 'Twin Continents map should have a manual/log description');
assert(html.includes('안개 섬') && html.includes('해양 타일'), 'Fog Islands map should have a manual/log description');

console.log('PASS pingtan multiplayer map settings');

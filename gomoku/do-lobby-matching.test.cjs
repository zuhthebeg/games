const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

// gomoku DO entry must offer matching UI when no ?room: quick match / public room list / new / code.
assert(html.includes('function gomokuDOChooser'), 'must have a pre-join chooser screen');
assert(html.includes('function connectGomokuDO'), 'connect logic must be split from room choice');
assert(/explicit && explicit\.trim\(\)\) \{\s*connectGomokuDO/.test(html),
  'explicit ?room must connect directly (share link / 2-tab test) and bypass the chooser');

// Chooser wires all four entry modes onto the coordinator helpers.
const chooser = html.slice(html.indexOf('function gomokuDOChooser'), html.indexOf('function connectGomokuDO'));
assert(chooser.includes("MultiplayerWSClient.listRooms('gomoku'"), 'public room list must call listRooms');
assert(chooser.includes("MultiplayerWSClient.resolveEntryRoom('gomoku'"), 'quick match must call resolveEntryRoom');
assert(chooser.includes('MultiplayerWSClient.genRoomCode()'), 'new room must mint a shareable code');
assert(chooser.includes("data-room") && chooser.includes('.ch-room'), 'rooms must be clickable to join');
assert(/ch-quick|ch-new|ch-join|ch-refresh/.test(chooser), 'chooser must wire quick/new/join/refresh buttons');

console.log('PASS gomoku DO lobby matching UI');

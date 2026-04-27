const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(
  html.includes('.lobby-screen') && html.includes('overflow-y:auto'),
  'lobby-screen should support vertical scrolling when content exceeds viewport'
);

const roomLobbyChunkStart = html.indexOf('function renderRoomLobby()');
if (roomLobbyChunkStart === -1) throw new Error('renderRoomLobby not found');
const roomLobbyChunk = html.slice(roomLobbyChunkStart, roomLobbyChunkStart + 2400);

assert(
  roomLobbyChunk.includes('overflow-y:auto') || roomLobbyChunk.includes('max-height:'),
  'room lobby render should provide a scrollable region or bounded height for long host controls'
);

console.log('PASS lobby scroll guard');

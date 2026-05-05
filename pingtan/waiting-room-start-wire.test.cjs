const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const start = html.indexOf('pingtanMpUI._renderWaitingRoom = function(roomCode)');
if (start === -1) throw new Error('waiting room override not found');
const chunk = html.slice(start, start + 4200);

const ui = fs.readFileSync(__dirname + '/../lib/multiplayer-ui.js', 'utf8');

assert(
  ui.includes('id="mp-start-btn"') && ui.includes('data-action="start"'),
  'native waiting-room start button should exist in the shared multiplayer UI'
);

assert(
  ui.includes('this.container.querySelector(\'[data-action="start"]\').onclick = (e) => this._handleStart(e.target);'),
  'native waiting-room start button should be wired to _handleStart'
);

assert(
  ui.includes('await this.client.startGame();'),
  'native waiting-room start button should start the multiplayer game'
);

console.log('PASS waiting room start wiring');

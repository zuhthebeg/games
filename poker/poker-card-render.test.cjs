const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const script = html.match(/<script>\s*(\/\/ ===== 공용 재화 시스템 =====[\s\S]*?)<\/script>\s*<script src="\/lib\/multiplayer\.js/)[1];

const sandbox = {
  console,
  localStorage: { getItem: () => null, setItem: () => {} },
  document: {
    addEventListener: () => {},
    getElementById: () => ({ addEventListener: () => {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} }, style: {}, innerHTML: '', textContent: '' }),
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, remove: () => {} }),
    body: { appendChild: () => {} }
  },
  window: { AudioContext: function(){}, webkitAudioContext: function(){}, location: { search: '' } },
  AudioContext: function(){ this.createOscillator = () => ({ connect: () => {}, frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, start: () => {}, stop: () => {}, type: '' }); this.createGain = () => ({ connect: () => {}, gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } }); this.destination = {}; this.state = 'running'; this.currentTime = 0; this.resume = () => {}; },
  navigator: { vibrate: () => {} },
  setTimeout: () => 0,
  clearTimeout: () => {},
  fetch: async () => ({ ok: false, json: async () => ({}) }),
  alert: () => {},
  location: { href: '' },
  URLSearchParams,
};
sandbox.window.AudioContext = sandbox.AudioContext;
sandbox.window.webkitAudioContext = sandbox.AudioContext;
vm.createContext(sandbox);
vm.runInContext(script, sandbox);

const front = sandbox.renderCard({ rank: 'A', suit: '♥' });
assert(front.includes('class="card red'), 'red card should have red class');
assert(front.includes('card-top'), 'card should render top corner');
assert(front.includes('suit-center'), 'card should render center suit');
assert(front.includes('card-bottom'), 'card should render rotated bottom corner');
assert(front.includes('data-rank="A"'), 'card should expose rank data attribute');
assert(front.includes('data-suit="♥"'), 'card should expose suit data attribute');

const back = sandbox.renderCard({ rank: 'K', suit: '♠' }, true);
assert(back.includes('class="card back'), 'hidden card should render as back');
assert(!back.includes('data-rank="K"'), 'hidden card should not expose rank data');

assert(html.includes('.card.dealing'), 'dealing animation class should exist');
assert(html.includes('.card.flipping'), 'flipping animation class should exist');
assert(html.includes('.card.winner'), 'winner animation class should exist');

console.log('poker-card-render.test.cjs passed');

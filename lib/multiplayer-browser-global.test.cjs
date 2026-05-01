const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, 'multiplayer.js'), 'utf8');
const storage = new Map();
const context = {
  window: {},
  console,
  localStorage: {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  EventSource: function EventSource() {},
  setInterval,
  clearInterval,
};
context.window.localStorage = context.localStorage;
context.window.fetch = context.fetch;
context.window.EventSource = context.EventSource;

vm.runInNewContext(source, context, { filename: 'multiplayer.js' });

assert.equal(typeof context.window.MultiplayerClient, 'function', 'browser build must expose MultiplayerClient on window');
assert.equal(context.window.RELAY_URL, 'https://relay.cocy.io', 'browser build should expose relay URL for diagnostics');
assert.equal(typeof context.window.MultiplayerClient.getInstance, 'function', 'exposed client should keep static helpers');

console.log('PASS multiplayer browser global export');

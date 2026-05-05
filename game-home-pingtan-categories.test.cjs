const fs = require('fs');
const assert = require('assert');

const index = fs.readFileSync(__dirname + '/index.html', 'utf8');
const apps = JSON.parse(fs.readFileSync(__dirname + '/apps.json', 'utf8'));
const pingtan = apps.find(app => /\/pingtan\//.test(app.url || ''));

assert(pingtan, 'pingtan should exist in apps.json');
assert.equal(pingtan.badge, 'HOT', 'pingtan should appear in the popular tab via HOT badge');
assert(index.includes("multi: ['poker', 'pingtan', 'blackjack', 'connect4', 'gomoku', 'rps']"), 'home multi category should include pingtan');
assert(index.includes("board: ['pingtan', 'connect4', 'gomoku']"), 'board category should include pingtan');

console.log('PASS game home pingtan categories');

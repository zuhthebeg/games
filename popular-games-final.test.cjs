const fs = require('fs');
const assert = require('assert');

const indexHtml = fs.readFileSync(__dirname + '/index.html', 'utf8');
assert(indexHtml.includes("multi: ['poker', 'pingtan', 'blackjack', 'connect4', 'gomoku', 'rps']"), 'popular/multi config should include pingtan and blackjack');
assert(!indexHtml.includes('merge-drop'), 'merge-drop should be removed from home category config');
assert(!indexHtml.includes('pocket-sort'), 'pocket-sort should be removed from home category config');

const apps = JSON.parse(fs.readFileSync(__dirname + '/apps.json', 'utf8'));
const urls = apps.map(a => a.url || '');
assert(!urls.some(u => u.includes('/merge-drop/')), 'merge-drop should be removed from apps.json');
assert(!urls.some(u => u.includes('/pocket-sort/')), 'pocket-sort should be removed from apps.json');
assert(urls.some(u => u.includes('/blackjack/')), 'blackjack should still exist');
assert(urls.some(u => u.includes('/pingtan/')), 'pingtan should still exist');

console.log('PASS popular games final');

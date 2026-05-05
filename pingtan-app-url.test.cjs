const fs = require('fs');
const assert = require('assert');

const apps = JSON.parse(fs.readFileSync(__dirname + '/apps.json', 'utf8'));
const app = apps.find(app => app.slug === 'pingtan' || /pingtan/i.test(app.url || ''));
assert(app, 'pingtan app entry should exist in apps.json');
assert.equal(app.url, 'https://game.cocy.io/pingtan/index.html', 'pingtan app URL should point to the working index.html path');
console.log('PASS pingtan app url');

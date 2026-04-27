const fs = require('fs');
const assert = require('assert');

const apps = JSON.parse(fs.readFileSync(__dirname + '/apps.json', 'utf8'));
const catan = apps.find(app => app.slug === 'catan' || app.id === 'catan' || /catan/i.test(app.url || ''));
assert(catan, 'catan app entry should exist in apps.json');
assert.equal(catan.url, 'https://game.cocy.io/catan/index.html', 'catan app URL should point to the working index.html path');
console.log('PASS catan app url');

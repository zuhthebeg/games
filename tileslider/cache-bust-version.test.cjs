const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
assert(html.includes('style.css?v=1.0.11'), 'tileslider stylesheet version should be bumped');
assert(html.includes('script.js?v=1.0.11'), 'tileslider script version should be bumped so random image changes bypass cache');
assert(!html.includes('script.js?v=1.0.10'), 'old script cache version should not remain');

console.log('PASS tileslider cache bust version');

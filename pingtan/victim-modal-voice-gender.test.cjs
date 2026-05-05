const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('function inferVoiceFromName'), 'reaction voice should infer voice from player nickname/name');
assert(html.includes('femaleNameHints'), 'voice inference should include female nickname hints');
assert(html.includes('maleNameHints'), 'voice inference should include male nickname hints');
assert(html.includes('voice: inferVoiceFromName(base.name || base.nickname || "")'), 'makePlayer should store inferred voice from nickname/name');
assert(html.includes('return p?.voice || (idx % 2 === 0 ? "ko-male" : "ko-female")'), 'reaction voice fallback should still alternate when gender cannot be inferred');
assert(html.includes('border:2px solid ${escapeHtml(color)}'), 'victim picker should show the target player color');
assert(html.includes('background:${escapeHtml(color)}'), 'victim picker should render a player color chip');
assert(html.includes('플레이어 색상'), 'victim picker should label the color chip for accessibility');

console.log('PASS pingtan victim modal color and voice gender');

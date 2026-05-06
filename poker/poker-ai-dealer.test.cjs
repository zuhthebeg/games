const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

assert(html.includes('id="aiAvatar"'), 'AI avatar element should exist');
assert(html.includes('id="dealerBubble"'), 'dealer speech bubble element should exist');
assert(/function\s+dealerSay\s*\(/.test(html), 'dealerSay function should exist');
assert(/function\s+setAiThinking\s*\(/.test(html), 'setAiThinking function should exist');
assert(html.includes('.ai-avatar.thinking'), 'AI thinking animation class should exist');
assert(html.includes('.dealer-bubble'), 'dealer bubble CSS should exist');
assert(/dealerSay\([^)]*콜/.test(html) || /dealerSay\([^)]*레이즈/.test(html), 'AI action should trigger poker speech');

console.log('poker-ai-dealer.test.cjs passed');
